/**
 * ANALYSIS ROUTES - Run vehicle damage analysis using analysis-core
 */

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { createRequire } from 'module';
import { getRepairSubtype } from '../lib/repairSubtype.js';

const require = createRequire(import.meta.url);
const { runAnalysisPipeline, enrichDamageData, PARTS_DATABASE } = require('@gfast/analysis-core');

const router = express.Router();

// Build name → category lookup once at startup (PARTS_DATABASE never changes at runtime)
const nameEnToCat = {};
const partIdToCat = {};
Object.values(PARTS_DATABASE).forEach(p => {
  if (p.nameEn) nameEnToCat[p.nameEn.toLowerCase()] = p.category;
  if (p.partId) partIdToCat[p.partId]               = p.category;
});

/** Look up a part's category using partId then nameEn as fallback. */
function resolveCategory(part) {
  return (
    (part.partId && partIdToCat[part.partId]) ||
    nameEnToCat[(part.part_name_en || '').toLowerCase()] ||
    null
  );
}

/** Stamp repair_subtype + category onto every part in the analysis result. */
function addRepairSubtypes(analysis) {
  const stamp = (parts) =>
    (parts || []).map(part => {
      const category = resolveCategory(part);
      const repair_subtype = getRepairSubtype(
        part.damage_type,
        category,
        part.severity_label,
      );
      return { ...part, category, repair_subtype };
    });

  return {
    ...analysis,
    damages:           stamp(analysis.damages),
    needs_check_parts: stamp(analysis.needs_check_parts),
  };
}

/**
 * POST /api/analysis
 * Run the 4-stage Gemini analysis pipeline
 * Body: { images, vehicleInfo, imageViews?, imageAngles? }
 * Returns: { analysisId, results }
 */
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { images, vehicleInfo, imageViews, imageAngles } = req.body;

    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: 'At least 1 image required' });
    }

    if (!vehicleInfo || !vehicleInfo.year || !vehicleInfo.make || !vehicleInfo.model) {
      return res.status(400).json({ error: 'vehicleInfo.year, make, model required' });
    }

    console.log(`📊 Analysis starting for ${vehicleInfo.year} ${vehicleInfo.make} ${vehicleInfo.model}`);
    console.log(`   Images: ${images.length}, Views: ${imageViews?.length || 0}, Angles: ${imageAngles?.length || 0}`);

    const startTime = Date.now();

    // Run analysis pipeline (uses analysis-core module)
    const rawAnalysis = await runAnalysisPipeline({
      images,
      vehicleInfo,
      imageViews,
      imageAngles,
    });

    // Enrich with part details, prices, severity decisions
    const enrichedAnalysis = enrichDamageData(rawAnalysis, vehicleInfo);

    // Stamp repair sub-types (PDR / SmallDent / MedDent / HeavyDent / ChassisDamage)
    const finalAnalysis = addRepairSubtypes(enrichedAnalysis);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Analysis complete in ${duration}s`);
    console.log(`   Damages: ${finalAnalysis.damages?.length || 0}`);
    console.log(`   Needs Check: ${finalAnalysis.needs_check_parts?.length || 0}`);

    res.json({
      success: true,
      duration: parseFloat(duration),
      analysis: finalAnalysis,
    });
  } catch (err) {
    console.error('❌ Analysis error:', err.message);
    if (err.cause) console.error('   Cause:', err.cause);
    next({
      message: err.message,
      status: 500,
    });
  }
});

export default router;
