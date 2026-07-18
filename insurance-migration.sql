-- Run this in your Supabase SQL editor before using the Insurance role

ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS insurance_company_id TEXT;

ALTER TABLE estimate_parts
  ADD COLUMN IF NOT EXISTS ai_original_severity TEXT;

-- Optional index for faster insurance claims queries
CREATE INDEX IF NOT EXISTS idx_estimates_insurance_company
  ON estimates (insurance_company_id)
  WHERE insurance_company_id IS NOT NULL;
