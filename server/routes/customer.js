/**
 * CUSTOMER (CAR OWNER) ROUTES
 * Auth: register / login
 * Policy: upload PDF → Gemini extraction → store structured data
 */

import express from 'express';
import bcrypt from 'bcrypt';
import multer from 'multer';
import { generateCustomerToken, requireCustomer } from '../middleware/auth.js';
import { createClient } from '@supabase/supabase-js';
import pkg from '@gfast/analysis-core';
import { fromBuffer } from 'pdf2pic';
import { createWriteStream, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
const { callGeminiRaw } = pkg;

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (_, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are accepted'));
  }
});

// ── Auth ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/customer/auth/register
 */
router.post('/auth/register', async (req, res, next) => {
  try {
    const { email, password, full_name, phone, national_id } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const { data: existing } = await supabase.from('car_owners').select('id').eq('email', email.toLowerCase()).maybeSingle();
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const password_hash = await bcrypt.hash(password, 10);
    const { data: owner, error } = await supabase.from('car_owners')
      .insert({ email: email.toLowerCase(), password_hash, full_name, phone, national_id })
      .select('id, email, full_name, phone')
      .single();

    if (error) throw error;

    const token = generateCustomerToken(owner.id);
    res.json({ success: true, token, customer: owner });
  } catch (err) { next(err); }
});

/**
 * POST /api/customer/auth/login
 */
router.post('/auth/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const { data: owner } = await supabase.from('car_owners')
      .select('id, email, full_name, phone, password_hash')
      .eq('email', email.toLowerCase())
      .maybeSingle();

    if (!owner) return res.status(401).json({ error: 'Invalid email or password' });

    const valid = await bcrypt.compare(password, owner.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    const token = generateCustomerToken(owner.id);
    const { password_hash: _, ...safe } = owner;
    res.json({ success: true, token, customer: safe });
  } catch (err) { next(err); }
});

/**
 * GET /api/customer/auth/me
 */
router.get('/auth/me', requireCustomer, async (req, res, next) => {
  try {
    const { data: owner } = await supabase.from('car_owners')
      .select('id, email, full_name, phone, national_id, created_at')
      .eq('id', req.customer_id).single();
    res.json({ customer: owner });
  } catch (err) { next(err); }
});

// ── Policies ─────────────────────────────────────────────────────────────────

/**
 * GET /api/customer/policies — list customer's policies
 */
router.get('/policies', requireCustomer, async (req, res, next) => {
  try {
    const { data: policies } = await supabase.from('policies')
      .select(`id, policy_number, insurer, status, created_at, policy_data(
        policy_type, coverage_collision, coverage_theft, coverage_fire,
        coverage_glass, coverage_flood, coverage_tpl,
        vehicle_make, vehicle_model, vehicle_year, vehicle_license,
        insured_name, sum_insured, premium, deductible,
        start_date, expiry_date, car_valuation
      )`)
      .eq('owner_id', req.customer_id)
      .order('created_at', { ascending: false });
    res.json({ policies: policies || [] });
  } catch (err) { next(err); }
});

/**
 * PATCH /api/customer/policies/:id/data — manually fill in missing/incorrect fields
 */
