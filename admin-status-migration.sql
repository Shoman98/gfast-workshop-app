-- Add admin_status column to consumer_bookings
-- This is a separate CRM-tracking field for the G-Fast admin team.
-- It is completely independent of the workshop-facing `status` column.
ALTER TABLE consumer_bookings
  ADD COLUMN IF NOT EXISTS admin_status text;
