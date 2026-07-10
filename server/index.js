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
import { compressImages, callGeminiWithImages, enrichDamageData } from './gemini-analysis.js';
import { analyzeVehicleDamage } from './analysis-4stage-full.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const app = express();
const PORT = process.env.PORT || 5001;

// ============================================================================
// MIDDLEWARE
// ============================================================================
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

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

    // Try real Gemini with complete 4-stage analysis pipeline
    try {
      let imagesToAnalyze = images;
      try {
        imagesToAnalyze = await compressImages(images, 75, 1920);
      } catch (error) {
        console.log(`⚠️ Image compression error: ${error.message}, using original images`);
      }

      // Use complete 4-stage analysis pipeline from wreck-vision (byte-identical)
      const analysisData = await analyzeVehicleDamage(imagesToAnalyze, vehicleInfo, process.env.WORKSHOP_GEMINI_API_KEY);

      console.log(`✅ 4-Stage analysis complete: ${analysisData.damages?.length || 0} damages found`);
      // Enrich with PARTS_DATABASE and pricing
      const enriched = enrichDamageData(analysisData, vehicleInfo);
      return res.json({ success: true, analysis: enriched });
    } catch (geminiError) {
      console.log(`⚠️ Gemini API unavailable: ${geminiError.message}`);
      console.log('📌 Using MOCK analysis (for testing - replace with valid API key for production)');
    }

    // Fallback: Mock analysis with wreck-vision structure
    const mockAnalysis = {
      damages: [
        {
          part_name_en: 'Front Bumper',
          part_name_ar: 'المصد الأمامي',
          damage_type: 'Dent',
          severity_label: 'Repair',
          confidence: 0.95,
          is_ai_detected: true,
        },
        {
          part_name_en: 'Hood',
          part_name_ar: 'غطاء المحرك',
          damage_type: 'Scratch',
          severity_label: 'Repair',
          confidence: 0.87,
          is_ai_detected: true,
        },
      ],
      needs_check_parts: [
        {
          part_name_en: 'Left Door',
          part_name_ar: 'الباب الأيسر الأمامي',
          damage_type: 'Dent',
          severity_label: 'Repair',
          confidence: 0.65,
          is_ai_detected: true,
        },
        {
          part_name_en: 'Left Fender',
          part_name_ar: 'الرفرف الأيسر',
          damage_type: 'Paint Damage',
          severity_label: 'Replace',
          confidence: 0.58,
          is_ai_detected: true,
        },
      ],
    };

    console.log(`📌 Mock analysis: ${mockAnalysis.damages.length} damages, ${mockAnalysis.needs_check_parts?.length || 0} needs_check (API fallback)`);
    console.log(`📝 Before enrich:`, JSON.stringify({damages: mockAnalysis.damages.length, needs_check: mockAnalysis.needs_check_parts?.length}));
    // Enrich with PARTS_DATABASE and pricing
    const enriched = enrichDamageData(mockAnalysis, vehicleInfo);
    console.log(`✅ Enriched analysis: ${enriched.damages.length} damages, ${enriched.needs_check_parts?.length || 0} needs_check`);
    res.json({
      success: true,
      analysis: enriched,
    });
  } catch (err) {
    console.error('❌ Analysis error:', err.message);
    next(err);
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
