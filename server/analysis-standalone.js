/**
 * STANDALONE ANALYSIS - Using @gfast/analysis-engine shared library
 * No external dependencies, direct Gemini integration
 * Each workshop app instance has its own Gemini quota
 */

import { analyzeVehicleDamage as analyzeWithEngine, PARTS_DATABASE } from '@gfast/analysis-engine';
import { getSeverityDecision } from '@gfast/analysis-engine';

/**
 * Transform raw engine damage to frontend format with part names and severity
 */
function transformDamages(damages) {
  if (!damages || !Array.isArray(damages)) return [];

  return damages
    .map(dmg => {
      // Try to find part by partId first (exact match in database values)
      let partInfo = null;
      const partId = dmg.partId || dmg.part_name;

      // Try direct key lookup (when partId is the database key like 'front_windshield')
      if (partId in PARTS_DATABASE) {
        partInfo = PARTS_DATABASE[partId];
      } else {
        // Try looking up by partId value (when partId is 'PT_0002' and we need to find the key)
        for (const [key, part] of Object.entries(PARTS_DATABASE)) {
          if (part.partId === partId) {
            partInfo = part;
            break;
          }
        }
      }

      if (!partInfo) {
        console.warn(`⚠️  Unknown part: ${partId}`);
        return null;
      }

      // Determine severity (Repair vs Replace) based on damage type
      const { decision } = getSeverityDecision(dmg.damage_type);

      return {
        part_name_en: partInfo.nameEn,
        part_name_ar: partInfo.nameAr,
        partId: partInfo.partId,
        category: partInfo.category,
        isSafety: partInfo.isSafety,
        damage_type: dmg.damage_type,
        description: dmg.description,
        confidence: dmg.confidence,
        price: partInfo.price,
        severity_label: decision,
        is_ai_detected: true,
      };
    })
    .filter(Boolean);
}

/**
 * Analyze vehicle damage using shared analysis engine
 */
export async function analyzeVehicleDamage(images, vehicleInfo, geminiApiKey, imageViews) {
  console.log('\n🎬 Starting Analysis with @gfast/analysis-engine...');
  console.log(`🚗 Vehicle: ${vehicleInfo.year} ${vehicleInfo.make} ${vehicleInfo.model}`);
  console.log(`📸 Images: ${images.length}`);
  console.log(`📷 Image views: ${imageViews?.join(', ') || 'auto-detected'}`);

  try {
    // Set the API key in environment for the analysis engine
    process.env.WORKSHOP_GEMINI_API_KEY = geminiApiKey;

    // Use provided imageViews or default to auto-detect
    const views = imageViews || ['front', 'left', 'right', 'back'].slice(0, images.length);

    // Call the shared analysis engine
    const result = await analyzeWithEngine(images, vehicleInfo, {
      model: 'gemini-2.5-flash',
      imageViews: views,
      imageAngles: Array(images.length).fill('wide'),
    });

    console.log(`✅ Analysis complete - ${result.analysis?.damages?.length || 0} damages found`);

    // Transform all damages (high + low confidence combined)
    const allDamages = transformDamages(result.analysis?.damages || []);

    // Log confidence distribution
    const highConf = allDamages.filter(d => d.confidence >= 0.70).length;
    const lowConf = allDamages.filter(d => d.confidence < 0.70).length;
    console.log(`  ✓ High confidence (≥0.70): ${highConf}`);
    console.log(`  ✓ Low confidence (<0.70): ${lowConf}`);

    // Transform result to match expected format
    return {
      success: result.success,
      duration: result.duration,
      analysisMethod: result.analysisMethod,
      damages: allDamages,
      overallConfidence: result.analysis?.overallConfidence || 0,
      safetyFlags: result.analysis?.safetyFlags || {},
      stage1: result.stage1,
      stage2: result.stage2,
      stage3: result.stage3,
      stage4: result.stage4,
    };

  } catch (err) {
    console.error('❌ Analysis error:', err.message);
    console.error('Stack:', err.stack);
    throw err;
  }
}
