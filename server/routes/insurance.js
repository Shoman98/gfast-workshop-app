/**
 * INSURANCE ROUTES — read-only access to confirmed estimates
 * Auth: simple company_id check (mock credentials, real Supabase data)
 */

import express from 'express';
import { supabase } from '../db/supabase.js';

const router = express.Router();

const MOCK_INSURANCE = [
  { company_id: 'ins-001', assigned_workshop_ids: ['workshop-001'] },
];

function getInsuranceUser(company_id) {
  return MOCK_INSURANCE.find(u => u.company_id.toLowerCase() === company_id?.toLowerCase()) || null;
}

/**
 * GET /api/insurance/claims?company_id=ins-001
 */
router.get('/claims', async (req, res) => {
  try {
    const { company_id } = req.query;
    const insurer = getInsuranceUser(company_id);
    if (!insurer) return res.status(401).json({ error: 'غير مصرح' });

    const { data, error } = await supabase
      .from('estimates')
      .select(`
        estimate_id,
        workshop_id,
        vehicle_year,
        vehicle_make,
        vehicle_model,
        vin_number,
        customer_name,
        customer_mobile,
        confirmed_at,
        insurance_company_id,
        status,
        insurance_action,
        insurance_comment,
        insurance_negotiated_pricing,
        insurance_part_comments,
        parent_estimate_id,
        pricing_data,
        estimate_parts (
          part_id,
          part_name_ar,
          severity_label,
          ai_original_severity,
          price,
          is_ai_detected
        )
      `)
      .eq('insurance_company_id', company_id)
      .in('status', ['confirmed', 'approved_by_insurance', 'rejected_by_insurance', 'counter_offer', 'workshop_revised', 'workshop_accepted', 'settled'])
      .order('confirmed_at', { ascending: false });

    if (error) throw error;

    // Attempt to enrich with optional columns added by migration (silently skip if not yet applied)
    let claims = data || [];
    try {
      const ids = claims.map(c => c.estimate_id);
      if (ids.length > 0) {
        const { data: extras } = await supabase
          .from('estimates')
          .select('estimate_id, workshop_counter_offer_pricing, workshop_labor_comments, workshop_part_comments, extra_images_by_workshop')
          .in('estimate_id', ids);
        if (extras) {
          const extrasMap = Object.fromEntries(extras.map(e => [e.estimate_id, e]));
          claims = claims.map(c => ({ ...c, ...(extrasMap[c.estimate_id] || {}) }));
        }
      }
    } catch { /* columns not yet added — ignore */ }

    res.json({ claims });
  } catch (err) {
    console.error('Insurance claims error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/insurance/claims/:estimateId/action
 * Record insurance decision: approved | rejected | negotiated | without_commitment
 */
router.post('/claims/:estimateId/action', async (req, res) => {
  try {
    const { estimateId } = req.params;
    const { company_id, action, comment, negotiated_pricing, part_comments } = req.body;

    const insurer = getInsuranceUser(company_id);
    if (!insurer) return res.status(401).json({ error: 'غير مصرح' });

    const validActions = ['approved', 'rejected', 'negotiated', 'without_commitment'];
    if (!validActions.includes(action)) {
      return res.status(400).json({ error: 'إجراء غير صالح' });
    }

    const statusMap = {
      approved:            'approved_by_insurance',
      rejected:            'rejected_by_insurance',
      negotiated:          'counter_offer',
      without_commitment:  'confirmed',
    };

    // Fetch current estimate to determine pricing_data update on approval
    const { data: current } = await supabase
      .from('estimates')
      .select('status, insurance_negotiated_pricing, pricing_data')
      .eq('estimate_id', estimateId)
      .single();

    const updateData = {
      status: statusMap[action],
      insurance_action: action,
      insurance_actioned_at: new Date().toISOString(),
    };

    // On approval: update pricing_data to reflect the agreed prices
    if (action === 'approved' && current) {
      let agreedPricing = null;

      if (current.status === 'workshop_accepted' && current.insurance_negotiated_pricing) {
        // Workshop accepted insurance's negotiated offer → use insurance's prices
        agreedPricing = current.insurance_negotiated_pricing;
      } else if (current.status === 'workshop_revised' && current.pricing_data) {
        // Workshop sent counter offer → pricing_data already has it, but recompute totals
        agreedPricing = current.pricing_data;
      } else if (current.pricing_data) {
        // Direct approval (no negotiation) → keep existing pricing_data
        agreedPricing = current.pricing_data;
      }

      if (agreedPricing) {
        // Always recompute totals from items to handle any missing/stale values
        const part_prices    = agreedPricing.part_prices    || [];
        const repair_groups  = agreedPricing.repair_groups  || [];
        const replace_groups = agreedPricing.replace_groups || [];
        const total_parts         = part_prices.reduce((s, p) => s + (p.price || 0), 0);
        const total_repair        = repair_groups.reduce((s, g) => s + (g.total || 0), 0);
        const total_replace_labor = replace_groups.reduce((s, g) => s + (g.total || 0), 0);

        updateData.pricing_data = {
          part_prices,
          repair_groups,
          replace_groups,
          total_parts,
          total_repair,
          total_replace_labor,
          grand_total: total_parts + total_repair + total_replace_labor,
        };
      }
    }

    if (comment)               updateData.insurance_comment = comment;
    if (negotiated_pricing)    updateData.insurance_negotiated_pricing = negotiated_pricing;
    if (part_comments?.length) updateData.insurance_part_comments = part_comments;

    const { error } = await supabase
      .from('estimates')
      .update(updateData)
      .eq('estimate_id', estimateId);

    if (error) throw error;
    res.json({ success: true, action, newStatus: statusMap[action] });
  } catch (err) {
    console.error('Insurance action error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
