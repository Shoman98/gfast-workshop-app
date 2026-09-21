/**
 * BROKER IN-MEMORY STORE (local/mock mode)
 * Shared between routes/broker.js and routes/public.js so a consumer booking
 * can advance the broker case even before the Supabase tables exist.
 *
 * Once the DB migration is run, these become a no-op fallback.
 */

export const MOCK_BROKERS = [
  { id: 'broker-001', name: 'Ahmed Hassan',  company: 'AlAhly Insurance', email: 'ahmed@alahly.com', password: 'test1234', link_token: 'alahly-fnol-link' },
  { id: 'broker-002', name: 'Fatima Mohamed', company: 'Misr Insurance',   email: 'fatima@misr.com',  password: 'test1234', link_token: 'misr-fnol-link' },
];

export const MOCK_FNOL_REPORTS = new Map();   // fnolId → fnol report
export const MOCK_BROKER_CASES = new Map();   // caseId → broker case

export function getMockBrokerByCreds(email, password) {
  const b = MOCK_BROKERS.find(u => u.email.toLowerCase() === email?.toLowerCase());
  return (b && b.password === password) ? b : null;
}

/**
 * Advance a mock broker case to "booked" and attach the workshop + date.
 * Returns the { fnol, case, broker } involved, or null if the FNOL isn't a mock one.
 */
export function linkBookingToMockFnol(fnolId, booking) {
  const fnol = MOCK_FNOL_REPORTS.get(fnolId);
  if (!fnol) return null;

  const now = new Date().toISOString();
  fnol.status = 'booked';
  fnol.booking_at = now;

  const brokerCase = [...MOCK_BROKER_CASES.values()].find(c => c.fnol_id === fnolId);
  if (brokerCase) {
    brokerCase.stage = 'booked';
    brokerCase.booking_id = booking.booking_id || null;
    brokerCase.booking = {
      id: booking.booking_id || null,
      status: booking.status || 'new_booking',
      scheduled_date: booking.scheduled_date || null,
      created_at: now,
      workshop: {
        workshop_id: booking.workshop_id || null,
        workshop_name: booking.workshop_name || null,
        display_name: booking.workshop_display_name || null,
        city: booking.city || null,
      },
      branch: booking.branch_name ? { branch_name: booking.branch_name } : null,
    };
    brokerCase.updated_at = now;
  }

  const broker = MOCK_BROKERS.find(b => b.id === fnol.broker_id) || null;
  return { fnol, case: brokerCase, broker };
}

/**
 * Advance a mock broker case to "assessed" when a workshop confirms an estimate
 * for the SAME VIN. Attaches the confirmed report (link + estimate + notes).
 * Returns { fnol, case, broker } for the matched VIN, or null if no broker case
 * exists for that VIN (i.e. the estimate isn't tied to a broker FNOL).
 */
export function linkAssessmentToMockFnol(vin, assessment) {
  const key = String(vin || '').trim().toUpperCase();
  if (!key) return null;

  // Most recent case for this VIN
  const brokerCase = [...MOCK_BROKER_CASES.values()]
    .filter(c => c.vin === key)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
  if (!brokerCase) return null;

  const now = new Date().toISOString();
  const fnol = MOCK_FNOL_REPORTS.get(brokerCase.fnol_id);
  if (fnol) { fnol.status = 'assessed'; fnol.assessment_at = now; }

  brokerCase.stage = 'assessed';
  brokerCase.assessment_estimate = assessment.estimate ?? null;
  brokerCase.assessment_url = assessment.report_url || null;
  brokerCase.assessment_notes = assessment.notes || null;
  brokerCase.assessment_estimate_id = assessment.estimate_id || null;
  brokerCase.updated_at = now;

  const broker = MOCK_BROKERS.find(b => b.id === brokerCase.broker_id) || null;
  return { fnol, case: brokerCase, broker };
}
