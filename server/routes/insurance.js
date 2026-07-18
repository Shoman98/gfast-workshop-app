/**
 * INSURANCE ROUTES — read-only access to confirmed estimates
 * Auth: simple company_id header check (mock, not Supabase for now)
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
 * Returns confirmed estimates for the insurer's assigned workshops,
 * with all parts including ai_original_severity for diff flagging.
 */
router.get('/claims', async (req, res) => {
  try {
    const { company_id } = req.query;
    const insurer = getInsuranceUser(company_id);

    if (!insurer) {
      return res.status(401).json({ error: 'غير مصرح' });
    }

    const { data, error } = await supabase
      .from('estimates')
      .select(`
        estimate_id,
        workshop_id,
        vehicle_year,
        vehicle_make,
        vehicle_model,
        confirmed_at,
        insurance_company_id,
        estimate_parts (
          part_id,
          part_name_en,
          part_name_ar,
          damage_type,
          severity_label,
          ai_original_severity,
          price,
          is_ai_detected
        )
      `)
      .in('workshop_id', insurer.assigned_workshop_ids)
      .eq('status', 'confirmed')
      .eq('insurance_company_id', company_id)
      .order('confirmed_at', { ascending: false });

    if (error) throw error;

    res.json({ claims: data || [] });
  } catch (err) {
    console.error('Insurance claims error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
