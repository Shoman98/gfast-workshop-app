-- =====================================================================
-- G-Fast Broker / FNOL Flow — Migration
-- Run against the shared Supabase project.
-- Idempotent: all CREATE TABLE … IF NOT EXISTS + ADD COLUMN IF NOT EXISTS.
-- =====================================================================

-- 1. Brokers (company accounts that send customers to workshops)
CREATE TABLE IF NOT EXISTS brokers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  company       text NOT NULL,
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  -- short public token embedded in the customer link (/broker/fnol/:link_token)
  link_token    text NOT NULL UNIQUE DEFAULT substr(md5(random()::text), 1, 12),
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 2. FNOL reports — one per customer submission
CREATE TABLE IF NOT EXISTS fnol_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id       uuid NOT NULL REFERENCES brokers(id),
  vin             text NOT NULL,
  vehicle_license text,                            -- license/plate number
  vehicle_license_photo text,                      -- photo of the plate (mandatory in FNOL form)
  customer_mobile text,
  location        text,
  vehicle_make    text,
  vehicle_model   text,
  vehicle_year    int,
  general_images  text[] NOT NULL DEFAULT '{}',   -- Cloudinary URLs
  damage_images   text[] NOT NULL DEFAULT '{}',   -- Cloudinary URLs
  doc_urls        text[] NOT NULL DEFAULT '{}',   -- Supabase Storage URLs
  analysis_result jsonb,
  report_url      text,
  status          text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted','booked','assessed')),
  submitted_at    timestamptz NOT NULL DEFAULT now(),
  booking_at      timestamptz,
  assessment_at   timestamptz
);

-- Backfill for already-migrated databases.
ALTER TABLE fnol_reports ADD COLUMN IF NOT EXISTS vehicle_license text;
ALTER TABLE fnol_reports ADD COLUMN IF NOT EXISTS vehicle_license_photo text;
ALTER TABLE fnol_reports ADD COLUMN IF NOT EXISTS video_url text;

CREATE INDEX IF NOT EXISTS fnol_reports_broker_idx ON fnol_reports(broker_id);
CREATE INDEX IF NOT EXISTS fnol_reports_vin_idx    ON fnol_reports(vin);

-- 3. Broker cases — tracks the 3-stage journey per VIN
CREATE TABLE IF NOT EXISTS broker_cases (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id     uuid NOT NULL REFERENCES brokers(id),
  fnol_id       uuid NOT NULL REFERENCES fnol_reports(id) UNIQUE,
  vin           text NOT NULL,
  booking_id    uuid REFERENCES consumer_bookings(id),  -- set after booking; FK enables PostgREST embed
  stage         text NOT NULL DEFAULT 'fnol'
    CHECK (stage IN ('fnol','booked','assessed')),
  assessment_notes   text,
  assessment_estimate numeric,
  assessment_url      text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS broker_cases_broker_idx ON broker_cases(broker_id);
CREATE INDEX IF NOT EXISTS broker_cases_vin_idx    ON broker_cases(vin);

-- 4. Extend consumer_bookings to carry the FNOL source
ALTER TABLE consumer_bookings
  ADD COLUMN IF NOT EXISTS fnol_id uuid REFERENCES fnol_reports(id);

-- 5. Supabase Storage bucket for FNOL uploads (photos, plate photo, documents).
--    Private bucket; the backend uses the service role key and hands out 1-year
--    signed URLs, so no client-facing RLS policy is required.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('broker-docs', 'broker-docs', false, 104857600)   -- 100 MB (photos, docs, claim video)
ON CONFLICT (id) DO UPDATE SET file_size_limit = EXCLUDED.file_size_limit;

-- 6. Seed the first real broker: Amenli
--    Portal login: amenli@amenli.com  /  Amenli@2026
--    Customer link: https://gfast.it.com/broker/fnol/amenli
INSERT INTO brokers (name, company, email, password_hash, link_token, is_active)
VALUES (
  'Amenli',
  'Amenli Insurance',
  'amenli@amenli.com',
  '$2b$10$zl5qeLtXgM00OYnQWjmG/ud1K5SByPpqXzuyMzNBpOMB9Pubyj.h6',  -- bcrypt of Amenli@2026
  'amenli',
  true
)
ON CONFLICT (email) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      link_token    = EXCLUDED.link_token,
      is_active     = true;
