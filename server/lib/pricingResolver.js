/**
 * SHARED PRICING RESOLVER
 * ------------------------------------------------------------------
 * The single source of truth for turning workshop-synced catalog rows +
 * field-level manual overrides into resolved pricing.
 *
 * Resolution rule (per field): resolved = COALESCE(override, catalog)
 *   - override value present (non-null) → use it, and flag the field as overridden
 *   - otherwise → use the synced catalog value
 *
 * Totals are ALWAYS computed here, never read from a stored column:
 *   total_repair_hrs = Σ(resolved hour fields)
 *   labor_cost       = total_repair_hrs × resolved hr_price_egp
 *   total_cost       = labor_cost (+ resolved part_price for 'replace')
 *
 * This module is imported by BOTH the pricing-table UI routes and the
 * estimate engine so the resolution logic is never duplicated.
 */

import { supabase } from '../db/supabase.js';

/** The nine labor-hour fields (shared by repair + replace). */
export const HOUR_FIELDS = [
  'refitting_labor_hrs',
  'dent_hrs',
  'paint_hrs',
  'elec_hrs',
  'intr_hrs',
  'cooling_hrs',
  'susp_hrs',
  'mechanical_hrs',
  'glass_hrs',
];

/** Which fields are user-editable (and therefore overridable) per pricing type. */
export function overrideFields(pricingType) {
  const base = [...HOUR_FIELDS, 'hr_price_egp'];
  return pricingType === 'replace' ? [...base, 'part_price'] : base;
}

function tableNames(pricingType) {
  return pricingType === 'replace'
    ? { catalog: 'replace_catalog', overrides: 'replace_overrides' }
    : { catalog: 'repair_catalog', overrides: 'repair_overrides' };
}

/** Composite identity of a row: part + vehicle. `year` may be null/''. */
export function rowKey(r) {
  return [r.part_id, r.vehicle_make, r.vehicle_model, r.vehicle_year ?? ''].join('|');
}

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Merge one catalog row with its (optional) override row into a resolved row.
 * Pure function — no I/O — so it is trivially unit-testable and reused everywhere.
 */
export function resolveRow(catalogRow, overrideRow, pricingType) {
  const fields = overrideFields(pricingType);
  const resolved = { ...catalogRow };
  const overridden = {}; // field → true when a manual override is in effect

  for (const f of fields) {
    const ov = overrideRow ? overrideRow[f] : null;
    if (ov !== null && ov !== undefined) {
      resolved[f] = ov;
      overridden[f] = true;
    }
  }

  const totalHrs = HOUR_FIELDS.reduce((s, f) => s + (Number(resolved[f]) || 0), 0);
  const hrPrice = Number(resolved.hr_price_egp) || 0;
  const laborCost = totalHrs * hrPrice;
  const partPrice = pricingType === 'replace' ? (Number(resolved.part_price) || 0) : 0;

  return {
    ...resolved,
    overridden,                       // { field: true } — drives the UI override indicator
    total_repair_hrs: round2(totalHrs),
    labor_cost: round2(laborCost),
    part_price_resolved: round2(partPrice),
    total_cost: round2(laborCost + partPrice),
  };
}

/**
 * Resolve a full set of pricing rows for one workshop + pricing type.
 * Used by the pricing-table UI (with UI filters) AND by the estimate engine
 * (passing part_ids + a specific vehicle).
 *
 * @param {object}  args
 * @param {string}  args.workshop_id
 * @param {'repair'|'replace'} args.pricing_type
 * @param {object}  [args.filters]  { vehicle_make, vehicle_model, vehicle_year,
 *                                    part_id, part_ids[], part_number, part_name }
 * @returns {Promise<Array>} resolved rows (see resolveRow)
 */
export async function resolvePricing({ workshop_id, pricing_type, filters = {} }) {
  const { catalog, overrides } = tableNames(pricing_type);

  // ---- catalog (supports all filters, incl. text search on name/number) ----
  let cq = supabase.from(catalog).select('*').eq('workshop_id', workshop_id);
  if (filters.vehicle_make)  cq = cq.eq('vehicle_make', filters.vehicle_make);
  if (filters.vehicle_model) cq = cq.eq('vehicle_model', filters.vehicle_model);
  if (filters.vehicle_year)  cq = cq.eq('vehicle_year', filters.vehicle_year);
  if (filters.part_id)       cq = cq.eq('part_id', filters.part_id);
  if (Array.isArray(filters.part_ids) && filters.part_ids.length) cq = cq.in('part_id', filters.part_ids);
  if (filters.part_number)   cq = cq.ilike('part_number', `%${filters.part_number}%`);
  if (filters.part_name)     cq = cq.or(`part_name_ar.ilike.%${filters.part_name}%,part_name_en.ilike.%${filters.part_name}%`);

  const { data: catalogRows, error: cErr } = await cq;
  if (cErr) throw cErr;
  if (!catalogRows || catalogRows.length === 0) return [];

  // ---- overrides (keyed the same way; name/number filters don't apply here) ----
  let oq = supabase.from(overrides).select('*').eq('workshop_id', workshop_id);
  if (filters.vehicle_make)  oq = oq.eq('vehicle_make', filters.vehicle_make);
  if (filters.vehicle_model) oq = oq.eq('vehicle_model', filters.vehicle_model);
  if (filters.vehicle_year)  oq = oq.eq('vehicle_year', filters.vehicle_year);
  if (filters.part_id)       oq = oq.eq('part_id', filters.part_id);
  if (Array.isArray(filters.part_ids) && filters.part_ids.length) oq = oq.in('part_id', filters.part_ids);

  const { data: overrideRows, error: oErr } = await oq;
  if (oErr) throw oErr;

  const ovrMap = {};
  (overrideRows || []).forEach((o) => { ovrMap[rowKey(o)] = o; });

  return catalogRows.map((c) => resolveRow(c, ovrMap[rowKey(c)], pricing_type));
}
