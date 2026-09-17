const PDR_TYPES = new Set([
  'scratch', 'scuff', 'scuff marks', 'scratched',
  'misaligned', 'misalignment',
  'bent',
  'faded', 'discolored',
  'dent', 'dented',
])

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

type RepairSubtype = 'PDR' | 'SmallDent' | 'MedDent' | 'HeavyDent' | 'ChassisDamage'

function bucket(dt: string): 'heavy' | 'med' | 'small' | 'pdr' | 'unknown' {
  if (HEAVY_DENT_TYPES.has(dt))     return 'heavy'
  if (MED_DENT_TYPES.has(dt))       return 'med'
  if (SMALL_DENT_EXCLUSIVE.has(dt)) return 'small'
  if (PDR_TYPES.has(dt))            return 'pdr'
  return 'unknown'
}

export function getRepairSubtype(
  damageTypeStr: string | null | undefined,
  category: string | null | undefined,
  severityLabel: string,
): RepairSubtype | null {
  if (severityLabel !== 'Repair') return null
  if (!category) return null

  const cat = category.toLowerCase()

  if (cat === 'chassis_structure') return 'ChassisDamage'
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
  if (buckets.includes('unknown')) return null

  if (buckets.every(b => b === 'pdr')) return 'PDR'

  return null
}
