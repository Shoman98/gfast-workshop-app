// Mirror of server/lib/bookingStatuses.js — booking lifecycle for the UI.
export const CANCELLATION_REASONS = ['السعر', 'الوقت', 'غير مهتم'] as const

export type BookingStatusMeta = {
  key: string; ar: string; en: string; order?: number
  hasReport?: boolean; needsReason?: boolean; color: string; bg: string
}

// Ordered progress-bar stages (customer-facing timeline)
export const PROGRESS_STATUSES: BookingStatusMeta[] = [
  { key: 'booked',           ar: 'تم الحجز',      en: 'Booked',           order: 1, color: '#1d4ed8', bg: '#eff6ff' },
  { key: 'visited',          ar: 'تمت الزيارة',   en: 'Visited',          order: 2, color: '#7c3aed', bg: '#f5f3ff' },
  { key: 'quoting',          ar: 'التقدير',       en: 'Quoting',          order: 3, hasReport: true, color: '#c2410c', bg: '#fff7ed' },
  { key: 'dent',             ar: 'سمكرة',         en: 'Dent',             order: 4, color: '#b45309', bg: '#fffbeb' },
  { key: 'paint',            ar: 'دهان',          en: 'Paint',            order: 5, color: '#0e7490', bg: '#ecfeff' },
  { key: 'finish',           ar: 'تشطيب',         en: 'Finishing',        order: 6, color: '#4338ca', bg: '#eef2ff' },
  { key: 'ready_to_deliver', ar: 'جاهزة للتسليم', en: 'Ready to deliver', order: 7, color: '#15803d', bg: '#f0fdf4' },
]

// Side states outside the linear bar
export const SIDE_STATUSES: BookingStatusMeta[] = [
  { key: 'supplementary',                    ar: 'تقدير إضافي',                           en: 'Supplementary',                     hasReport: true,  color: '#0369a1', bg: '#f0f9ff' },
  { key: 'contacted_no_answer',              ar: 'تم التواصل و لم يتم الرد',              en: 'Contacted – no answer',              color: '#92400e', bg: '#fffbeb' },
  { key: 'contacted_not_interested_price',   ar: 'تم التواصل و غير مهتم بسبب الاسعار',   en: 'Contacted – not interested (price)', color: '#b91c1c', bg: '#fef2f2' },
  { key: 'contacted_not_interested_service', ar: 'تم التواصل و غير مهتم بالخدمه',        en: 'Contacted – not interested (service)', color: '#7e22ce', bg: '#faf5ff' },
  { key: 'contacted_later_appointment',      ar: 'تم التواصل و الاتفاق علي معاد اخر',    en: 'Contacted – later appointment',      color: '#0369a1', bg: '#f0f9ff' },
]

export const ALL_STATUSES = [...PROGRESS_STATUSES, ...SIDE_STATUSES]

// Map legacy rows onto the new lifecycle for display.
export const LEGACY_ALIAS: Record<string, string> = {
  pending: 'booked', contacted: 'booked', confirmed: 'booked', completed: 'ready_to_deliver',
}

export function statusMeta(status: string): BookingStatusMeta {
  const key = LEGACY_ALIAS[status] || status
  return ALL_STATUSES.find(s => s.key === key) || { key, ar: status, en: status, color: '#374151', bg: '#f3f4f6' }
}