router.patch('/policies/:id/data', requireCustomer, async (req, res, next) => {
  try {
    const { data: policy } = await supabase.from('policies')
      .select('id').eq('id', req.params.id).eq('owner_id', req.customer_id).single();
    if (!policy) return res.status(404).json({ error: 'Policy not found' });

    const { error } = await supabase.from('policy_data')
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq('policy_id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) { next(err); }
});

/**
 * GET /api/customer/policies/:id — full policy detail
 */
router.get('/policies/:id', requireCustomer, async (req, res, next) => {
  try {
    const { data: policy } = await supabase.from('policies')
      .select('*, policy_data(*)')
      .eq('id', req.params.id)
      .eq('owner_id', req.customer_id)
      .single();
    if (!policy) return res.status(404).json({ error: 'Policy not found' });
    res.json({ policy });
  } catch (err) { next(err); }
});

/**
 * POST /api/customer/policies/upload
 * Multipart: file = PDF
 * Uploads to Supabase storage, creates policy row, triggers extraction
 */
router.post('/policies/upload', requireCustomer, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'PDF file required' });

    const filename = `${req.customer_id}/${Date.now()}.pdf`;
    const { error: uploadErr } = await supabase.storage
      .from('customer-policies')
      .upload(filename, req.file.buffer, { contentType: 'application/pdf', upsert: false });
    if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`);

    const { data: signed } = await supabase.storage.from('customer-policies')
      .createSignedUrl(filename, 60 * 60 * 24 * 365);
    const pdf_url = signed?.signedUrl || filename;

    const { data: policy, error: dbErr } = await supabase.from('policies')
      .insert({ owner_id: req.customer_id, pdf_url, status: 'pending' })
      .select().single();
    if (dbErr) throw dbErr;

    // Kick off extraction async — don't block the response
    extractPolicyData(policy.id, req.customer_id, req.file.buffer).catch(err =>
      console.error(`[Policy Extract] Failed for ${policy.id}:`, err.message)
    );

    res.json({ success: true, policy_id: policy.id, status: 'extracting' });
  } catch (err) { next(err); }
});

/**
 * GET /api/customer/policies/:id/status — poll extraction status
 */
router.get('/policies/:id/status', requireCustomer, async (req, res, next) => {
  try {
    const { data: policy } = await supabase.from('policies')
      .select('id, status, error_message, policy_number, insurer')
      .eq('id', req.params.id).eq('owner_id', req.customer_id).single();
    if (!policy) return res.status(404).json({ error: 'Policy not found' });
    res.json({ policy });
  } catch (err) { next(err); }
});

// ── Extraction engine ─────────────────────────────────────────────────────────

async function extractPolicyData(policyId, ownerId, pdfBuffer) {
  await supabase.from('policies').update({ status: 'extracting' }).eq('id', policyId);

  try {
    // Convert PDF to JPEG image (Gemini supports images, not PDFs directly)
    console.log(`[PDF Extract] Converting PDF to image for ${policyId}...`);
    const tmpDir = tmpdir();
    const options = {
      density: 100,
      saveFilename: 'page',
      savePath: tmpDir,
      format: 'jpeg',
      width: 1200,
      height: 1600,
    };

    let imageBase64;
    try {
      const result = await fromBuffer(pdfBuffer, options);
      if (result && result[0]) {
        const imagePath = result[0].path;
        const fs = await import('fs').then(m => m.promises);
        const imageBuffer = await fs.readFile(imagePath);
        imageBase64 = imageBuffer.toString('base64');
        // Cleanup temp file
        rmSync(imagePath, { force: true });
      } else {
        throw new Error('No pages extracted from PDF');
      }
    } catch (pdfErr) {
      console.warn(`[PDF Extract] PDF conversion failed, using fallback: ${pdfErr.message}`);
      // Fallback: use PDF as base64 anyway (might work with some PDFs)
      imageBase64 = pdfBuffer.toString('base64');
    }

    const prompt = `You are an Arabic insurance policy data extraction specialist.

Extract ALL the following structured fields from this Egyptian car insurance policy PDF.
Return ONLY valid JSON — no markdown, no explanation.

{
  "policy_number": "string",
  "policy_type": "string (e.g. تأمين تكميلي / ضد الغير)",
  "insurer_company": "string",
  "branch": "string",
  "issue_date": "YYYY-MM-DD or null",
  "start_date": "YYYY-MM-DD or null",
  "expiry_date": "YYYY-MM-DD or null",
  "renewal_date": "YYYY-MM-DD or null",
  "installment_date": "YYYY-MM-DD or null",
  "geography": "string or null",

  "coverage_collision": true/false,
  "coverage_theft": true/false,
  "coverage_fire": true/false,
  "coverage_glass": true/false,
  "coverage_flood": true/false,
  "coverage_tpl": true/false,

  "vehicle_make": "string or null",
  "vehicle_model": "string or null",
  "vehicle_year": number or null,
  "vehicle_vin": "string or null",
  "vehicle_license": "string or null",
  "vehicle_color": "string or null",
  "car_valuation": number or null,

  "insured_name": "string or null",
  "insured_id": "string or null",
  "insured_address": "string or null",
  "driver_name": "string or null",
  "driver_license": "string or null",
  "driver_dob": "YYYY-MM-DD or null",
  "num_passengers": number or null,

  "sum_insured": number or null,
  "premium": number or null,
  "deductible": number or null,
  "limits": { "collision": number, "theft": number, "fire": number, "glass": number, "personal_accidents": number } or null,

  "exclusions": "text or null",
  "special_conditions": "text or null",
  "endorsements": "text or null",

  "prev_structural_damage": true/false/null,
  "prev_accident_repairs": true/false/null,
  "corrosion": true/false/null,
  "compromised_chassis": true/false/null,
  "prior_airbag_deployment": true/false/null,
  "poor_previous_repairs": true/false/null,

  "fraud_num_claims_per_year": number or null,
  "fraud_accident_after_issue": true/false/null,
  "fraud_accident_after_changes": true/false/null,
  "fraud_unverified_driver": true/false/null,
  "fraud_duplicate_claim": true/false/null,
  "fraud_accident_history_pattern": true/false/null,
  "fraud_date_variant": true/false/null,
  "fraud_vin_mismatch": true/false/null,
  "fraud_policyholder_mismatch": true/false/null,

  "accident_date": "ISO datetime or null",
  "accident_location": "string or null",
  "accident_vehicles_involved": "string or null",
  "accident_drivers": "string or null",
  "reported_damage": "string or null",
  "reported_injuries": "string or null",
  "police_report_exists": true/false/null,
  "police_vehicle_matches": true/false/null,
  "police_driver_matches": true/false/null,
  "police_date_matches": true/false/null,
  "police_location_matches": true/false/null,
  "police_description_consistent": true/false/null,
  "police_other_vehicle_matches": true/false/null,
  "police_damage_consistent": true/false/null
}

Set fields to null if not found in the document. Do NOT invent data.`;

    const requestBody = {
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: 'image/jpeg', data: imageBase64 } }
        ]
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 4096 }
    };

    const rawResponse = await callGeminiRaw(requestBody);
    const text = rawResponse?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    console.log(`[PDF Extract] Gemini response (first 500 chars): ${text.substring(0, 500)}`);

    // Parse JSON from response (handle markdown code blocks)
    let extracted;
    try {
      // Try 1: Extract from markdown json block (```json ... ```)
      const markdownMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (markdownMatch) {
        extracted = JSON.parse(markdownMatch[1].trim());
      } else {
        // Try 2: Extract raw JSON object
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON found in Gemini response');
        extracted = JSON.parse(jsonMatch[0]);
      }
    } catch (parseErr) {
      console.error(`[PDF Extract] JSON parse failed: ${parseErr.message}`);
      console.error(`[PDF Extract] Raw text: ${text.substring(0, 1000)}`);
      throw new Error(`Failed to parse Gemini response as JSON: ${parseErr.message}`);
    }

    // Update policy with extracted info
    await supabase.from('policies').update({
      policy_number: extracted.policy_number || null,
      insurer: extracted.insurer_company || null,
      status: 'extracted',
    }).eq('id', policyId);

    // Store full extracted data
    await supabase.from('policy_data').upsert({
      policy_id: policyId,
      owner_id: ownerId,
      ...extracted,
      raw_extraction: extracted,
      extracted_at: new Date().toISOString(),
    }, { onConflict: 'policy_id' });

    console.log(`✅ Policy extracted: ${policyId} — ${extracted.policy_number || 'no number'}`);
  } catch (err) {
    console.error(`❌ Policy extraction failed (${policyId}):`, err.message);
    await supabase.from('policies').update({
      status: 'failed',
      error_message: err.message,
    }).eq('id', policyId);
    throw err;
  }
}

export default router;
