/**
 * ADMIN TOOL — create/refresh a shared owner account and link its workshops.
 *
 * One account (username + shared PIN) can own several *separate* workshops.
 * At login the owner enters the account username + PIN, then picks a workshop.
 * Each workshop keeps its own bookings / estimates / UI (scoped by workshop_id).
 *
 * Usage:
 *   node --env-file=.env.local scripts/create-account.mjs <username> <pin> <ws-spec> [<ws-spec> ...]
 *
 *   ws-spec = "workshop_id|workshop_name|city|phone"   (city/phone optional)
 *
 * Example:
 *   node --env-file=.env.local scripts/create-account.mjs elmohandes01 8415 \
 *     "mohandes-001|مركز المهندس|الشيخ زايد - مدخل زايد ٥|1150936950" \
 *     "fabrika-001|مركز فابريكا|المعادي ش نصر حلوان الزراعي|1150936950"
 *
 * Idempotent: creates workshops that don't exist yet, leaves existing profiles
 * untouched, upserts the account, and (re)links the workshops to it.
 * Requires workshop-accounts-migration.sql to have been applied first.
 */

import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcrypt'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

const [, , username, pin, ...wsSpecs] = process.argv
if (!username || !pin || wsSpecs.length === 0) {
  console.error('Usage: node --env-file=.env.local scripts/create-account.mjs <username> <pin> "<id|name|city|phone>" ...')
  process.exit(1)
}

const workshops = wsSpecs.map(spec => {
  const [workshop_id, workshop_name, city, phone] = spec.split('|').map(s => s?.trim())
  if (!workshop_id || !workshop_name) {
    console.error(`❌ Bad ws-spec (need at least "id|name"): ${spec}`)
    process.exit(1)
  }
  return { workshop_id, workshop_name, city: city || null, phone: phone || null }
})

async function main() {
  const pinHash = await bcrypt.hash(pin, 10)

  // Fail fast with a clear message if the migration hasn't been applied.
  const { error: tableErr } = await supabase.from('workshop_accounts').select('account_id').limit(1)
  if (tableErr) {
    console.error('❌ workshop_accounts table not found. Run workshop-accounts-migration.sql in the Supabase SQL editor first.')
    console.error('   (', tableErr.message, ')')
    process.exit(1)
  }

  // 1. Create workshops that don't exist yet (existing ones are left untouched).
  for (const ws of workshops) {
    const { data: existing } = await supabase
      .from('workshops').select('workshop_id').eq('workshop_id', ws.workshop_id).maybeSingle()

    if (existing) {
      console.log(`• workshop ${ws.workshop_id} already exists — leaving profile as-is`)
      continue
    }

    const { error } = await supabase.from('workshops').insert({
      workshop_id: ws.workshop_id,
      workshop_name: ws.workshop_name,
      display_name: ws.workshop_name,
      city: ws.city,
      phone: ws.phone,
      pin_hash: pinHash,            // satisfies NOT NULL; account login is primary
      category: 'mixed',
      is_active: true,
      is_visible_to_consumers: true,
    })
    if (error) { console.error(`❌ Failed to create workshop ${ws.workshop_id}:`, error.message); process.exit(1) }
    console.log(`✅ created workshop ${ws.workshop_id} — ${ws.workshop_name}`)
  }

  // 2. Upsert the owner account.
  const { data: acct } = await supabase
    .from('workshop_accounts').select('account_id').eq('username', username).maybeSingle()

  let accountId
  if (acct) {
    accountId = acct.account_id
    const { error } = await supabase.from('workshop_accounts')
      .update({ pin_hash: pinHash, display_name: username, is_active: true, updated_at: new Date().toISOString() })
      .eq('account_id', accountId)
    if (error) { console.error('❌ Failed to update account:', error.message); process.exit(1) }
    console.log(`✅ updated account ${username} (${accountId})`)
  } else {
    const { data, error } = await supabase.from('workshop_accounts')
      .insert({ username, pin_hash: pinHash, display_name: username, is_active: true })
      .select('account_id').single()
    if (error) { console.error('❌ Failed to create account:', error.message); process.exit(1) }
    accountId = data.account_id
    console.log(`✅ created account ${username} (${accountId})`)
  }

  // 3. Link the workshops to the account.
  const ids = workshops.map(w => w.workshop_id)
  const { error: linkErr } = await supabase.from('workshops')
    .update({ account_id: accountId }).in('workshop_id', ids)
  if (linkErr) { console.error('❌ Failed to link workshops:', linkErr.message); process.exit(1) }
  console.log(`✅ linked ${ids.length} workshops to account: ${ids.join(', ')}`)

  console.log(`\n🎉 Done. Login: username "${username}" + the shared PIN → pick a workshop.`)
}

main().catch(err => { console.error(err); process.exit(1) })
