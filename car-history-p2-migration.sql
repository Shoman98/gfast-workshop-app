-- ============================================================================
-- CAR HISTORY — Phase 2 (customer profile)
-- Registry of a customer's vehicles (keyed by mobile) so the profile can list
-- vehicles that have no booking yet and support "+ add another vehicle".
-- Run once in the Supabase SQL editor. Idempotent.
-- ============================================================================
CREATE TABLE IF NOT EXISTS customer_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mobile TEXT NOT NULL,
  make TEXT,
  model TEXT,
  year TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (mobile, make, model, year)
);
CREATE INDEX IF NOT EXISTS idx_customer_vehicles_mobile ON customer_vehicles(mobile);
