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
import insuranceRoutes from './routes/insurance.js';
import imageRoutes from './routes/images.js';
import pricingRoutes from './routes/pricing.js';
import workshopPricingRoutes from './routes/workshopPricing.js';
import adminRoutes from './routes/admin.js';
import publicRoutes from './routes/public.js';
import whatsappRoutes from './routes/whatsapp.js';
import { notifyWorkshopAnalysisAsync } from './lib/telegram-notify.js';
import { enrichAnalysisWithParts } from './lib/analysisPipeline.js';
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
app.set('trust proxy', 1); // Required for Railway/Vercel reverse proxy

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
app.use('/api/insurance', insuranceRoutes);
app.use('/api/images', imageRoutes);
app.use('/api/pricing', pricingRoutes);
app.use('/api/workshop-pricing', workshopPricingRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/whatsapp/webhook', whatsappRoutes);

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

    // Fire-and-forget Telegram notification for every workshop analysis
    notifyWorkshopAnalysisAsync({
      workshop_id: vehicleInfo.workshop_id,
      workshop_name: vehicleInfo.workshop_name,
      customer_name: vehicleInfo.customer_name,
      customer_mobile: vehicleInfo.customer_mobile,
      year: vehicleInfo.year,
      make: vehicleInfo.make,
      model: vehicleInfo.model,
      vin_number: vehicleInfo.vin_number,
      images_count: imageCount,
    }, process.env);

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

// Privacy policy (required for Meta app Live mode)
app.get('/privacy', (req, res) => {
  res.send(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>سياسة الخصوصية - G-Fast</title><style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.8}h1{color:#1a1a1a}h2{color:#333;margin-top:30px}</style></head><body><h1>سياسة الخصوصية</h1><p>آخر تحديث: ${new Date().getFullYear()}</p><h2>جمع البيانات</h2><p>تقوم G-Fast بجمع صور المركبات وبيانات المركبة (الماركة، الموديل، السنة) لأغراض تحليل الأضرار فقط.</p><h2>استخدام البيانات</h2><p>يتم استخدام البيانات المجمعة حصرياً لتقديم تقارير تحليل أضرار المركبات. لا يتم مشاركة البيانات مع أطراف ثالثة.</p><h2>تخزين البيانات</h2><p>يتم تخزين البيانات بشكل آمن ولا يتم الاحتفاظ بها لفترة أطول من اللازم.</p><h2>التواصل</h2><p>للاستفسارات المتعلقة بالخصوصية: gfast.egy@gmail.com</p></body></html>`)
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
