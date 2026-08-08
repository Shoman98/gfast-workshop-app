-- ============================================================================
-- Workshop Pricing Sync — schema
-- Twin tables per pricing type: *_catalog (synced via CSV) + *_overrides
-- (field-level manual edits). Resolution = COALESCE(override, catalog) per
-- field at read time. Totals (total_repair_hrs / total cost) are NEVER stored
-- as columns — always computed from the resolved hour fields.
-- Multi-tenant: everything scoped by workshop_id (one workshop today).
-- Vehicle keyed by make+model+year strings, matching labor_rates_* tables.
-- ============================================================================

-- ---------- 1. CSV COLUMN MAPPINGS (admin-only, one-time onboarding) ----------
CREATE TABLE IF NOT EXISTS csv_column_mappings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id   TEXT NOT NULL,
  pricing_type  TEXT NOT NULL CHECK (pricing_type IN ('repair','replace')),
  mapping       JSONB NOT NULL,          -- { "<workshop CSV header>": "<our_schema_field>", ... }
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (workshop_id, pricing_type)
);

-- ---------- 2. REPAIR: catalog (synced) + overrides (manual, field-level) ----------
CREATE TABLE IF NOT EXISTS repair_catalog (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id   TEXT NOT NULL,
  part_id       TEXT NOT NULL,
  part_number   TEXT,
  part_name_ar  TEXT,
  part_name_en  TEXT,
  vehicle_make  TEXT NOT NULL,
  vehicle_model TEXT NOT NULL,
  vehicle_year  TEXT,
  refitting_labor_hrs NUMERIC,
  dent_hrs      NUMERIC,
  paint_hrs     NUMERIC,
  elec_hrs      NUMERIC,
  intr_hrs      NUMERIC,
  cooling_hrs   NUMERIC,
  susp_hrs      NUMERIC,
  mechanical_hrs NUMERIC,
  glass_hrs     NUMERIC,
  hr_price_egp  NUMERIC,
  synced_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (workshop_id, part_id, vehicle_make, vehicle_model, vehicle_year)
);

CREATE TABLE IF NOT EXISTS repair_overrides (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id   TEXT NOT NULL,
  part_id       TEXT NOT NULL,
  vehicle_make  TEXT NOT NULL,
  vehicle_model TEXT NOT NULL,
  vehicle_year  TEXT,
  -- every field nullable: NULL = "no override on this field, use catalog value"
  refitting_labor_hrs NUMERIC,
  dent_hrs      NUMERIC,
  paint_hrs     NUMERIC,
  elec_hrs      NUMERIC,
  intr_hrs      NUMERIC,
  cooling_hrs   NUMERIC,
  susp_hrs      NUMERIC,
  mechanical_hrs NUMERIC,
  glass_hrs     NUMERIC,
  hr_price_egp  NUMERIC,
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (workshop_id, part_id, vehicle_make, vehicle_model, vehicle_year)
);

-- ---------- 3. REPLACE: same twins + part_price ----------
CREATE TABLE IF NOT EXISTS replace_catalog (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id   TEXT NOT NULL,
  part_id       TEXT NOT NULL,
  part_number   TEXT,
  part_name_ar  TEXT,
  part_name_en  TEXT,
  vehicle_make  TEXT NOT NULL,
  vehicle_model TEXT NOT NULL,
  vehicle_year  TEXT,
  refitting_labor_hrs NUMERIC,
  dent_hrs      NUMERIC,
  paint_hrs     NUMERIC,
  elec_hrs      NUMERIC,
  intr_hrs      NUMERIC,
  cooling_hrs   NUMERIC,
  susp_hrs      NUMERIC,
  mechanical_hrs NUMERIC,
  glass_hrs     NUMERIC,
  hr_price_egp  NUMERIC,
  part_price    NUMERIC,               -- replace-only
  synced_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (workshop_id, part_id, vehicle_make, vehicle_model, vehicle_year)
);

