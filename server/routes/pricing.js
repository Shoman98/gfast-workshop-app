import express from 'express'
import { supabase } from '../db/supabase.js'
import { authenticate } from '../middleware/auth.js'
import { resolvePricing } from '../lib/pricingResolver.js'

const router = express.Router()

// Keep one resolved row per part_id (first wins) so it can override a global row.
function dedupeByPart(rows) {
  const m = {}
  for (const r of rows) if (!m[r.part_id]) m[r.part_id] = r
  return Object.values(m)
}

const LABOR_TYPES = [
  { key: 'refitting_labor_hrs', nameAr: 'اعمال فك و تركيب' },
  { key: 'dent_hrs',            nameAr: 'اعمال سمكره' },
  { key: 'paint_hrs',           nameAr: 'اعمال دهان' },
  { key: 'elec_hrs',            nameAr: 'اعمال كهربا' },
  { key: 'intr_hrs',            nameAr: 'اعمال سروجي' },
  { key: 'cooling_hrs',         nameAr: 'اعمال تبريد' },
  { key: 'susp_hrs',            nameAr: 'اعمال عفشه و زوايا' },
  { key: 'mechanical_hrs',      nameAr: 'اعمال ميكانيكا' },
  { key: 'glass_hrs',           nameAr: 'اعمال زجاج' },
]

function buildGroups(rates, parts, includePartPrice) {
  // Map part_name_ar → DB row. We match by NAME, not part_id: the AI-detected
  // parts carry a reliable part_name_ar, but their part_id doesn't align with
  // the catalog's PT_xxxx ids, so id-matching silently misses every part.
  const rateMap = {}
  rates.forEach(r => { if (r.part_name_ar) rateMap[r.part_name_ar] = r })

  const groups = []
  let grandTotal = 0

  for (const { key, nameAr } of LABOR_TYPES) {
    const entries = []

    for (const part of parts) {
      const rate = rateMap[part.part_name_ar]
      if (!rate) continue
      const hrs = rate[key]
      if (!hrs || hrs <= 0) continue
      const hrPrice = rate.hr_price_egp || 0
      const cost = parseFloat((hrs * hrPrice).toFixed(2))
      entries.push({ part_name_ar: part.part_name_ar, hrs, hr_price: hrPrice, cost })
    }

    if (entries.length > 0) {
      const total = parseFloat(entries.reduce((s, e) => s + e.cost, 0).toFixed(2))
      grandTotal += total
      groups.push({ labor_key: key, labor_name_ar: nameAr, entries, total })
    }
  }

  const result = { groups, labor_total: parseFloat(grandTotal.toFixed(2)) }

  if (includePartPrice) {
    const partPrices = []
    let partsTotal = 0
    for (const part of parts) {
      const rate = rateMap[part.part_name_ar]
      if (!rate) continue
      const price = rate.part_price || 0
      partPrices.push({ part_name_ar: part.part_name_ar, partId: part.partId, part_price: price })
      partsTotal += price
    }
    result.part_prices = partPrices
    result.parts_total = parseFloat(partsTotal.toFixed(2))
    result.total = parseFloat((grandTotal + partsTotal).toFixed(2))
  } else {
    result.total = parseFloat(grandTotal.toFixed(2))
  }

  return result
}

/**
 * POST /api/pricing
 * Body: { parts: [{partId, part_name_ar, severity_label}], make, model, year }
 */
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { parts, make, model, year } = req.body

    if (!parts || !Array.isArray(parts) || !make || !model) {
      return res.status(400).json({ error: 'parts, make, model required' })
    }

    const repairParts  = parts.filter(p => p.severity_label === 'Repair'  && p.part_name_ar)
    const replaceParts = parts.filter(p => p.severity_label === 'Replace' && p.part_name_ar)

    // Match global rates by part NAME (AI part_ids don't align with the catalog).
    const repairNames  = [...new Set(repairParts.map(p => p.part_name_ar))]
    const replaceNames = [...new Set(replaceParts.map(p => p.part_name_ar))]
    // Keep any real part_ids for the workshop-price resolver below.
    const repairIds  = [...new Set(repairParts.map(p => p.partId).filter(Boolean))]
    const replaceIds = [...new Set(replaceParts.map(p => p.partId).filter(Boolean))]

    // Batch fetch both tables in parallel — filter by make+model only
    // (year column currently stores a range string; will filter by year when data is year-specific)
    const [repairRes, replaceRes] = await Promise.all([
      repairNames.length > 0
        ? supabase.from('labor_rates_repair').select('*').in('part_name_ar', repairNames).eq('vehicle_make', make).eq('vehicle_model', model)
        : { data: [] },
      replaceNames.length > 0
        ? supabase.from('labor_rates_replace').select('*').in('part_name_ar', replaceNames).eq('vehicle_make', make).eq('vehicle_model', model)
        : { data: [] },
    ])

    if (repairRes.error)  throw repairRes.error
    if (replaceRes.error) throw replaceRes.error

    // Workshop-synced prices (catalog + manual overrides) via the shared resolver.
    // Policy: workshop price wins per part_id; fall back to the global tables.
    const [wsRepair, wsReplace] = await Promise.all([
      repairIds.length > 0
        ? resolvePricing({ workshop_id: req.workshop_id, pricing_type: 'repair',  filters: { vehicle_make: make, vehicle_model: model, part_ids: repairIds } }).catch(() => [])
        : [],
      replaceIds.length > 0
        ? resolvePricing({ workshop_id: req.workshop_id, pricing_type: 'replace', filters: { vehicle_make: make, vehicle_model: model, part_ids: replaceIds } }).catch(() => [])
        : [],
    ])

    // Strip prices from global rows only — workshops set their own prices via their catalog.
    // Hours (dent_hrs, paint_hrs, etc.) are kept so labor types still appear correctly.
    // Workshop catalog rows (wsRepair/wsReplace) retain their prices and override global rows.
    const stripPrices = rows => (rows || []).map(r => ({ ...r, hr_price_egp: 0, part_price: 0 }))
    const repairRates  = [ ...stripPrices(repairRes.data),  ...dedupeByPart(wsRepair) ]
    const replaceRates = [ ...stripPrices(replaceRes.data), ...dedupeByPart(wsReplace) ]

    const repair  = buildGroups(repairRates,  repairParts,  false)
    const replace = buildGroups(replaceRates, replaceParts, true)

    res.json({ success: true, repair, replace })
  } catch (err) {
    console.error('❌ Pricing error:', err.message)
    next({ message: err.message, status: 500 })
  }
})

export default router
