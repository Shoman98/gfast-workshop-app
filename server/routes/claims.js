/**
 * CLAIMS ROUTES - Report claim, run triage, upload counter-docs
 */

import express from 'express';
import multer from 'multer';
import { requireCustomer } from '../middleware/auth.js';
import { createClient } from '@supabase/supabase-js';
import pkg from '@gfast/analysis-core';
const { callGeminiRaw } = pkg;

const router = express.Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

// ── Report Claim ──────────────────────────────────────────────────────────

/**
 * POST /api/claims/report
 * Create a new claim for a policy
 */
router.post('/report', requireCustomer, async (req, res, next) => {
  try {
    const { policy_id, claim_type, description, accident_date, accident_location } = req.body;
    if (!policy_id || !claim_type) return res.status(400).json({ error: 'policy_id and claim_type required' });
    if (!['accident', 'theft', 'fire', 'flood'].includes(claim_type))
      return res.status(400).json({ error: 'Invalid claim_type' });

    // Verify policy belongs to customer
    const { data: policy } = await supabase.from('policies')
      .select('id').eq('id', policy_id).eq('owner_id', req.customer_id).single();
    if (!policy) return res.status(404).json({ error: 'Policy not found' });

    const { data: claim, error } = await supabase.from('claims')
      .insert({
        owner_id: req.customer_id,
        policy_id,
        claim_type,
        description,
        accident_date,
        accident_location,
        status: 'reported',
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, claim_id: claim.id });
  } catch (err) { next(err); }
});

/**
 * GET /api/claims - List customer's claims
 */
router.get('/', requireCustomer, async (req, res, next) => {
  try {
    const { data: claims } = await supabase.from('claims')
      .select('*, claim_triage(verdict, ineligibility_reasons)')
      .eq('owner_id', req.customer_id)
      .order('created_at', { ascending: false });
    res.json({ claims: claims || [] });
  } catch (err) { next(err); }
});

/**
 * GET /api/claims/:id - Get claim detail + triage
 */
router.get('/:id', requireCustomer, async (req, res, next) => {
  try {
    const { data: claim } = await supabase.from('claims')
      .select('*, policy_data:policy_id(policy_data(*)), claim_triage(*), claim_documents(*)')
      .eq('id', req.params.id)
      .eq('owner_id', req.customer_id)
      .single();
    if (!claim) return res.status(404).json({ error: 'Claim not found' });
    res.json({ claim });
  } catch (err) { next(err); }
});

// ── Triage ───────────────────────────────────────────────────────────────

/**
 * POST /api/claims/:id/triage
 * Run full triage: cross-check policy + claim details
 * Body: { fnol_description, has_police_report, image_confidence }
 */
