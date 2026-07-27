-- Run this in your Supabase SQL editor

ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS workshop_counter_offer_pricing JSONB;

ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS parent_estimate_id UUID REFERENCES estimates(estimate_id);

CREATE INDEX IF NOT EXISTS idx_estimates_parent
  ON estimates (parent_estimate_id)
  WHERE parent_estimate_id IS NOT NULL;
