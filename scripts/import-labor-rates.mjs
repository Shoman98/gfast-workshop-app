/**
 * Import global labor rates (repair + replace) into Supabase.
 *
 * Reads pre-generated CSVs produced by scripts/gen-labor-rates-csv.py
 * (Python reconstructs Excel cross-sheet formulas — xlsx can't evaluate them).
 *
 * Usage:
 *   node --env-file=.env.local scripts/import-labor-rates.mjs [--dry-run] [--table repair|replace]
 *
 * Flags:
 *   --dry-run              Parse and log counts but do NOT touch the database
 *   --table repair         Import only labor_rates_repair
 *   --table replace        Import only labor_rates_replace
 *   (omit --table to import both)
 *
 * Each table is TRUNCATED before inserting — safe to re-run.
 */

import { createClient } from '@supabase/supabase-js'
import { createReadStream } from 'fs'
import { createInterface } from 'readline'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '../.env.local') })

const DRY_RUN    = process.argv.includes('--dry-run')
const tableArg   = process.argv.includes('--table') ? process.argv[process.argv.indexOf('--table') + 1] : null
const BATCH      = 500

const CONFIGS = [
  {
    key:    'repair',
    csv:    path.resolve(__dirname, '../../Downloads/labor_rates_repair_import.csv'),
    table:  'labor_rates_repair',
    mapRow: (r) => ({
      part_id:             str(r.part_id),
      part_name_ar:        str(r.part_name_ar),
      part_name_en:        str(r.part_name_en),
      category:            str(r.category),
      refitting_labor_hrs: num(r.refitting_labor_hrs),
      dent_hrs:            num(r.dent_hrs),
      paint_hrs:           num(r.paint_hrs),
      elec_hrs:            num(r.elec_hrs),
      intr_hrs:            num(r.intr_hrs),
      cooling_hrs:         num(r.cooling_hrs),
      susp_hrs:            num(r.susp_hrs),
      mechanical_hrs:      num(r.mechanical_hrs),
      glass_hrs:           num(r.glass_hrs),
      total_repair_hrs:    num(r.total_repair_hrs),
      hr_price_egp:        num(r.hr_price_egp),
      paint_1hr_price_egp: num(r.paint_1hr_price_egp),
      vehicle_make:        str(r.vehicle_make),
      vehicle_model:       str(r.vehicle_model),
      vehicle_year:        str(r.vehicle_year),
      last_updated:        str(r.last_updated),
    }),
  },
  {
    key:    'replace',
    csv:    path.resolve(__dirname, '../../Downloads/labor_rates_replace_import.csv'),
    table:  'labor_rates_replace',
    mapRow: (r) => ({
      part_id:             str(r.part_id),
      part_name_ar:        str(r.part_name_ar),
      part_name_en:        str(r.part_name_en),
      category:            str(r.category),
      refitting_labor_hrs: num(r.refitting_labor_hrs),
      dent_hrs:            num(r.dent_hrs),
      paint_hrs:           num(r.paint_hrs),
      elec_hrs:            num(r.elec_hrs),
      intr_hrs:            num(r.intr_hrs),
      cooling_hrs:         num(r.cooling_hrs),
      susp_hrs:            num(r.susp_hrs),
      mechanical_hrs:      num(r.mechanical_hrs),
      glass_hrs:           num(r.glass_hrs),
      total_replace_hrs:   num(r.total_replace_hrs),
      hr_price_egp:        num(r.hr_price_egp),
      paint_1hr_price_egp: num(r.paint_1hr_price_egp),
      part_price:          num(r.part_price),
      vehicle_make:        str(r.vehicle_make),
      vehicle_model:       str(r.vehicle_model),
      vehicle_year:        str(r.vehicle_year),
      last_updated:        str(r.last_updated),
    }),
  },
]

const num = (v) => (v === '' || v == null ? null : Number(v))
const str = (v) => (v === '' || v == null ? null : String(v))

function parseCSVLine(line) {
  return line.split(',')
}

async function readCSV(filePath) {
  return new Promise((resolve, reject) => {
    const rows = []
    let headers = null
    const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity })
    rl.on('line', (line) => {
      if (!line.trim()) return
      if (!headers) { headers = parseCSVLine(line); return }
      const vals = parseCSVLine(line)
      const obj = {}
      headers.forEach((h, i) => { obj[h] = vals[i] ?? '' })
      rows.push(obj)
    })
    rl.on('close', () => resolve(rows))
    rl.on('error', reject)
  })
}

async function importTable({ key, csv, table, mapRow }, supabase) {
  console.log(`\n📂 [${key}] Reading ${csv}...`)
  const raw = await readCSV(csv)
  console.log(`   ${raw.length.toLocaleString()} rows parsed`)
  console.log('   Sample:', JSON.stringify(mapRow(raw[0])))

  if (DRY_RUN) {
    console.log('   ⚠️  --dry-run: skipping DB writes')
    return
  }

  // Truncate existing data
  console.log(`   🗑️  Clearing ${table}...`)
  const { error: delErr } = await supabase
    .from(table)
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')
  if (delErr) { console.error('❌ Clear failed:', delErr.message); process.exit(1) }
  console.log('   ✅ Table cleared')

  // Batch insert
  const mapped = raw.map(mapRow)
  const batches = []
  for (let i = 0; i < mapped.length; i += BATCH) batches.push(mapped.slice(i, i + BATCH))

  console.log(`   🚀 Inserting ${mapped.length.toLocaleString()} rows in ${batches.length} batches...`)
  let inserted = 0

  for (let i = 0; i < batches.length; i++) {
    const { error } = await supabase.from(table).insert(batches[i])
    if (error) { console.error(`❌ Batch ${i + 1} failed:`, error.message); process.exit(1) }
    inserted += batches[i].length
    if ((i + 1) % 100 === 0 || i === batches.length - 1) {
      const pct = ((inserted / mapped.length) * 100).toFixed(1)
      console.log(`   ${pct}%  ${inserted.toLocaleString()} / ${mapped.length.toLocaleString()}`)
    }
  }

  console.log(`   ✅ ${table} done — ${inserted.toLocaleString()} rows`)
}

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

  const toRun = tableArg
    ? CONFIGS.filter(c => c.key === tableArg)
    : CONFIGS

  if (toRun.length === 0) {
    console.error(`❌ Unknown --table value: "${tableArg}". Use "repair" or "replace".`)
    process.exit(1)
  }

  console.log(`🏁 Importing: ${toRun.map(c => c.table).join(', ')}${DRY_RUN ? ' (DRY RUN)' : ''}`)

  for (const config of toRun) {
    await importTable(config, supabase)
  }

  console.log('\n🎉 All done!')
}

main().catch(err => { console.error('💥', err); process.exit(1) })
