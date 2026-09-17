import pkg from '@gfast/analysis-core'
const { runAnalysisPipeline, PARTS_DATABASE, DAMAGE_TYPE_INDEX, PART_NAME_ALIASES } = pkg
import { getRepairSubtype } from './repairSubtype.js'

export function enrichAnalysisWithParts(analysisData, vehicleInfo) {
  const DAMAGE_TYPE_MAP = DAMAGE_TYPE_INDEX

  function enrichPart(part) {
    const partNameEn = part.part_name_en || part.partName || ''
    const partNameAr = part.part_name_ar || part.partNameAr || ''
    const damageType = part.damage_type || part.damageType || 'unknown'

    const partKey = partNameEn
      .toLowerCase()
      .trim()
      .replace(/[()\/\\,;:]/g, ' ')
      .replace(/[-]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')

    const resolvedKey = PART_NAME_ALIASES[partKey] || partKey
    const partInfo = PARTS_DATABASE[resolvedKey] || {}
    const damageTypeLower = damageType.toLowerCase()
    const damageIndex = DAMAGE_TYPE_MAP[damageTypeLower] !== undefined ? DAMAGE_TYPE_MAP[damageTypeLower] : 5
    const partCategory = (partInfo.category || '').toLowerCase()

    let severityLabel = damageIndex < 4 ? 'Repair' : 'Replace'

    const alwaysReplace = ['airbags_safety', 'interior', 'mechanical', 'suspension']
    const alwaysRepair  = ['structural', 'chassis', 'chassis_structure']
    if (alwaysReplace.includes(partCategory)) {
      severityLabel = 'Replace'
    } else if (alwaysRepair.includes(partCategory)) {
      severityLabel = 'Repair'
    } else if (damageTypeLower.includes('buckl')) {
      severityLabel = 'Repair'
    }

    const category = partInfo.category || 'exterior'
    const repair_subtype = getRepairSubtype(damageType, category, severityLabel)

    return {
      part_name_en: partInfo.nameEn || partNameEn || 'Unknown Part',
      part_name_ar: partInfo.nameAr || partNameAr || null,
      damage_type: damageType || 'unknown',
      description: part.description || part.visualEvidence || '',
      confidence: (part.confidence > 1 ? part.confidence / 100 : part.confidence) || 0.5,
      severity_label: severityLabel,
      repair_subtype,
      price: 0,
      partId: partInfo.partId || null,
      category,
      is_ai_detected: part.is_ai_detected !== false,
      isUnmapped: !PARTS_DATABASE[resolvedKey],
      reason_for_uncertainty: part.reason_for_uncertainty,
      location: part.location,
      safetyFlags: part.safetyFlags,
    }
  }

  const allParts = analysisData.damages || []
  const confirmedDamages    = allParts.filter(p => p.recommendedDecision !== 'inspect')
  const needsCheckFromShared = allParts.filter(p => p.recommendedDecision === 'inspect')

  const hiddenDamageParts = (analysisData.hiddenDamageAssessment || []).map(item => ({
    partName: item.suspected_hidden_part || '',
    damageType: 'Hidden Damage',
    description: item.hidden_indicator?.replace('[HIDDEN] ', '') || '',
    confidence: (item.confidence || 50) > 1 ? (item.confidence || 50) / 100 : (item.confidence || 0.5),
    recommendedDecision: 'inspect',
    reason_for_uncertainty: `خلف: ${(item.visible_damage_part || '').replace(/_/g, ' ')}`,
  }))

  const allNeedsCheck = [...needsCheckFromShared, ...(analysisData.needs_check_parts || []), ...hiddenDamageParts]

  function deduplicateByName(parts) {
    const seen = new Map()
    for (const part of parts) {
      const key = (part.part_name_en || part.partName || '').toLowerCase().trim()
      if (!seen.has(key) || part.confidence > seen.get(key).confidence) seen.set(key, part)
    }
    return Array.from(seen.values())
  }

  const isMapped = (part) => !part.isUnmapped && part.part_name_ar && part.part_name_ar !== 'قطعة غير معروفة'

  const enrichedDamages    = deduplicateByName(confirmedDamages).map(enrichPart).filter(isMapped)
  const enrichedNeedsCheck = deduplicateByName(allNeedsCheck).map(enrichPart).filter(isMapped)

  console.log(`✅ After dedup: ${enrichedDamages.length} damages, ${enrichedNeedsCheck.length} needs_check`)

  return {
    damages: enrichedDamages,
    needs_check_parts: enrichedNeedsCheck,
    vehicleInfo,
    timestamp: new Date().toISOString(),
    analysisSource: '@gfast/analysis-core (shared module)',
  }
}

export async function runAndEnrich(images, vehicleInfo) {
  const analysisData = await runAnalysisPipeline(images, vehicleInfo, undefined, undefined)
  return enrichAnalysisWithParts(analysisData, vehicleInfo)
}
