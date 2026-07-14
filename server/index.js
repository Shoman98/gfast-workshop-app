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
import pkg from '@gfast/analysis-core';
const { runAnalysisPipeline, enrichDamageData, PARTS_DATABASE, DAMAGE_TYPE_INDEX, PART_NAME_ALIASES } = pkg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env.local') });

// CRITICAL: Override GEMINI_API_KEY to use workshop app's key, not wreck-vision's
// The shared module (@gfast/analysis-core) reads process.env.GEMINI_API_KEY
// We need to ensure it uses the workshop app's key for Gemini calls
if (process.env.WORKSHOP_GEMINI_API_KEY) {
  process.env.GEMINI_API_KEY = process.env.WORKSHOP_GEMINI_API_KEY;
  console.log(`🔑 Configured Gemini API key for workshop app`);
}

const app = express();
const PORT = process.env.PORT || 3333;

// ============================================================================
// MIDDLEWARE
// ============================================================================
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

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

    // Use shared alias map from @gfast/analysis-core — same as wreck-vision
    const resolvedKey = PART_NAME_ALIASES[partKey] || partKey;
    const partInfo = PARTS_DATABASE[resolvedKey] || {};
    const damageTypeLower = damageType.toLowerCase();
    const damageIndex = DAMAGE_TYPE_MAP[damageTypeLower] !== undefined ? DAMAGE_TYPE_MAP[damageTypeLower] : 5;
    const partCategory = (partInfo.category || '').toLowerCase();

    // Base rule: index < 4 → Repair, >= 4 → Replace
    let severityLabel = damageIndex < 4 ? 'Repair' : 'Replace';

    // Category overrides — same as wreck-vision enrichDamageData
    const alwaysReplace = ['airbags_safety', 'interior', 'mechanical', 'suspension'];
    const alwaysRepair  = ['structural', 'chassis', 'chassis_structure'];
    if (alwaysReplace.includes(partCategory)) {
      severityLabel = 'Replace';
    } else if (alwaysRepair.includes(partCategory)) {
      severityLabel = 'Repair';
    } else if (damageTypeLower.includes('buckl')) {
      severityLabel = 'Repair';
    }

    return {
      part_name_en: partInfo.nameEn || partNameEn || 'Unknown Part',
      part_name_ar: partInfo.nameAr || partNameAr || null,
      damage_type: damageType || 'unknown',
      description: part.description || part.visualEvidence || '',
      confidence: (part.confidence > 1 ? part.confidence / 100 : part.confidence) || 0.5,
      severity_label: severityLabel,
      price: 0,
      partId: partInfo.partId || null,
      category: partInfo.category || 'exterior',
      is_ai_detected: part.is_ai_detected !== false,
      isUnmapped: !PARTS_DATABASE[resolvedKey],
      reason_for_uncertainty: part.reason_for_uncertainty,
      // Additional fields from shared module (if present)
      location: part.location,
      safetyFlags: part.safetyFlags
    };
  }

  // The shared module merges needs_check into damages with recommendedDecision: 'inspect'
  // Split them back into two separate arrays
  const allParts = analysisData.damages || [];
  const confirmedDamages = allParts.filter(p => p.recommendedDecision !== 'inspect');
  const needsCheckFromShared = allParts.filter(p => p.recommendedDecision === 'inspect');

  // Convert hiddenDamageAssessment (Stage 4 — AC condenser, radiator, etc.) into needs_check parts
  const hiddenDamageParts = (analysisData.hiddenDamageAssessment || []).map(item => ({
    partName: item.suspected_hidden_part || '',
    damageType: 'Hidden Damage',
    description: item.hidden_indicator?.replace('[HIDDEN] ', '') || '',
    confidence: (item.confidence || 50) > 1 ? (item.confidence || 50) / 100 : (item.confidence || 0.5),
    recommendedDecision: 'inspect',
    reason_for_uncertainty: `خلف: ${(item.visible_damage_part || '').replace(/_/g, ' ')}`,
  }));

  // Also include any explicit needs_check_parts if present
  const explicitNeedsCheck = analysisData.needs_check_parts || [];
  const allNeedsCheck = [...needsCheckFromShared, ...explicitNeedsCheck, ...hiddenDamageParts];

  console.log(`🔍 Split: ${confirmedDamages.length} confirmed, ${needsCheckFromShared.length} inspect, ${hiddenDamageParts.length} hidden → ${allNeedsCheck.length} needs_check total`);

  // Deduplicate by part_name_en — keep highest confidence when same part appears multiple times
  function deduplicateByName(parts) {
    const seen = new Map();
    for (const part of parts) {
      const key = (part.part_name_en || part.partName || '').toLowerCase().trim();
      if (!seen.has(key) || part.confidence > seen.get(key).confidence) {
        seen.set(key, part);
      }
    }
    return Array.from(seen.values());
  }

  const isMapped = (part) => !part.isUnmapped && part.part_name_ar && part.part_name_ar !== 'قطعة غير معروفة';

  const enrichedDamages = deduplicateByName(confirmedDamages)
    .map(enrichPart)
    .filter(isMapped);

  const enrichedNeedsCheck = deduplicateByName(allNeedsCheck)
    .map(enrichPart)
    .filter(isMapped);

  console.log(`✅ After dedup: ${enrichedDamages.length} damages, ${enrichedNeedsCheck.length} needs_check`);

  return {
    damages: enrichedDamages,
    needs_check_parts: enrichedNeedsCheck,
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

    // DEBUG: Show raw response structure BEFORE filtering
    console.log(`\n🔍 RAW GEMINI RESPONSE (BEFORE enrichment/filtering):`);
    console.log(`   DAMAGES (${analysisData.damages?.length || 0}):`);
    (analysisData.damages || []).slice(0, 3).forEach((d, i) => {
      console.log(`     [${i}] ${d.partName || d.part_name_en} - confidence: ${d.confidence} (${typeof d.confidence})`);
    });
    console.log(`   NEEDS_CHECK (${analysisData.needs_check_parts?.length || 0}):`);
    (analysisData.needs_check_parts || []).slice(0, 3).forEach((nc, i) => {
      console.log(`     [${i}] ${nc.partName || nc.part_name_en} - confidence: ${nc.confidence} (${typeof nc.confidence})`);
    });

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
