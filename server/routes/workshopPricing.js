/**
 * WORKSHOP PRICING SYNC ROUTES
 * ------------------------------------------------------------------
 * Read resolved pricing, edit/reset individual field overrides (saved
 * immediately — no resync step), and bulk-sync via CSV upload validated
 * against the admin-configured column mapping.
 *
 * All routes are scoped to req.workshop_id (set by authenticate).
 * NOTE: step-up auth (single-use access code) is NOT wired here yet —
 * pending the code-issuance decision. These routes currently sit behind
 * the normal `authenticate` middleware.
 */

import express from 'express';
import bcrypt from 'bcrypt';
import { supabase } from '../db/supabase.js';
import { authenticate, requirePricingScope, generatePricingToken } from '../middleware/auth.js';
import {
  resolvePricing,
  overrideFields,
  HOUR_FIELDS,
} from '../lib/pricingResolver.js';

const router = express.Router();

// ------------------------------------------------------------------
// POST /api/workshop-pricing/step-up — redeem a single-use access code
// Requires the normal login token (authenticate). On success returns a
// short-lived pricing-scoped token the client uses for all data routes.
// ------------------------------------------------------------------
router.post('/step-up', authenticate, async (req, res, next) => {
  try {
    const { code } = req.body;
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'رمز الدخول مطلوب' });
    }

    // The authorized-user flag lives on the workshop record.
    const { data: workshop, error: wErr } = await supabase
      .from('workshops')
      .select('can_manage_pricing')
      .eq('workshop_id', req.workshop_id)
      .maybeSingle();
    if (wErr) throw wErr;
    if (!workshop || !workshop.can_manage_pricing) {
      return res.status(403).json({ error: 'هذه الورشة غير مصرح لها بإدارة الأسعار', code: 'NOT_AUTHORIZED' });
    }

    // Find unconsumed, unexpired codes for this workshop and match by hash.
    const nowIso = new Date().toISOString();
    const { data: codes, error: cErr } = await supabase
      .from('pricing_access_codes')
      .select('id, code_hash, expires_at')
      .eq('workshop_id', req.workshop_id)
      .is('consumed_at', null);
    if (cErr) throw cErr;

    let matched = null;
    for (const c of codes || []) {
      if (c.expires_at && c.expires_at < nowIso) continue;
      // eslint-disable-next-line no-await-in-loop
      if (await bcrypt.compare(code, c.code_hash)) { matched = c; break; }
    }
    if (!matched) {
      return res.status(401).json({ error: 'رمز غير صالح أو مستخدم من قبل' });
    }

    // Consume the code (single-use).
    const { error: upErr } = await supabase
      .from('pricing_access_codes')
      .update({ consumed_at: nowIso, consumed_ip: req.ip || null })
      .eq('id', matched.id)
      .is('consumed_at', null); // guard against race
    if (upErr) throw upErr;

    const pricingToken = generatePricingToken(req.workshop_id);
    res.json({ success: true, pricingToken });
  } catch (err) {
    console.error('❌ pricing step-up error:', err.message);
    next({ message: err.message, status: 500 });
  }
});

const PRICING_TYPES = ['repair', 'replace'];

/** Fields that can carry a value in the catalog for each type. */
function catalogFields(pricingType) {
  const base = [
    'part_id', 'part_number', 'part_name_ar', 'part_name_en',
    'vehicle_make', 'vehicle_model', 'vehicle_year',
    ...HOUR_FIELDS, 'hr_price_egp',
  ];
  return pricingType === 'replace' ? [...base, 'part_price'] : base;
}

/** Numeric fields (must parse to a finite number when present). */
function numericFields(pricingType) {
  const base = [...HOUR_FIELDS, 'hr_price_egp'];
  return pricingType === 'replace' ? [...base, 'part_price'] : base;
}

function assertType(type, res) {
  if (!PRICING_TYPES.includes(type)) {
    res.status(400).json({ error: 'pricing_type must be repair or replace' });
    return false;
  }
  return true;
}

// ------------------------------------------------------------------
// GET /api/workshop-pricing/:type — resolved rows (filterable)
// ------------------------------------------------------------------
router.get('/:type', authenticate, requirePricingScope, async (req, res, next) => {
  try {
    const { type } = req.params;
    if (!assertType(type, res)) return;

    const filters = {
      vehicle_make:  req.query.make      || undefined,
      vehicle_model: req.query.model     || undefined,
      vehicle_year:  req.query.year      || undefined,
      part_id:       req.query.part_id   || undefined,
      part_number:   req.query.part_number || undefined,
      part_name:     req.query.part_name || undefined,
    };

    const rows = await resolvePricing({
      workshop_id: req.workshop_id,
      pricing_type: type,
      filters,
    });

    res.json({ success: true, rows });
  } catch (err) {
    console.error('❌ workshop-pricing list error:', err.message);
    next({ message: err.message, status: 500 });
  }
});

