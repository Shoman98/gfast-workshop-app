/**
 * ANALYSIS ROUTES - Run vehicle damage analysis using analysis-core
 */

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { runAnalysisPipeline, enrichDamageData } = require('@gfast/analysis-core');

const router = express.Router();

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

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Analysis complete in ${duration}s`);
    console.log(`   Damages: ${enrichedAnalysis.damages?.length || 0}`);
    console.log(`   Needs Check: ${enrichedAnalysis.needs_check_parts?.length || 0}`);

    res.json({
      success: true,
      duration: parseFloat(duration),
      analysis: enrichedAnalysis,
    });
  } catch (err) {
    console.error('❌ Analysis error:', err.message);
    next({
      message: err.message,
      status: 500,
    });
  }
});

export default router;
