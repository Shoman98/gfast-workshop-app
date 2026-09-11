-- Google reviews: store a Google Place ID per workshop so the consumer app can
-- fetch and show that workshop's Google reviews in an in-app popup.
-- Apply in Supabase SQL editor.

ALTER TABLE workshops ADD COLUMN IF NOT EXISTS google_place_id TEXT;

COMMENT ON COLUMN workshops.google_place_id IS
  'Google Maps Place ID (e.g. ChIJ...). Used to fetch up to 5 Google reviews via the Places API.';