// ------------------------------------------------------------------
// GET /api/workshop-pricing/:type/filters — distinct values for dropdowns
// ------------------------------------------------------------------
router.get('/:type/filters', authenticate, requirePricingScope, async (req, res, next) => {
  try {
    const { type } = req.params;
    if (!assertType(type, res)) return;
    const table = type === 'replace' ? 'replace_catalog' : 'repair_catalog';

    const { data, error } = await supabase
      .from(table)
      .select('vehicle_make, vehicle_model, vehicle_year')
      .eq('workshop_id', req.workshop_id);
    if (error) throw error;

    const makes = [...new Set((data || []).map(r => r.vehicle_make).filter(Boolean))].sort();
    const models = [...new Set((data || []).map(r => r.vehicle_model).filter(Boolean))].sort();
    const years = [...new Set((data || []).map(r => r.vehicle_year).filter(Boolean))].sort();

    res.json({ success: true, makes, models, years });
  } catch (err) {
    console.error('❌ workshop-pricing filters error:', err.message);
    next({ message: err.message, status: 500 });
  }
});

// ------------------------------------------------------------------
// PATCH /api/workshop-pricing/:type/override — save ONE field immediately
// Body: { part_id, vehicle_make, vehicle_model, vehicle_year, field, value }
// ------------------------------------------------------------------
router.patch('/:type/override', authenticate, requirePricingScope, async (req, res, next) => {
  try {
    const { type } = req.params;
    if (!assertType(type, res)) return;

    const { part_id, vehicle_make, vehicle_model, vehicle_year = null, field, value } = req.body;
    if (!part_id || !vehicle_make || !vehicle_model) {
      return res.status(400).json({ error: 'part_id, vehicle_make, vehicle_model required' });
    }
    if (!overrideFields(type).includes(field)) {
      return res.status(400).json({ error: `field "${field}" is not editable for ${type}` });
    }
    const num = Number(value);
    if (value === '' || value === null || value === undefined || !Number.isFinite(num)) {
      return res.status(400).json({ error: 'value must be a number' });
    }

    const table = type === 'replace' ? 'replace_overrides' : 'repair_overrides';
    const key = {
      workshop_id: req.workshop_id, part_id, vehicle_make, vehicle_model, vehicle_year,
    };

    const { error } = await supabase
      .from(table)
      .upsert(
        { ...key, [field]: num, updated_at: new Date().toISOString() },
        { onConflict: 'workshop_id,part_id,vehicle_make,vehicle_model,vehicle_year' }
      );
    if (error) throw error;

    // Return the freshly-resolved row so the UI can update in place.
    const [row] = await resolvePricing({
      workshop_id: req.workshop_id,
      pricing_type: type,
      filters: { part_id, vehicle_make, vehicle_model, vehicle_year },
    });
    res.json({ success: true, row });
  } catch (err) {
    console.error('❌ workshop-pricing override error:', err.message);
    next({ message: err.message, status: 500 });
  }
});

// ------------------------------------------------------------------
// DELETE /api/workshop-pricing/:type/override — reset ONE field to catalog
// Body: { part_id, vehicle_make, vehicle_model, vehicle_year, field }
// Clears just that field; deletes the override row if nothing left overridden.
// ------------------------------------------------------------------
router.delete('/:type/override', authenticate, requirePricingScope, async (req, res, next) => {
  try {
    const { type } = req.params;
    if (!assertType(type, res)) return;

    const { part_id, vehicle_make, vehicle_model, vehicle_year = null, field } = req.body;
    if (!part_id || !vehicle_make || !vehicle_model) {
      return res.status(400).json({ error: 'part_id, vehicle_make, vehicle_model required' });
    }
    if (!overrideFields(type).includes(field)) {
      return res.status(400).json({ error: `field "${field}" is not editable for ${type}` });
    }

    const table = type === 'replace' ? 'replace_overrides' : 'repair_overrides';
    const match = { workshop_id: req.workshop_id, part_id, vehicle_make, vehicle_model, vehicle_year };

    // Fetch the current override row.
    const { data: existing, error: selErr } = await supabase
      .from(table).select('*')
      .match(match).maybeSingle();
    if (selErr) throw selErr;

    if (existing) {
      const cleared = { ...existing, [field]: null };
      const stillOverridden = overrideFields(type).some(
        f => cleared[f] !== null && cleared[f] !== undefined
      );
      if (stillOverridden) {
        const { error } = await supabase
          .from(table)
          .update({ [field]: null, updated_at: new Date().toISOString() })
          .match(match);
        if (error) throw error;
      } else {
        // No overrides remain → remove the row entirely.
        const { error } = await supabase.from(table).delete().match(match);
        if (error) throw error;
      }
    }

    const [row] = await resolvePricing({
      workshop_id: req.workshop_id,
      pricing_type: type,
      filters: { part_id, vehicle_make, vehicle_model, vehicle_year },
    });
    res.json({ success: true, row });
  } catch (err) {
    console.error('❌ workshop-pricing reset error:', err.message);
    next({ message: err.message, status: 500 });
  }
});

