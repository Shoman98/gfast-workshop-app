/**
 * Shared booking-status lifecycle for the car-history feature.
 * Mirrored (labels/order) in both frontends' small status maps.
 */
import { supabase } from '../db/supabase.js';

export const CANCELLATION_REASONS = ['السعر', 'الوقت', 'غير مهتم'];

// Ordered progress-bar stages (the customer-facing timeline)
export const PROGRESS_STATUSES = [
  { key: 'booked',           ar: 'تم الحجز',      en: 'Booked',           order: 1 },
  { key: 'visited',          ar: 'تمت الزيارة',   en: 'Visited',          order: 2 },
  { key: 'quoting',          ar: 'التقدير',       en: 'Quoting',          order: 3, hasReport: true },
  { key: 'dent',             ar: 'سمكرة',         en: 'Dent',             order: 4 },
  { key: 'paint',            ar: 'دهان',          en: 'Paint',            order: 5 },
  { key: 'finish',           ar: 'تشطيب',         en: 'Finishing',        order: 6 },
  { key: 'ready_to_deliver', ar: 'جاهزة للتسليم', en: 'Ready to deliver', order: 7 },
];

// Side states outside the linear bar
export const SIDE_STATUSES = [
  { key: 'supplementary', ar: 'تقدير إضافي', en: 'Supplementary', hasReport: true },
  { key: 'cancelled',     ar: 'ملغي',        en: 'Cancelled',     needsReason: true },
];

export const ALL_STATUSES = [...PROGRESS_STATUSES, ...SIDE_STATUSES];
export const STATUS_KEYS = ALL_STATUSES.map(s => s.key);

// Map pre-existing (legacy) rows onto the new lifecycle for display.
export const LEGACY_STATUS_ALIAS = {
  pending: 'booked',
  contacted: 'booked',
  confirmed: 'booked',
  completed: 'ready_to_deliver',
};

export function isValidStatus(status) {
  return STATUS_KEYS.includes(status);
}

/**
 * Update a booking's status and append a dated history row (one source of truth
 * for the progress bar). Reused by every status-change path.
 */
export async function recordBookingStatus(bookingId, status, { changed_by = 'system', changed_by_id = null, cancellation_reason = null, estimate_id = null } = {}) {
  const bookingUpdate = { status };
  if (cancellation_reason !== null) bookingUpdate.cancellation_reason = cancellation_reason;
  if (estimate_id !== null) bookingUpdate.estimate_id = estimate_id;

  const { error: upErr } = await supabase
    .from('consumer_bookings')
    .update(bookingUpdate)
    .eq('id', bookingId);
  if (upErr) throw upErr;

  const { error: histErr } = await supabase
    .from('booking_status_history')
    .insert({ booking_id: bookingId, status, changed_by, changed_by_id, cancellation_reason, estimate_id });
  if (histErr) throw histErr;
}
