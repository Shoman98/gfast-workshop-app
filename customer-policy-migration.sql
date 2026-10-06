-- ============================================================
-- Car Owner + Policy Data Migration
-- ============================================================

-- 1. Car owners (auth)
CREATE TABLE IF NOT EXISTS car_owners (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name     TEXT,
  phone         TEXT,
  national_id   TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Uploaded policies (one per PDF)
CREATE TABLE IF NOT EXISTS policies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID REFERENCES car_owners(id) ON DELETE CASCADE,
  policy_number TEXT,
  insurer       TEXT,
  pdf_url       TEXT,
  status        TEXT DEFAULT 'pending' CHECK (status IN ('pending','extracting','extracted','failed')),
  error_message TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Extracted structured policy data
CREATE TABLE IF NOT EXISTS policy_data (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id  UUID REFERENCES policies(id) ON DELETE CASCADE,
  owner_id   UUID REFERENCES car_owners(id) ON DELETE CASCADE,

  -- ── Policy Info ────────────────────────────────────────────
  policy_number        TEXT,
  policy_type          TEXT,
  insurer_company      TEXT,
  branch               TEXT,
  issue_date           DATE,
  start_date           DATE,
  expiry_date          DATE,
  renewal_date         DATE,
  installment_date     DATE,
  geography            TEXT,

  -- ── Coverage ───────────────────────────────────────────────
  coverage_collision   BOOLEAN,
  coverage_theft       BOOLEAN,
  coverage_fire        BOOLEAN,
  coverage_glass       BOOLEAN,
  coverage_flood       BOOLEAN,
  coverage_tpl         BOOLEAN,       -- Third Party Liability

  -- ── Vehicle ────────────────────────────────────────────────
  vehicle_make         TEXT,
  vehicle_model        TEXT,
  vehicle_year         INT,
  vehicle_vin          TEXT,
  vehicle_license      TEXT,
  vehicle_color        TEXT,
  car_valuation        NUMERIC,

  -- ── Insured / Driver ───────────────────────────────────────
  insured_name         TEXT,
  insured_id           TEXT,
  insured_address      TEXT,
  driver_name          TEXT,
  driver_license       TEXT,
  driver_dob           DATE,
  num_passengers       INT,

  -- ── Financial ──────────────────────────────────────────────
  sum_insured          NUMERIC,
  premium              NUMERIC,
  deductible           NUMERIC,
  limits               JSONB,         -- { collision: x, theft: x, ... }

  -- ── Terms ──────────────────────────────────────────────────
  exclusions           TEXT,
  special_conditions   TEXT,
  endorsements         TEXT,

  -- ── Previous Damage (Car Status) ───────────────────────────
  prev_structural_damage    BOOLEAN,
  prev_accident_repairs     BOOLEAN,
  corrosion                 BOOLEAN,
  compromised_chassis       BOOLEAN,
  prior_airbag_deployment   BOOLEAN,
  poor_previous_repairs     BOOLEAN,

  -- ── Fraud Signals ──────────────────────────────────────────
  fraud_num_claims_per_year     INT,
  fraud_accident_after_issue    BOOLEAN,
  fraud_accident_after_changes  BOOLEAN,
  fraud_unverified_driver       BOOLEAN,
  fraud_duplicate_claim         BOOLEAN,
  fraud_accident_history_pattern BOOLEAN,
  fraud_date_variant            BOOLEAN,
  fraud_vin_mismatch            BOOLEAN,
  fraud_policyholder_mismatch   BOOLEAN,

  -- ── Police Report / Accident ───────────────────────────────
  accident_date                 TIMESTAMPTZ,
  accident_location             TEXT,
  accident_vehicles_involved    TEXT,
  accident_drivers              TEXT,
  reported_damage               TEXT,
  reported_injuries             TEXT,
  police_report_exists          BOOLEAN,
  police_vehicle_matches        BOOLEAN,
  police_driver_matches         BOOLEAN,
  police_date_matches           BOOLEAN,
  police_location_matches       BOOLEAN,
  police_description_consistent BOOLEAN,
  police_other_vehicle_matches  BOOLEAN,
  police_damage_consistent      BOOLEAN,

  -- ── Raw ────────────────────────────────────────────────────
  raw_extraction  JSONB,
  extracted_at    TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_policies_owner      ON policies(owner_id);
CREATE INDEX IF NOT EXISTS idx_policy_data_policy  ON policy_data(policy_id);
CREATE INDEX IF NOT EXISTS idx_policy_data_owner   ON policy_data(owner_id);
