/**
 * Repair sub-type classification for panel and chassis parts.
 *
 * Applied AFTER the Repair/Replace decision is already made — only Repair parts
 * with category "panels" or "chassis_structure" get a sub-type. Everything else
 * is untouched.
 *
 * Priority (highest wins):  HeavyDent > MedDent > SmallDent > PDR
 * PDR is strict: ALL damage types on the part must be in the PDR set.
 *
 * Dent-hrs multipliers applied in the pricing route:
 *   PDR         × 1  (base)
 *   SmallDent   × 1  (base)
 *   MedDent     × 2
 *   HeavyDent   × 3
 *   ChassisDamage × 4
 */

// ── Type sets ─────────────────────────────────────────────────────────────────

const PDR_TYPES = new Set([
  'scratch', 'scuff', 'scuff marks', 'scratched',
  'misaligned', 'misalignment',
  'bent',
  'faded', 'discolored',
  'dent', 'dented',
])

// SmallDent types that are NOT in PDR (presence of any of these blocks PDR)
const SMALL_DENT_EXCLUSIVE = new Set([
  'chip', 'chipped', 'peeling',
  'creasing',
  'paint failure', 'paint damage',
  'scratches on lens',
  'loose', 'pushed forward', 'pushed back', 'pushed inward',
])

const MED_DENT_TYPES = new Set([
  'buckled', 'buckling', 'impact deformation', 'warped',
  'scrape', 'paint scraping',
  'rust', 'rusted', 'corroded', 'corrosion', 'surface oxidation',
  'leak', 'leaks',
  'separated',
])

const HEAVY_DENT_TYPES = new Set([
  'severe buckling', 'deformation', 'severe deformation',
  'torn', 'tear',
  'total paint loss', 'charred',
  'punctured', 'puncture', 'split',
  'crushed', 'collapsed',
  'heat deformation', 'melted', 'paint scorching',
  'soot accumulation', 'heavy soot', 'black paint',
  'missing', 'detached',
  'broken', 'crack', 'cracked', 'severe cracking', 'cracking',
])

const DENT_MULTIPLIERS = {
  PDR:           1,
  SmallDent:     1,
  MedDent:       2,
  HeavyDent:     3,
  ChassisDamage: 4,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Classify a single normalised damage-type token into a bucket. */
function bucket(dt) {
  if (HEAVY_DENT_TYPES.has(dt))       return 'heavy'
  if (MED_DENT_TYPES.has(dt))         return 'med'
  if (SMALL_DENT_EXCLUSIVE.has(dt))   return 'small'
  if (PDR_TYPES.has(dt))              return 'pdr'
  return 'unknown'
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Return the repair sub-type for a part, or null if not applicable.
 *
 * @param {string} damageTypeStr  Raw damage_type string (may be pipe-separated)
 * @param {string} category       Part category from PARTS_DATABASE
 * @param {string} severityLabel  'Repair' | 'Replace'
 * @returns {'PDR'|'SmallDent'|'MedDent'|'HeavyDent'|'ChassisDamage'|null}
 */
export function getRepairSubtype(damageTypeStr, category, severityLabel) {
  if (severityLabel !== 'Repair') return null
  if (!category) return null

  const cat = category.toLowerCase()

  // ChassisDamage: any damage type, any severity (category override already forced Repair)
  if (cat === 'chassis_structure') return 'ChassisDamage'

  // Only panels get the remaining sub-types
  if (cat !== 'panels') return null

  const types = (damageTypeStr || '')
    .split('|')
    .map(t => t.trim().toLowerCase())
    .filter(Boolean)

  if (types.length === 0) return null

  const buckets = types.map(bucket)

  if (buckets.includes('heavy'))   return 'HeavyDent'
  if (buckets.includes('med'))     return 'MedDent'
  if (buckets.includes('small'))   return 'SmallDent'
  if (buckets.includes('unknown')) return null  // unrecognised damage — no sub-type

  // All tokens are 'pdr' — strict PDR rule satisfied
  if (buckets.every(b => b === 'pdr')) return 'PDR'

  return null
}

/**
 * Dent-hrs multiplier for a given sub-type.
 * @param {string|null} subtype
 * @returns {number}
 */
export function getDentMultiplier(subtype) {
  return DENT_MULTIPLIERS[subtype] ?? 1
}
