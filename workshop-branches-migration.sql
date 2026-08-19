-- ══════════════════════════════════════════════════════════════
-- Workshop Branches Migration
-- Adds multi-branch support to the workshops system
-- ══════════════════════════════════════════════════════════════

-- 1. Create workshop_branches table
CREATE TABLE IF NOT EXISTS workshop_branches (
  branch_id    TEXT PRIMARY KEY,
  workshop_id  TEXT NOT NULL REFERENCES workshops(workshop_id) ON DELETE CASCADE,
  branch_name  TEXT NOT NULL,
  city         TEXT,
  phone        TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workshop_branches_workshop_id ON workshop_branches(workshop_id);

-- 2. Add branch_id to consumer_bookings
ALTER TABLE consumer_bookings ADD COLUMN IF NOT EXISTS branch_id TEXT REFERENCES workshop_branches(branch_id);

CREATE INDEX IF NOT EXISTS idx_consumer_bookings_branch_id ON consumer_bookings(branch_id);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE workshop_branches ENABLE ROW LEVEL SECURITY;

-- Service-role (server) can do everything
CREATE POLICY "service_role_all" ON workshop_branches
  FOR ALL USING (true);
