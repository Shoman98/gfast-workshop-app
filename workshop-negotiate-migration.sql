-- ============================================================
-- Run this in your Supabase SQL editor (Dashboard → SQL Editor)
-- ============================================================

-- Workshop counter-offer pricing submitted during negotiation
ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS workshop_counter_offer_pricing JSONB;

-- Workshop labor & part comments submitted during negotiation
ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS workshop_labor_comments JSONB;

ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS workshop_part_comments JSONB;

-- Extra images uploaded by the workshop during negotiation
ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS extra_images_by_workshop JSONB;

-- After running, go to Supabase → API Settings → Reload schema cache
-- (or wait ~60 seconds for it to auto-reload)