CREATE TABLE IF NOT EXISTS replace_overrides (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id   TEXT NOT NULL,
  part_id       TEXT NOT NULL,
  vehicle_make  TEXT NOT NULL,
  vehicle_model TEXT NOT NULL,
  vehicle_year  TEXT,
  refitting_labor_hrs NUMERIC,
  dent_hrs      NUMERIC,
  paint_hrs     NUMERIC,
  elec_hrs      NUMERIC,
  intr_hrs      NUMERIC,
  cooling_hrs   NUMERIC,
  susp_hrs      NUMERIC,
  mechanical_hrs NUMERIC,
  glass_hrs     NUMERIC,
  hr_price_egp  NUMERIC,
  part_price    NUMERIC,               -- replace-only
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (workshop_id, part_id, vehicle_make, vehicle_model, vehicle_year)
);

-- ---------- 4. UNMAPPED ITEMS QUEUE (validation failures → admin review) ----------
CREATE TABLE IF NOT EXISTS unmapped_items_queue (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id   TEXT NOT NULL,
  pricing_type  TEXT NOT NULL CHECK (pricing_type IN ('repair','replace')),
  raw_row       JSONB NOT NULL,        -- the offending CSV row exactly as uploaded
  reason        TEXT NOT NULL,         -- e.g. "unmapped vehicle model", "non-numeric price", "unknown part_id"
  row_number    INTEGER,               -- 1-based line in the uploaded file (excl. header)
  resolved      BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ---------- 5. STEP-UP AUTH: admin-generated single-use access codes ----------
-- One authorized user per workshop (workshops.can_manage_pricing). An admin
-- pre-generates codes; the user redeems one to open a short-lived pricing
-- session. Codes are stored hashed and marked consumed on first use.
ALTER TABLE workshops ADD COLUMN IF NOT EXISTS can_manage_pricing BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS pricing_access_codes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id  TEXT NOT NULL,
  code_hash    TEXT NOT NULL,          -- bcrypt hash of the single-use code
  label        TEXT,                   -- optional admin note (who it was issued to)
  expires_at   TIMESTAMPTZ,            -- NULL = never expires
  consumed_at  TIMESTAMPTZ,            -- set on first successful redemption
  consumed_ip  TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pricing_codes_ws ON pricing_access_codes (workshop_id, consumed_at);

ALTER TABLE pricing_access_codes ENABLE ROW LEVEL SECURITY;

-- ---------- indexes ----------
CREATE INDEX IF NOT EXISTS idx_repair_cat_lookup   ON repair_catalog   (workshop_id, part_id, vehicle_make, vehicle_model);
CREATE INDEX IF NOT EXISTS idx_repair_ovr_lookup   ON repair_overrides (workshop_id, part_id, vehicle_make, vehicle_model);
CREATE INDEX IF NOT EXISTS idx_replace_cat_lookup  ON replace_catalog  (workshop_id, part_id, vehicle_make, vehicle_model);
CREATE INDEX IF NOT EXISTS idx_replace_ovr_lookup  ON replace_overrides(workshop_id, part_id, vehicle_make, vehicle_model);
CREATE INDEX IF NOT EXISTS idx_unmapped_ws         ON unmapped_items_queue (workshop_id, resolved);

-- ---------- RLS (scoping enforced in API via req.workshop_id; service role bypasses) ----------
ALTER TABLE csv_column_mappings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair_catalog        ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair_overrides      ENABLE ROW LEVEL SECURITY;
ALTER TABLE replace_catalog       ENABLE ROW LEVEL SECURITY;
ALTER TABLE replace_overrides     ENABLE ROW LEVEL SECURITY;
ALTER TABLE unmapped_items_queue  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "svc read csv_column_mappings"  ON csv_column_mappings  FOR SELECT USING (true);
CREATE POLICY "svc read repair_catalog"       ON repair_catalog       FOR SELECT USING (true);
CREATE POLICY "svc read repair_overrides"     ON repair_overrides     FOR SELECT USING (true);
CREATE POLICY "svc read replace_catalog"      ON replace_catalog      FOR SELECT USING (true);
CREATE POLICY "svc read replace_overrides"    ON replace_overrides    FOR SELECT USING (true);
CREATE POLICY "svc read unmapped_items_queue" ON unmapped_items_queue FOR SELECT USING (true);
