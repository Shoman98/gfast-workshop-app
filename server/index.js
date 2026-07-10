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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const app = express();
const PORT = process.env.PORT || 3001;

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

// Analysis route - mock response for now (analysis-core auto-starts wreck-vision server)
app.post('/api/analysis', (req, res) => {
  const { images } = req.body;
  const imageCount = images?.length || 0;

  if (imageCount < 6 || imageCount > 30) {
    return res.status(400).json({
      success: false,
      error: 'يجب رفع من ٦ إلى ٣٠ صورة',
    });
  }

  res.json({
    success: true,
    analysis: {
      damages: [
        {
          part_name_en: 'Front Bumper',
          part_name_ar: 'المصد الأمامي',
          damage_type: 'Dent',
          confidence: 0.95,
          severity_label: 'Repair',
          price: 1500,
          is_ai_detected: true,
        },
        {
          part_name_en: 'Hood',
          part_name_ar: 'غطاء المحرك',
          damage_type: 'Scratch',
          confidence: 0.87,
          severity_label: 'Repair',
          price: 800,
          is_ai_detected: true,
        },
      ],
    },
  });
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
