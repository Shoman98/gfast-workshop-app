/**
 * Import labor rates from Excel into Supabase
 * Run: node scripts/import-labor-rates.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '../.env.local') })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const BATCH_SIZE = 500

const LABOR_FILES = [
  {
    file: '/Users/User/Documents/DB/labor-rates-replace_by_Vehicle.xlsx',
    table: 'labor_rates_replace',
    totalCol: 'total_replace_hrs',
  },
]

async function readExcel(filePath) {
  const { default: xlsx } = await import('xlsx')
  const wb = xlsx.readFile(filePath)
  const ws = wb.Sheets[wb.SheetNames[0]]
  return xlsx.utils.sheet_to_json(ws, { defval: null })
}

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v))

function mapRow(row, totalCol) {
  return {
    part_id: row['partId'] ?? null,
    part_name_ar: row['part_name_ar'] ?? null,
    part_name_en: row['part_name_en'] ?? null,
    category: row['category'] ?? null,
    refitting_labor_hrs: num(row['refitting_labor_hrs']),
    dent_hrs: num(row['dent_hrs']),
    paint_hrs: num(row['paint_hrs']),
    elec_hrs: num(row['elec_hrs']),
    intr_hrs: num(row['intr_hrs']),
    cooling_hrs: num(row['cooling_hrs']),
    susp_hrs: num(row['susp_hrs']),
    mechanical_hrs: num(row['mechanical_hrs']),
    glass_hrs: num(row['glass_hrs']),
    [totalCol]: num(row['total__repair_hrs'] ?? row['total__rep_hrs']),
    hr_price_egp: num(row['1hr_labor_price_egp']),
    part_price: num(row['part_price']),
    vehicle_make: row['vehicle_make'] ?? null,
    vehicle_model: row['vehicle_model'] ?? null,
    vehicle_year: row['vehicle_year'] ? String(row['vehicle_year']) : null,
    last_updated: row['last_updated'] ? String(row['last_updated']) : null,
  }
}

async function importTable({ file, table, totalCol }) {
  console.log(`\n📂 Reading ${file}...`)
  const rows = await readExcel(file)
  console.log(`   ${rows.length} rows found`)

  const batches = []
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    batches.push(rows.slice(i, i + BATCH_SIZE).map(r => mapRow(r, totalCol)))
  }

  console.log(`🚀 Inserting into ${table} (${batches.length} batches of ${BATCH_SIZE})...`)
  let inserted = 0

  for (let i = 0; i < batches.length; i++) {
    const { error } = await supabase.from(table).insert(batches[i])
    if (error) {
      console.error(`❌ Batch ${i + 1} failed:`, error.message)
      process.exit(1)
    }
    inserted += batches[i].length
    if ((i + 1) % 50 === 0 || i === batches.length - 1) {
      console.log(`   ✅ ${inserted.toLocaleString()} / ${rows.length.toLocaleString()} rows inserted`)
    }
  }
  console.log(`✅ ${table} done — ${inserted.toLocaleString()} rows`)
}

async function main() {
  console.log('🏁 Starting labor rates import...')
  for (const config of LABOR_FILES) {
    await importTable(config)
  }
  console.log('\n🎉 All done!')
}

main().catch(err => { console.error('💥', err); process.exit(1) })
