/**
 * ADMIN TOOL — generate a single-use pricing access code for a workshop.
 *
 * Usage:
 *   node --env-file=.env.local scripts/gen-pricing-code.mjs <workshop_id> [label] [--hours N]
 *
 * - Enables can_manage_pricing on the workshop (the authorized-user flag).
 * - Inserts a bcrypt-hashed code into pricing_access_codes.
 * - Prints the PLAINTEXT code once — hand it to the authorized workshop user.
 *   It is single-use and (optionally) expires after N hours.
 */

import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcrypt'
import crypto from 'crypto'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

const [, , workshopId, ...rest] = process.argv
if (!workshopId) {
  console.error('Usage: node --env-file=.env.local scripts/gen-pricing-code.mjs <workshop_id> [label] [--hours N]')
  process.exit(1)
}

let hours = null
const labelParts = []
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === '--hours') { hours = Number(rest[++i]); continue }
  labelParts.push(rest[i])
}
const label = labelParts.join(' ') || null

// 8-char human-friendly code (no ambiguous chars).
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const code = Array.from(crypto.randomBytes(8)).map(b => alphabet[b % alphabet.length]).join('')

const run = async () => {
  // 1. Ensure the workshop exists + flag it.
  const { data: ws, error: wErr } = await supabase
    .from('workshops').select('workshop_id').eq('workshop_id', workshopId).maybeSingle()
  if (wErr) throw wErr
  if (!ws) { console.error(`✗ workshop "${workshopId}" not found`); process.exit(1) }

  const { error: flagErr } = await supabase
    .from('workshops').update({ can_manage_pricing: true }).eq('workshop_id', workshopId)
  if (flagErr) throw flagErr

  // 2. Insert the hashed code.
  const code_hash = await bcrypt.hash(code, 10)
  const expires_at = hours ? new Date(Date.now() + hours * 3600_000).toISOString() : null
  const { error: insErr } = await supabase
    .from('pricing_access_codes')
    .insert({ workshop_id: workshopId, code_hash, label, expires_at })
  if (insErr) throw insErr

  console.log('\n✅ Pricing access code generated')
  console.log('   workshop_id :', workshopId)
  console.log('   label       :', label || '(none)')
  console.log('   expires     :', expires_at || 'never')
  console.log('\n   ┌───────────────────────┐')
  console.log(`   │   CODE:  ${code}     │`)
  console.log('   └───────────────────────┘')
  console.log('\n   Single-use. Hand it to the authorized workshop user.\n')
}

run().catch(e => { console.error('✗', e.message); process.exit(1) })