router.post('/:id/triage', requireCustomer, async (req, res, next) => {
  try {
    const { fnol_description, has_police_report, image_confidence } = req.body;

    const { data: claim } = await supabase.from('claims')
      .select('*, policy_data:policy_id(policy_data(*))')
      .eq('id', req.params.id)
      .eq('owner_id', req.customer_id)
      .single();
    if (!claim) return res.status(404).json({ error: 'Claim not found' });

    await supabase.from('claims').update({ status: 'triaging' }).eq('id', req.params.id);

    const pd = claim.policy_data?.[0];
    if (!pd) throw new Error('Policy data not found');

    // Build triage prompt for Gemini
    const prompt = `You are a comprehensive insurance claim triage engine.
Analyze the claim against the policy and cross-check all eligibility criteria.
Return ONLY valid JSON — no markdown, no explanation.

**Policy Context:**
- Policy Type: ${pd.policy_type}
- Status: ${pd.expiry_date ? (new Date(pd.expiry_date) > new Date() ? 'Active' : 'Expired') : 'Unknown'}
- Expiry Date: ${pd.expiry_date}
- Vehicle: ${pd.vehicle_year} ${pd.vehicle_make} ${pd.vehicle_model}
- Vehicle VIN: ${pd.vehicle_vin}
- Insured Name: ${pd.insured_name}
- Geography: ${pd.geography}
- Previous Claims/Year: ${pd.fraud_num_claims_per_year || 0}
- Previous Accidents: ${pd.prev_accident_repairs ? 'Yes' : 'No'}
- Prior Structural Damage: ${pd.prev_structural_damage ? 'Yes' : 'No'}
- Compromised Chassis: ${pd.compromised_chassis ? 'Yes' : 'No'}
- Prior Airbag Deployment: ${pd.prior_airbag_deployment ? 'Yes' : 'No'}

**Coverage Flags:**
- Collision: ${pd.coverage_collision ? 'Yes' : 'No'}
- Theft: ${pd.coverage_theft ? 'Yes' : 'No'}
- Fire: ${pd.coverage_fire ? 'Yes' : 'No'}
- Flood: ${pd.coverage_flood ? 'Yes' : 'No'}
- TPL: ${pd.coverage_tpl ? 'Yes' : 'No'}

**Claim Details:**
- Claim Type: ${claim.claim_type}
- Accident Date: ${claim.accident_date}
- Description: ${fnol_description || claim.description}
- Police Report: ${has_police_report ? 'Yes' : 'No'}
- Image Confidence: ${image_confidence || 'unknown'}

**Fraud Signals in Policy:**
- Accident After Issue: ${pd.fraud_accident_after_issue ? 'Yes' : 'No'}
- Accident After Changes: ${pd.fraud_accident_after_changes ? 'Yes' : 'No'}
- Unverified Driver: ${pd.fraud_unverified_driver ? 'Yes' : 'No'}
- Duplicate Claim: ${pd.fraud_duplicate_claim ? 'Yes' : 'No'}
- History Pattern: ${pd.fraud_accident_history_pattern ? 'Yes' : 'No'}
- Date Variant: ${pd.fraud_date_variant ? 'Yes' : 'No'}
- VIN Mismatch: ${pd.fraud_vin_mismatch ? 'Yes' : 'No'}
- Holder Mismatch: ${pd.fraud_policyholder_mismatch ? 'Yes' : 'No'}

**Exclusions:** ${pd.exclusions || 'None listed'}

Return JSON:
{
  "verdict": "valid" | "not_valid" | "needs_more_info",
  "verdict_summary": "short human-readable summary",
  "check_policy_valid": true/false,
  "check_vehicle_match": true/false,
  "check_claim_type_covered": true/false,
  "check_accident_date": true/false (within policy period),
  "check_geography": true/false,
  "check_driver_verified": true/false,
  "check_deductible_note": "amount or null",
  "check_exclusions": "applies or null",
  "fraud_risk_level": "low" | "medium" | "high",
  "police_report_matches": true/false/null,
  "police_notes": "observations or null",
  "image_confidence": "sufficient" | "low" | "request_more",
  "image_notes": "assessment or null",
  "ineligibility_reasons": [
    { "reason_code": "policy_expired", "reason_ar": "الوثيقة منتهية الصلاحية", "required_doc": "renewed_policy", "required_doc_ar": "وثيقة تجديد", "status": "pending" },
    ...
  ]
}

**Possible ineligibility codes:**
- policy_expired: customer must upload renewed policy
- vehicle_not_covered: vehicle mismatch - customer uploads registration/VIN
- exclusion_applies: specific exclusion - may be unresolvable
- driver_not_verified: customer uploads driver license
- accident_outside_geography: mismatch - may be unresolvable
- claim_type_not_covered: policy doesn't cover this type - unresolvable
- high_fraud_risk: pattern detected - escalate to manual review`;

    const requestBody = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 2048 }
    };

    const rawResponse = await callGeminiRaw(requestBody);
    const text = rawResponse?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in Gemini response');
    const triageResult = JSON.parse(jsonMatch[0]);

    // Store triage results
    const { data: triage, error } = await supabase.from('claim_triage')
      .insert({
        claim_id: req.params.id,
        owner_id: req.customer_id,
        verdict: triageResult.verdict,
        verdict_summary: triageResult.verdict_summary,
        check_policy_valid: triageResult.check_policy_valid,
        check_vehicle_match: triageResult.check_vehicle_match,
        check_claim_type_covered: triageResult.check_claim_type_covered,
        check_accident_date: triageResult.check_accident_date,
        check_geography: triageResult.check_geography,
        check_driver_verified: triageResult.check_driver_verified,
        check_deductible_note: triageResult.check_deductible_note,
        check_exclusions: triageResult.check_exclusions,
        fraud_risk_level: triageResult.fraud_risk_level,
        police_report_matches: triageResult.police_report_matches,
        police_notes: triageResult.police_notes,
        ineligibility_reasons: triageResult.ineligibility_reasons || [],
        image_confidence: triageResult.image_confidence,
        image_notes: triageResult.image_notes,
        raw_triage: triageResult,
      })
      .select()
      .single();

    if (error) throw error;

    // Update claim status based on verdict
    const newStatus = triageResult.verdict === 'valid' ? 'valid'
      : triageResult.ineligibility_reasons?.length > 0 ? 'needs_docs' : 'not_valid';
    await supabase.from('claims').update({ status: newStatus }).eq('id', req.params.id);

    res.json({ triage, verdict: triageResult.verdict, ineligibility_reasons: triageResult.ineligibility_reasons });
  } catch (err) { next(err); }
});

