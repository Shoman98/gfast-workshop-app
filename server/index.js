/**
 * WORKSHOP APP SERVER
 * Backend for workshop estimates, authentication, and analysis
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.js';
import estimateRoutes from './routes/estimates.js';
// Use SHARED module from wreck-vision - SINGLE SOURCE OF TRUTH
import { runAnalysisPipeline, enrichDamageData } from '@gfast/analysis-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const app = express();
const PORT = 3333;  // Workshop app runs on 3333, wreck-vision on 3002

// ============================================================================
// MIDDLEWARE
// ============================================================================
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Import PARTS_DATABASE and DAMAGE_TYPE_INDEX from shared module
import { PARTS_DATABASE, DAMAGE_TYPE_INDEX } from '@gfast/analysis-core';

// Transform and enrich analysis with PARTS_DATABASE lookup, severity mapping, LEFT/RIGHT rules
// Handles both Gemini format (part_name_en, damage_type) and shared module format (partName, damageType)
function enrichAnalysisWithParts(analysisData, vehicleInfo) {
  const DAMAGE_TYPE_MAP = DAMAGE_TYPE_INDEX;

  function enrichPart(part) {
    // Handle both formats: Gemini (part_name_en) and shared module (partName)
    const partNameEn = part.part_name_en || part.partName || '';
    const partNameAr = part.part_name_ar || part.partNameAr || '';
    const damageType = part.damage_type || part.damageType || 'unknown';

    // Normalize part name for PARTS_DATABASE lookup
    const partKey = partNameEn
      .toLowerCase()
      .trim()
      .replace(/[()\/\\,;:]/g, ' ')
      .replace(/[-]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');

    const partInfo = PARTS_DATABASE[partKey] || {};
    const damageTypeLower = damageType.toLowerCase();
    const damageIndex = DAMAGE_TYPE_MAP[damageTypeLower] !== undefined ? DAMAGE_TYPE_MAP[damageTypeLower] : 5;

    return {
      part_name_en: partInfo.nameEn || partNameEn || 'Unknown Part',
      part_name_ar: partInfo.nameAr || partNameAr || 'قطعة غير معروفة',
      damage_type: damageType || 'unknown',
      description: part.description || part.visualEvidence || '',
      confidence: (part.confidence || 0.5) / 100,  // Convert 98 → 0.98, or keep 0.65 as-is
      severity_label: damageIndex < 4 ? 'Repair' : 'Replace',
      price: partInfo.price || 0,
      partId: partInfo.partId || null,
      category: partInfo.category || 'exterior',
      is_ai_detected: part.is_ai_detected !== false,
      isUnmapped: !PARTS_DATABASE[partKey],
      reason_for_uncertainty: part.reason_for_uncertainty,
      // Additional fields from shared module (if present)
      location: part.location,
      safetyFlags: part.safetyFlags
    };
  }

  return {
    damages: (analysisData.damages || []).map(enrichPart),
    needs_check_parts: (analysisData.needs_check_parts || []).map(enrichPart),
    vehicleInfo,
    timestamp: new Date().toISOString(),
    analysisSource: '@gfast/analysis-core (shared module)'
  };
}

// ============================================================================
// ROUTES
// ============================================================================
app.use('/api/auth', authRoutes);
app.use('/api/estimates', estimateRoutes);

// Analysis route - Real Gemini Vision Analysis (with fallback to mock if API unavailable)
app.post('/api/analysis', async (req, res, next) => {
  try {
    const { images, vehicleInfo } = req.body;
    const imageCount = images?.length || 0;

    if (imageCount < 1) {
      return res.status(400).json({
        success: false,
        error: 'يجب رفع صورة واحدة على الأقل',
      });
    }

    console.log(`📊 Analysis starting: ${imageCount} image(s), ${vehicleInfo.year} ${vehicleInfo.make} ${vehicleInfo.model}`);

    // Use SHARED analysis pipeline from @gfast/analysis-core
    // This ensures 100% consistency with wreck-vision تحليل المركبه
    const analysisData = await runAnalysisPipeline(
      images,
      vehicleInfo,
      undefined,  // auto-detect image views
      undefined   // auto-detect image angles
    );

    console.log(`✅ 4-Stage analysis complete: ${analysisData.damages?.length || 0} damages found, ${analysisData.needs_check_parts?.length || 0} needs_check`);

    // DEBUG: Show raw response structure
    if (analysisData.damages && analysisData.damages.length > 0) {
      console.log(`🔍 DEBUG - First damage part keys: ${Object.keys(analysisData.damages[0]).join(', ')}`);
      console.log(`🔍 DEBUG - First damage sample:`, JSON.stringify(analysisData.damages[0], null, 2).substring(0, 200));
    }

    // Transform Gemini output to workshop format with PARTS_DATABASE enrichment
    // Apply: severity mapping, LEFT/RIGHT rules, part database lookup, pricing
    const enriched = enrichAnalysisWithParts(analysisData, vehicleInfo);

    return res.json({
      success: true,
      analysis: enriched
    });
  } catch (err) {
    console.error('❌ Analysis error:', err.message);
    return res.status(500).json({
      success: false,
      error: err.message || 'تحليل فشل - يرجى المحاولة مجددا',
      timestamp: new Date().toISOString(),
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'G-Fast Workshop API',
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// ERROR HANDLING
// ============================================================================
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err.message);
  res.status(err.status || 500).json({
    error: err.message,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// START SERVER
// ============================================================================
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(80));
  console.log('🏭 G-FAST WORKSHOP APP SERVER - READY');
  console.log('='.repeat(80));
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`🚀 API endpoints:`);
  console.log(`   POST   /api/auth/login          - Workshop login`);
  console.log(`   POST   /api/analysis            - Run damage analysis`);
  console.log(`   GET    /api/estimates           - List estimates`);
  console.log(`   POST   /api/estimates           - Create estimate`);
  console.log(`   PUT    /api/estimates/:id       - Update estimate`);
  console.log(`   POST   /api/estimates/:id/confirm - Confirm estimate`);
  console.log(`   GET    /health                  - Health check`);
  console.log('='.repeat(80) + '\n');
});
