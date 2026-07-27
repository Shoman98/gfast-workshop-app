import express from 'express'
import { supabase } from '../db/supabase.js'
import { authenticate } from '../middleware/auth.js'

const router = express.Router()

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
  // Map partId → part info from the request
  const partMap = {}
  parts.forEach(p => { partMap[p.partId] = p })

  // Map partId → DB row
  const rateMap = {}
  rates.forEach(r => { rateMap[r.part_id] = r })

  const groups = []
  let grandTotal = 0

  for (const { key, nameAr } of LABOR_TYPES) {
    const entries = []

    for (const part of parts) {
      const rate = rateMap[part.partId]
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
      const rate = rateMap[part.partId]
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

    const repairParts  = parts.filter(p => p.severity_label === 'Repair'  && p.partId)
    const replaceParts = parts.filter(p => p.severity_label === 'Replace' && p.partId)

    const repairIds  = [...new Set(repairParts.map(p => p.partId))]
    const replaceIds = [...new Set(replaceParts.map(p => p.partId))]

    // Batch fetch both tables in parallel — filter by make+model only
    // (year column currently stores a range string; will filter by year when data is year-specific)
    const [repairRes, replaceRes] = await Promise.all([
      repairIds.length > 0
        ? supabase.from('labor_rates_repair').select('*').in('part_id', repairIds).eq('vehicle_make', make).eq('vehicle_model', model)
        : { data: [] },
      replaceIds.length > 0
        ? supabase.from('labor_rates_replace').select('*').in('part_id', replaceIds).eq('vehicle_make', make).eq('vehicle_model', model)
        : { data: [] },
    ])

    if (repairRes.error)  throw repairRes.error
    if (replaceRes.error) throw replaceRes.error

    const repair  = buildGroups(repairRes.data  || [], repairParts,  false)
    const replace = buildGroups(replaceRes.data || [], replaceParts, true)

    res.json({ success: true, repair, replace })
  } catch (err) {
    console.error('❌ Pricing error:', err.message)
    next({ message: err.message, status: 500 })
  }
})

export default router
