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

    let imagesToAnalyze = images;
    try {
      imagesToAnalyze = await compressImages(images, 75, 1920);
    } catch (error) {
      console.log(`⚠️ Image compression error: ${error.message}, using original images`);
    }

    // Use complete 4-stage analysis pipeline from wreck-vision (byte-identical)
    const analysisData = await analyzeVehicleDamage(imagesToAnalyze, vehicleInfo, process.env.WORKSHOP_GEMINI_API_KEY);

    console.log(`✅ 4-Stage analysis complete: ${analysisData.damages?.length || 0} damages found, ${analysisData.needs_check_parts?.length || 0} needs_check`);

    // Enrich with PARTS_DATABASE and pricing
    const enriched = enrichDamageData(analysisData, vehicleInfo);

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