// ------------------------------------------------------------------
// POST /api/workshop-pricing/:type/upload — CSV bulk sync (catalog only)
// Body: { csv: "<raw file text>" }
// Validates each row against the saved column mapping. Valid rows upsert
// into *_catalog. Invalid rows are returned AND logged to unmapped_items_queue.
// Manual overrides are never touched.
// ------------------------------------------------------------------
router.post('/:type/upload', authenticate, requirePricingScope, async (req, res, next) => {
  try {
    const { type } = req.params;
    if (!assertType(type, res)) return;
    const { csv } = req.body;
    if (!csv || typeof csv !== 'string') {
      return res.status(400).json({ error: 'csv text is required' });
    }

    // 1. Load the admin-configured mapping for this workshop + type.
    const { data: mapRow, error: mapErr } = await supabase
      .from('csv_column_mappings')
      .select('mapping')
      .eq('workshop_id', req.workshop_id)
      .eq('pricing_type', type)
      .maybeSingle();
    if (mapErr) throw mapErr;
    if (!mapRow) {
      return res.status(400).json({
        error: 'لا يوجد إعداد لربط الأعمدة لهذه الورشة. تواصل مع الدعم.',
        code: 'NO_MAPPING',
      });
    }
    const mapping = mapRow.mapping; // { "<csv header>": "<our field>" }

    // 2. Parse CSV.
    const parsed = parseCsv(csv);
    if (parsed.length === 0) {
      return res.status(400).json({ error: 'الملف فارغ' });
    }
    const headers = parsed[0];
    const dataRows = parsed.slice(1);

    const allowed = catalogFields(type);
    const numeric = numericFields(type);

    const valid = [];
    const invalid = [];
    const queueRows = [];

    dataRows.forEach((cells, i) => {
      const rowNumber = i + 1; // 1-based, excluding header
      const rawRow = {};
      headers.forEach((h, idx) => { rawRow[h] = cells[idx] ?? ''; });
      if (Object.values(rawRow).every(v => String(v).trim() === '')) return; // skip blank line

      // Map workshop headers → our fields.
      const mapped = {};
      for (const [header, ourField] of Object.entries(mapping)) {
        if (!allowed.includes(ourField)) continue;
        mapped[ourField] = (rawRow[header] ?? '').trim();
      }

      const errors = [];
      // Required identity fields.
      if (!mapped.part_id)       errors.push('part_id مفقود');
      if (!mapped.vehicle_make)  errors.push('vehicle_make مفقود');
      if (!mapped.vehicle_model) errors.push('vehicle_model مفقود');

      // Numeric fields must parse when non-empty; empty → null.
      const cleaned = { ...mapped };
      for (const f of numeric) {
        const v = mapped[f];
        if (v === undefined || v === '') { cleaned[f] = null; continue; }
        const n = Number(String(v).replace(/,/g, ''));
        if (!Number.isFinite(n)) { errors.push(`${f} ليس رقماً: "${v}"`); }
        else { cleaned[f] = n; }
      }
      // Empty-string identity/text fields → null (except keys already checked).
      ['part_number', 'part_name_ar', 'part_name_en', 'vehicle_year'].forEach(f => {
        if (cleaned[f] === '') cleaned[f] = null;
      });

      if (errors.length) {
        const reason = errors.join('؛ ');
        invalid.push({ row_number: rowNumber, raw: rawRow, reason });
        queueRows.push({
          workshop_id: req.workshop_id,
          pricing_type: type,
          raw_row: rawRow,
          reason,
          row_number: rowNumber,
        });
      } else {
        valid.push({ ...cleaned, workshop_id: req.workshop_id, synced_at: new Date().toISOString() });
      }
    });

    // 3. Upsert valid rows into the catalog (overrides untouched).
    let upserted = 0;
    if (valid.length) {
      const table = type === 'replace' ? 'replace_catalog' : 'repair_catalog';
      const { error } = await supabase
        .from(table)
        .upsert(valid, { onConflict: 'workshop_id,part_id,vehicle_make,vehicle_model,vehicle_year' });
      if (error) throw error;
      upserted = valid.length;
    }

    // 4. Log invalid rows for admin review.
    if (queueRows.length) {
      const { error } = await supabase.from('unmapped_items_queue').insert(queueRows);
      if (error) console.error('⚠ failed to log unmapped items:', error.message);
    }

    res.json({
      success: true,
      total: dataRows.length,
      upserted,
      failed: invalid.length,
      invalid, // [{ row_number, raw, reason }] — shown to the user
    });
  } catch (err) {
    console.error('❌ workshop-pricing upload error:', err.message);
    next({ message: err.message, status: 500 });
  }
});

/**
 * Minimal RFC-4180-ish CSV parser: handles quoted fields, escaped quotes
 * ("" inside quotes), commas and newlines inside quotes, and CRLF.
 * Returns an array of rows, each an array of cell strings.
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n') {
      row.push(field); field = '';
      rows.push(row); row = [];
    } else {
      field += ch;
    }
  }
  // trailing field/row
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length > 0);
}

export default router;
