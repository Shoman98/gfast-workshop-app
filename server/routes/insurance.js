/**
 * INSURANCE ROUTES — read-only access to confirmed estimates
 * Auth: simple company_id check (mock, not Supabase for now)
 * Data: mock claims for testing — swap to Supabase query after running insurance-migration.sql
 */

import express from 'express';

const router = express.Router();

const MOCK_INSURANCE = [
  { company_id: 'ins-001', assigned_workshop_ids: ['workshop-001'] },
];

function getInsuranceUser(company_id) {
  return MOCK_INSURANCE.find(u => u.company_id.toLowerCase() === company_id?.toLowerCase()) || null;
}

const MOCK_CLAIMS = [
  {
    estimate_id: 'est-mock-001',
    workshop_id: 'workshop-001',
    vehicle_year: 2021,
    vehicle_make: 'تويوتا',
    vehicle_model: 'كامري',
    confirmed_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    insurance_company_id: 'ins-001',
    estimate_parts: [
      { part_id: 'p1', part_name_en: 'Front Bumper', part_name_ar: 'الصدام الأمامي', damage_type: 'Scratch', severity_label: 'Replace', ai_original_severity: 'Repair', price: 1200, is_ai_detected: true },
      { part_id: 'p2', part_name_en: 'Hood', part_name_ar: 'الغطاء الأمامي', damage_type: 'Dent', severity_label: 'Repair', ai_original_severity: 'Repair', price: 800, is_ai_detected: true },
      { part_id: 'p3', part_name_en: 'Headlight Left', part_name_ar: 'المصباح الأمامي الأيسر', damage_type: 'Broken', severity_label: 'Replace', ai_original_severity: 'Replace', price: 950, is_ai_detected: true },
      { part_id: 'p4', part_name_en: 'Windshield', part_name_ar: 'الزجاج الأمامي', damage_type: 'Crack', severity_label: 'Replace', ai_original_severity: null, price: 1500, is_ai_detected: false },
    ],
  },
  {
    estimate_id: 'est-mock-002',
    workshop_id: 'workshop-001',
    vehicle_year: 2019,
    vehicle_make: 'هيونداي',
    vehicle_model: 'النترا',
    confirmed_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    insurance_company_id: 'ins-001',
    estimate_parts: [
      { part_id: 'p5', part_name_en: 'Rear Bumper', part_name_ar: 'الصدام الخلفي', damage_type: 'Dent', severity_label: 'Repair', ai_original_severity: 'Repair', price: 700, is_ai_detected: true },
      { part_id: 'p6', part_name_en: 'Trunk Lid', part_name_ar: 'غطاء الصندوق', damage_type: 'Dent', severity_label: 'Repair', ai_original_severity: 'Repair', price: 600, is_ai_detected: true },
      { part_id: 'p7', part_name_en: 'Tail Light Right', part_name_ar: 'المصباح الخلفي الأيمن', damage_type: 'Broken', severity_label: 'Replace', ai_original_severity: 'Replace', price: 450, is_ai_detected: true },
    ],
  },
  {
    estimate_id: 'est-mock-003',
    workshop_id: 'workshop-001',
    vehicle_year: 2023,
    vehicle_make: 'كيا',
    vehicle_model: 'سيراتو',
    confirmed_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    insurance_company_id: 'ins-001',
    estimate_parts: [
      { part_id: 'p8', part_name_en: 'Door Front Left', part_name_ar: 'الباب الأمامي الأيسر', damage_type: 'Dent', severity_label: 'Replace', ai_original_severity: 'Repair', price: 2200, is_ai_detected: true },
      { part_id: 'p9', part_name_en: 'Side Mirror Left', part_name_ar: 'مرآة الجانب الأيسر', damage_type: 'Broken', severity_label: 'Replace', ai_original_severity: 'Replace', price: 380, is_ai_detected: true },
      { part_id: 'p10', part_name_en: 'Fender Left', part_name_ar: 'الرفرف الأيسر', damage_type: 'Scratch', severity_label: 'Repair', ai_original_severity: 'Repair', price: 550, is_ai_detected: true },
      { part_id: 'p11', part_name_en: 'A-Pillar Left', part_name_ar: 'العمود الأيسر الأمامي', damage_type: 'Deformation', severity_label: 'Replace', ai_original_severity: null, price: 1800, is_ai_detected: false },
    ],
  },
];

/**
 * GET /api/insurance/claims?company_id=ins-001
 */
router.get('/claims', (req, res) => {
  const { company_id } = req.query;
  const insurer = getInsuranceUser(company_id);
  if (!insurer) return res.status(401).json({ error: 'غير مصرح' });

  const claims = MOCK_CLAIMS.filter(c => c.insurance_company_id === company_id);
  res.json({ claims });
});

export default router;