// ── Counter-Documents ────────────────────────────────────────────────────

/**
 * POST /api/claims/:id/documents
 * Upload document to resolve an ineligibility reason
 * Body: FormData with file + reason_code + document_type
 */
router.post('/:id/documents', requireCustomer, upload.single('file'), async (req, res, next) => {
  try {
    const { reason_code, document_type, notes } = req.body;
    if (!reason_code || !req.file) return res.status(400).json({ error: 'reason_code and file required' });

    const { data: claim } = await supabase.from('claims')
      .select('id').eq('id', req.params.id).eq('owner_id', req.customer_id).single();
    if (!claim) return res.status(404).json({ error: 'Claim not found' });

    const filename = `${req.customer_id}/${req.params.id}/${Date.now()}-${req.file.originalname}`;
    const { error: uploadErr } = await supabase.storage
      .from('claim-documents')
      .upload(filename, req.file.buffer, { contentType: req.file.mimetype });
    if (uploadErr) throw uploadErr;

    const { data: signed } = await supabase.storage
      .from('claim-documents')
      .createSignedUrl(filename, 60 * 60 * 24 * 365);

    const { data: doc, error } = await supabase.from('claim_documents')
      .insert({
        claim_id: req.params.id,
        owner_id: req.customer_id,
        reason_code,
        document_type,
        file_url: signed?.signedUrl || filename,
        notes,
        status: 'pending',
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, document_id: doc.id });
  } catch (err) { next(err); }
});

/**
 * GET /api/claims/:id/documents - List documents uploaded for this claim
 */
router.get('/:id/documents', requireCustomer, async (req, res, next) => {
  try {
    const { data: docs } = await supabase.from('claim_documents')
      .select('*')
      .eq('claim_id', req.params.id)
      .eq('owner_id', req.customer_id);
    res.json({ documents: docs || [] });
  } catch (err) { next(err); }
});

/**
 * POST /api/claims/:id/recheck
 * Re-run eligibility after uploading counter-docs
 */
