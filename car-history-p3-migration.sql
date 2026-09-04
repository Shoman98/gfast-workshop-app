-- ============================================================================
-- CAR HISTORY — Phase 3 (working days)
-- Per-workshop open weekdays, set by the admin. Used to constrain the consumer
-- booking date picker. Stored as a JSON array of weekday indices that are OPEN
-- (0 = Sunday … 6 = Saturday). NULL/empty = open every day (no restriction).
-- Run once in the Supabase SQL editor. Idempotent.
-- ============================================================================
alter table workshops
  add column if not exists working_days jsonb;
