-- ============================================================================
-- WORKSHOP ACCOUNTS MIGRATION
-- Adds a shared "owner account" layer: one account (username + PIN) can own
-- multiple separate workshops. On login the owner picks which workshop to open.
-- Each workshop keeps its own bookings / estimates / UI (scoped by workshop_id).
--
-- Run this once in the Supabase SQL editor (Dashboard → SQL → New query).
-- Idempotent: safe to run multiple times.
-- ============================================================================

-- 1. Owner accounts (shared credentials that group several workshops)
CREATE TABLE IF NOT EXISTS workshop_accounts (
  account_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username     VARCHAR(100) UNIQUE NOT NULL,
  pin_hash     VARCHAR(255) NOT NULL,           -- bcrypt hash of the shared PIN
  display_name VARCHAR(255),
  is_active    BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Link workshops to an owner account (nullable → existing workshops unaffected)
ALTER TABLE workshops
  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES workshop_accounts(account_id);

CREATE INDEX IF NOT EXISTS idx_workshops_account_id ON workshops(account_id);

-- 3. "New" flag — when TRUE, marketplace/booking cards show a "جديد / New" pill
--    instead of stars + review quote (for service centers with no reviews yet).
ALTER TABLE workshops
  ADD COLUMN IF NOT EXISTS is_new BOOLEAN DEFAULT FALSE;

-- ----------------------------------------------------------------------------
-- Provisioning is handled by scripts/create-account.mjs (bcrypt-hashes the PIN,
-- creates the account + the two workshops, and links them). No manual seed here.
-- ----------------------------------------------------------------------------
