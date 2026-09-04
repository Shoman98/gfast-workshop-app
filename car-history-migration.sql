-- ============================================================================
-- CAR HISTORY & BOOKING LIFECYCLE — Phase 1
-- Adds a dated status-history timeline, an appointment date, and links each
-- workshop assessment (estimate) back to the booking that produced it.
-- Run once in the Supabase SQL editor. Idempotent.
-- ============================================================================

-- 1. Dated status history — single source of truth for the progress bar.
CREATE TABLE IF NOT EXISTS booking_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES consumer_bookings(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  changed_by TEXT,                 -- 'workshop' | 'admin' | 'customer' | 'system'
  changed_by_id TEXT,              -- workshop_id / admin identifier when known
  cancellation_reason TEXT,        -- set when status = 'cancelled'
  estimate_id UUID,                -- attribution for 'quoting' / 'supplementary'
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bsh_booking ON booking_status_history(booking_id);

-- 2. Booking: appointment date + assessment attribution + cancel reason.
ALTER TABLE consumer_bookings
  ADD COLUMN IF NOT EXISTS scheduled_date DATE,
  ADD COLUMN IF NOT EXISTS estimate_id UUID,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- 3. Estimate: link back to the booking it was created for.
ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS booking_id UUID REFERENCES consumer_bookings(id);
CREATE INDEX IF NOT EXISTS idx_estimates_booking ON estimates(booking_id);
