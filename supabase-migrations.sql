-- ============================================================================
-- WORKSHOP APP SCHEMA - Run this in Supabase SQL Editor
-- ============================================================================
-- Creates the workshop_app schema with tables for authentication, estimates,
-- and audit logging. Uses Row-Level Security (RLS) for multi-tenancy.

-- 1. Create schema
CREATE SCHEMA IF NOT EXISTS workshop_app;

-- 2. Workshops table (user accounts - manually created by admin)
CREATE TABLE IF NOT EXISTS workshop_app.workshops (
  workshop_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_name VARCHAR(255) NOT NULL,
  pin_hash VARCHAR(255) NOT NULL, -- bcrypt hash of PIN
  category VARCHAR(100), -- e.g., "bodywork", "mechanical", "mixed"
  phone VARCHAR(20),
  email VARCHAR(255),
  city VARCHAR(100),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(workshop_name)
);

-- 3. Estimates table (draft and confirmed estimates)
CREATE TABLE IF NOT EXISTS workshop_app.estimates (
  estimate_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES workshop_app.workshops(workshop_id) ON DELETE CASCADE,

  -- Vehicle info
  vehicle_year INT,
  vehicle_make VARCHAR(100),
  vehicle_model VARCHAR(100),

  -- Status: "draft", "confirmed", "exported"
  status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'exported')),

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  confirmed_at TIMESTAMP WITH TIME ZONE,
  exported_at TIMESTAMP WITH TIME ZONE,

  -- Metadata
  total_cost_min INT DEFAULT 0,
  total_cost_max INT DEFAULT 0,
  notes TEXT,

  INDEX idx_workshop_id (workshop_id),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
);

-- 4. Estimate parts (damage items - AI-detected and manually added)
CREATE TABLE IF NOT EXISTS workshop_app.estimate_parts (
  estimate_part_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id UUID NOT NULL REFERENCES workshop_app.estimates(estimate_id) ON DELETE CASCADE,

  -- Part identification
  part_name_en VARCHAR(255) NOT NULL,
  part_name_ar VARCHAR(255),
  part_id VARCHAR(50), -- Reference to PARTS_DATABASE (e.g., "PT_0001")

  -- Damage info
  damage_type VARCHAR(100),
  confidence FLOAT, -- 0-1, NULL if manually added

  -- Severity & Price (editable by workshop)
  severity_label VARCHAR(50) NOT NULL CHECK (severity_label IN ('Repair', 'Replace')),
  price INT DEFAULT 0, -- EGP

  -- Track AI vs manual
  is_ai_detected BOOLEAN DEFAULT TRUE,

  -- Audit trail
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  edited_at TIMESTAMP WITH TIME ZONE,

  INDEX idx_estimate_id (estimate_id),
  INDEX idx_is_ai_detected (is_ai_detected)
);

-- 5. Estimate edits audit log (track all changes)
CREATE TABLE IF NOT EXISTS workshop_app.estimate_edits (
  edit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_part_id UUID REFERENCES workshop_app.estimate_parts(estimate_part_id) ON DELETE CASCADE,
  estimate_id UUID REFERENCES workshop_app.estimates(estimate_id) ON DELETE CASCADE,

  -- What changed
  field_name VARCHAR(100) NOT NULL, -- e.g., "severity_label", "price", "part_name_en"
  old_value TEXT, -- JSON string of old value
  new_value TEXT, -- JSON string of new value

  -- When & who
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  changed_by_workshop_id UUID REFERENCES workshop_app.workshops(workshop_id),

  INDEX idx_estimate_part_id (estimate_part_id),
  INDEX idx_estimate_id (estimate_id),
  INDEX idx_changed_at (changed_at)
);

-- 6. Enable Row-Level Security
ALTER TABLE workshop_app.workshops ENABLE ROW LEVEL SECURITY;
ALTER TABLE workshop_app.estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE workshop_app.estimate_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE workshop_app.estimate_edits ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies - Workshops can only see their own data

-- Workshops: Only workshop_id matches can read their own row
CREATE POLICY "Workshops can read own data" ON workshop_app.workshops
  FOR SELECT USING (workshop_id = auth.uid());

-- Estimates: Only workshop members can read their estimates
CREATE POLICY "Workshops can read own estimates" ON workshop_app.estimates
  FOR SELECT USING (workshop_id = auth.uid());

-- Estimate Parts: Only workshop members can read/edit their parts
CREATE POLICY "Workshops can manage own estimate parts" ON workshop_app.estimate_parts
  FOR ALL USING (
    estimate_id IN (
      SELECT estimate_id FROM workshop_app.estimates
      WHERE workshop_id = auth.uid()
    )
  );

-- Estimate Edits: Only workshop members can read/write their audit log
CREATE POLICY "Workshops can access own audit logs" ON workshop_app.estimate_edits
  FOR ALL USING (
    estimate_id IN (
      SELECT estimate_id FROM workshop_app.estimates
      WHERE workshop_id = auth.uid()
    )
  );

-- ============================================================================
-- HELPER FUNCTION: Automatically log estimate part edits
-- ============================================================================
CREATE OR REPLACE FUNCTION workshop_app.log_estimate_edit()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Log each changed field
    IF OLD.severity_label != NEW.severity_label THEN
      INSERT INTO workshop_app.estimate_edits
        (estimate_part_id, estimate_id, field_name, old_value, new_value, changed_by_workshop_id)
      SELECT
        NEW.estimate_part_id,
        NEW.estimate_id,
        'severity_label',
        OLD.severity_label,
        NEW.severity_label,
        (SELECT workshop_id FROM workshop_app.estimates WHERE estimate_id = NEW.estimate_id)
      ;
    END IF;

    IF OLD.price != NEW.price THEN
      INSERT INTO workshop_app.estimate_edits
        (estimate_part_id, estimate_id, field_name, old_value, new_value, changed_by_workshop_id)
      SELECT
        NEW.estimate_part_id,
        NEW.estimate_id,
        'price',
        OLD.price::TEXT,
        NEW.price::TEXT,
        (SELECT workshop_id FROM workshop_app.estimates WHERE estimate_id = NEW.estimate_id)
      ;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER estimate_parts_audit_trigger
AFTER UPDATE ON workshop_app.estimate_parts
FOR EACH ROW
EXECUTE FUNCTION workshop_app.log_estimate_edit();

-- ============================================================================
-- NOTES FOR SUPABASE RLS
-- ============================================================================
-- The RLS policies above use auth.uid() which requires Supabase Auth.
-- For workshop login with workshop_id + PIN:
-- 1. You need to create custom JWT tokens in the backend
-- 2. Pass the workshop_id in the JWT subject (sub)
-- 3. Use auth.uid() = workshop_id in RLS policies
--
-- Alternatively, use Supabase Postgres functions to validate PIN and return
-- a custom token. See backend code for implementation.