router.post('/:id/recheck', requireCustomer, async (req, res, next) => {
  try {
    const { data: claim } = await supabase.from('claims')
      .select('*, claim_triage(*), claim_documents(*)')
      .eq('id', req.params.id)
      .eq('owner_id', req.customer_id)
      .single();
    if (!claim) return res.status(404).json({ error: 'Claim not found' });

    const triage = claim.claim_triage?.[0];
    const docs = claim.claim_documents || [];

    // Update ineligibility_reasons with resolved status based on uploaded docs
    let updatedReasons = triage.ineligibility_reasons || [];
    updatedReasons = updatedReasons.map(r => {
      const hasDoc = docs.some(d => d.reason_code === r.reason_code && d.status === 'pending');
      return {
        ...r,
        status: hasDoc ? 'pending_review' : r.status,
      };
    });

    // In production, this would re-run Gemini with the new docs
    // For now, mark as needing review
    await supabase.from('claim_triage')
      .update({ ineligibility_reasons: updatedReasons })
      .eq('id', triage.id);

    await supabase.from('claims').update({ status: 'needs_docs' }).eq('id', req.params.id);

    res.json({ success: true, updated_reasons: updatedReasons });
  } catch (err) { next(err); }
});

// ── Insurer/Broker Claims ────────────────────────────────────────────────

/**
 * POST /api/claims/from-fnol
 * Create claim from FNOL submission for insurer/broker view
 * Body: { fnol_id, fnol_data, policy_id, policy_data, driver_id, driver_data, insurer_id, broker_id }
 */
router.post('/from-fnol', async (req, res, next) => {
  try {
    const { fnol_id, fnol_data, policy_id, policy_data, driver_id, driver_data, insurer_id, broker_id } = req.body;
    if (!fnol_id || !insurer_id) return res.status(400).json({ error: 'fnol_id and insurer_id required' });

    // Create driver if needed
    let driver_id_final = driver_id;
    if (driver_data && !driver_id) {
      const { data: driver, error: dErr } = await supabase.from('drivers')
        .insert({ name: driver_data.name, license_number: driver_data.license, dob: driver_data.dob })
        .select().single();
      if (!dErr && driver) driver_id_final = driver.id;
    }

    // Create claim
    const { data: claim, error } = await supabase.from('claims')
      .insert({
        fnol_id,
        policy_id,
        driver_id: driver_id_final,
        insurer_id,
        broker_id,
        claim_type: fnol_data?.claim_type || 'accident',
        description: fnol_data?.description,
        status: 'reported',
      })
      .select()
      .single();

    if (error) throw error;

    // Store FNOL + policy + driver data as JSON
    await supabase.from('claims')
      .update({
        raw_fnol_data: fnol_data,
        raw_policy_data: policy_data,
        raw_driver_data: driver_data,
      })
      .eq('id', claim.id);

    res.json({ success: true, claim_id: claim.id });
  } catch (err) { next(err); }
});

/**
 * GET /api/insurer/:insurer_id/claims - List claims for insurer
 */
router.get('/insurer/:insurer_id/claims', async (req, res, next) => {
  try {
    const { data: claims } = await supabase.from('claims')
      .select('*, claim_triage(verdict, ineligibility_reasons)')
      .eq('insurer_id', req.params.insurer_id)
      .order('created_at', { ascending: false });
    res.json({ claims: claims || [] });
  } catch (err) { next(err); }
});

/**
 * GET /api/broker/:broker_id/claims - List claims for broker
 */
router.get('/broker/:broker_id/claims', async (req, res, next) => {
  try {
    const { data: claims } = await supabase.from('claims')
      .select('*, claim_triage(verdict, ineligibility_reasons)')
      .eq('broker_id', req.params.broker_id)
      .order('created_at', { ascending: false });
    res.json({ claims: claims || [] });
  } catch (err) { next(err); }
});

/**
 * GET /api/claims/detail/:id - Full claim detail with FNOL + policy + fraud + driver + police
 */
router.get('/detail/:id', async (req, res, next) => {
  try {
    const { data: claim } = await supabase.from('claims')
      .select(`
        *,
        policy_data(*),
        driver:driver_id(*),
        claim_triage(*),
        claim_documents(*)
      `)
      .eq('id', req.params.id)
      .single();
    if (!claim) return res.status(404).json({ error: 'Claim not found' });
    res.json({ claim });
  } catch (err) { next(err); }
});

export default router;
