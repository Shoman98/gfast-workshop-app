-- ============================================================
-- Claims & Triage Migration
-- ============================================================

-- 1. Claims
CREATE TABLE IF NOT EXISTS claims (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID REFERENCES car_owners(id) ON DELETE CASCADE,
  policy_id       UUID REFERENCES policies(id) ON DELETE CASCADE,
  claim_type      TEXT NOT NULL CHECK (claim_type IN ('accident','theft','fire','flood')),
  status          TEXT NOT NULL DEFAULT 'reported'
                  CHECK (status IN ('reported','triaging','valid','not_valid','needs_docs','rejected','approved')),
  description     TEXT,
  accident_date   DATE,
  accident_location TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Claim triage results
CREATE TABLE IF NOT EXISTS claim_triage (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id        UUID REFERENCES claims(id) ON DELETE CASCADE,
  owner_id        UUID REFERENCES car_owners(id) ON DELETE CASCADE,

  -- Overall verdict
  verdict         TEXT CHECK (verdict IN ('valid','not_valid','needs_more_info')),
  verdict_summary TEXT,

  -- Coverage checks
  check_policy_valid        BOOLEAN,
  check_vehicle_match       BOOLEAN,
  check_claim_type_covered  BOOLEAN,
  check_accident_date       BOOLEAN,
  check_geography           BOOLEAN,
  check_deductible_note     TEXT,
  check_exclusions          TEXT,
  check_driver_verified     BOOLEAN,

  -- Fraud signals
  fraud_num_claims          INT,
  fraud_after_issue         BOOLEAN,
  fraud_after_changes       BOOLEAN,
  fraud_unverified_driver   BOOLEAN,
  fraud_duplicate           BOOLEAN,
  fraud_history_pattern     BOOLEAN,
  fraud_date_variant        BOOLEAN,
  fraud_vin_mismatch        BOOLEAN,
  fraud_holder_mismatch     BOOLEAN,
  fraud_risk_level          TEXT CHECK (fraud_risk_level IN ('low','medium','high')),

  -- Police report cross-check
  police_report_matches     BOOLEAN,
  police_notes              TEXT,

  -- Ineligibility reasons (JSONB array of objects)
  -- Each: { reason_code, reason_ar, required_doc, required_doc_ar, status: 'pending'|'resolved'|'unresolvable' }
  ineligibility_reasons     JSONB DEFAULT '[]',

  -- Image confidence
  image_confidence          TEXT CHECK (image_confidence IN ('sufficient','low','request_more')),
  image_notes               TEXT,

  raw_triage                JSONB,
  triaged_at                TIMESTAMPTZ DEFAULT NOW(),
  created_at                TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Documents uploaded to resolve ineligibility reasons
CREATE TABLE IF NOT EXISTS claim_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id        UUID REFERENCES claims(id) ON DELETE CASCADE,
  owner_id        UUID REFERENCES car_owners(id) ON DELETE CASCADE,
  reason_code     TEXT NOT NULL,   -- matches ineligibility_reasons[].reason_code
  document_type   TEXT,
  file_url        TEXT NOT NULL,
  notes           TEXT,
  status          TEXT DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
  uploaded_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_claims_owner    ON claims(owner_id);
CREATE INDEX IF NOT EXISTS idx_claims_policy   ON claims(policy_id);
CREATE INDEX IF NOT EXISTS idx_triage_claim    ON claim_triage(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_docs      ON claim_documents(claim_id);
