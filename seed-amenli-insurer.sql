-- ============================================================
-- Seed Amenli Insurer & Link Sample Policies
-- ============================================================

-- 1. Create Amenli insurer
INSERT INTO insurers (name, company_code, email, phone, address)
VALUES ('أميلي للتأمين', 'AMENLI-001', 'claims@amenli.com', '+20 2 XXXX XXXX', 'القاهرة - مصر')
ON CONFLICT (name) DO NOTHING;

-- 2. Get Amenli ID (you'll use this in your application)
-- Run this query to get the ID:
-- SELECT id FROM insurers WHERE company_code = 'AMENLI-001';

-- 3. Link sample policies to Amenli (update first 5 policies)
UPDATE policies
SET insurer_id = (SELECT id FROM insurers WHERE company_code = 'AMENLI-001')
WHERE id IN (
  SELECT id FROM policies LIMIT 5
);

-- 4. View Amenli's policies
SELECT
  p.id,
  p.policy_number,
  p.insurer,
  pd.vehicle_make,
  pd.vehicle_model,
  pd.insured_name,
  i.name as insurer_name
FROM policies p
LEFT JOIN policy_data pd ON p.id = pd.policy_id
LEFT JOIN insurers i ON p.insurer_id = i.id
WHERE p.insurer_id = (SELECT id FROM insurers WHERE company_code = 'AMENLI-001')
ORDER BY p.created_at DESC;
