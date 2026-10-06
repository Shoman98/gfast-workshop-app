-- ============================================================
-- Insurer Claims System - Add IDs & Link Tables
-- ============================================================

-- 1. Add insurer_id to policies (if not exists)
ALTER TABLE policies ADD COLUMN insurer_id UUID;
ALTER TABLE policies ADD COLUMN policy_id TEXT UNIQUE;

-- 2. Create insurers table
CREATE TABLE IF NOT EXISTS insurers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT UNIQUE NOT NULL,
  company_code    TEXT UNIQUE,
  email           TEXT,
  phone           TEXT,
  address         TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create drivers table
CREATE TABLE IF NOT EXISTS drivers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT,
  license_number  TEXT UNIQUE,
  dob             DATE,
  phone           TEXT,
  address         TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Add fnol_id and driver_id to fnol_reports (if not exists)
ALTER TABLE fnol_reports ADD COLUMN fnol_id TEXT UNIQUE DEFAULT concat('FNOL-', gen_random_uuid()::TEXT);
ALTER TABLE fnol_reports ADD COLUMN driver_id UUID REFERENCES drivers(id);
ALTER TABLE fnol_reports ADD COLUMN insurer_id UUID REFERENCES insurers(id);
ALTER TABLE fnol_reports ADD COLUMN broker_id UUID;

-- 5. Update claims table to link all data
ALTER TABLE claims ADD COLUMN fnol_id UUID;
ALTER TABLE claims ADD COLUMN driver_id UUID REFERENCES drivers(id);
ALTER TABLE claims ADD COLUMN insurer_id UUID REFERENCES insurers(id);
ALTER TABLE claims ADD COLUMN broker_id UUID;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_insurers_code ON insurers(company_code);
CREATE INDEX IF NOT EXISTS idx_drivers_license ON drivers(license_number);
CREATE INDEX IF NOT EXISTS idx_fnol_reports_fnol_id ON fnol_reports(fnol_id);
CREATE INDEX IF NOT EXISTS idx_fnol_reports_insurer ON fnol_reports(insurer_id);
CREATE INDEX IF NOT EXISTS idx_claims_insurer ON claims(insurer_id);
CREATE INDEX IF NOT EXISTS idx_claims_broker ON claims(broker_id);
CREATE INDEX IF NOT EXISTS idx_claims_fnol ON claims(fnol_id);
