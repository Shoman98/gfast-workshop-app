/**
 * Vehicle Damage Analysis Server - Multi-Image Support
 * Using Google Gemini API with Vision capabilities
 * 
 * SETUP:
 * 1. Create .env.local file with: GEMINI_API_KEY=your_key_here
 * 2. Get key from: https://aistudio.google.com/app/apikey
 * 3. Run: node server.js
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { registerDemoRequestRoutes } = require('./server/demo-requests.cjs');
const { registerWorkshopFormRoutes } = require('./server/workshop-forms.cjs');
const { recordAnalysisEvent } = require('./server/analysis-events.cjs');
const {
  startAnalysisLog,
  appendLog,
  appendLogJSON,
  saveAnalysisRun,
} = require('./server/analysis-runs.cjs');
const {
  demoRequestRateLimit,
  analysisRateLimit,
  workshopFormRateLimit,
  workshopAbandonmentRateLimit,
} = require('./server/rate-limit.cjs');
require('dotenv').config({ path: path.join(__dirname, '.env.local') });

// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG = {
  PORT: process.env.PORT || 3001,
  MAX_IMAGE_SIZE: 10 * 1024 * 1024, // 10MB per image
  MIN_IMAGES: 2,
  MAX_IMAGES: 15,
  AI_TIMEOUT: 180000, // 180 seconds for multi-image (Gemini can be slow)
  GEMINI_MODEL: 'gemini-3-flash-preview',
  
  // Severity thresholds
  SEVERITY: {
    MINOR_MAX: 25,
    MODERATE_MAX: 60,
    SEVERE_MIN: 61
  },
  
  // Safety score thresholds
  SAFETY: {
    CRITICAL_MAX: 40,
    CONCERNING_MAX: 60,
    FAIR_MAX: 80
  }
};

// ============================================================================
// DAMAGE TYPE SEVERITY INDEX - Rule-Based Decision System
// index < 4 → Repair, index >= 4 → Replace (for ALL parts).
// Unknown damage types ALWAYS default to "Replace".
// SPECIAL CASE: 'buckled'/'buckling' → Repair on every part EXCEPT
//   structural/chassis members (rails, pillars), where they force Replace.
//   Handled in the category override block below — see SEVERITY DECISION section.
// ============================================================================
const DAMAGE_TYPE_INDEX = {
  // Standard damage types
  'dent': 2,
  'scratch': 1,
  'scuff marks': 1,
  'scuff': 1,
  'buckled': 3,
  'buckling': 3,
  'severe buckling': 4,
  'broken': 5,
  'crack': 5,
  'cracked': 5,
  'severe cracking': 5,
  'frame damage': 4,
  'structural integrity': 5,
  'deformation': 4,
  'severe deformation': 4,
  'impact deformation': 3,
  'structural deformation': 5,
  'misaligned': 1,
  'misalignment': 1,
  'bent': 1,
  'missing': 5,
  'detached': 5,
  'scrape': 3,
  'torn': 4,
  'tear': 5,
  'pushed forward': 3,
  'pushed back': 3,
  'pushed inward': 3,
  'rust': 3,

  // Lighting-specific damage types
  'shattered lens': 5,
  'broken housing': 5,
  'internal damage': 5,
  'spider-web fractures': 5,
  'spider web fractures': 5,
  'scratches on lens': 2,

  // Fluid/Safety damage types
  'leaks': 3,
  'leak': 3,
  'airbag deployment': 5,

  // Key visual indicators
  'creasing': 2,
  'heat deformation': 5,
  'melted': 5,
  'surface oxidation': 3,
  'paint failure': 2,
  'paint damage': 2,
  'paint scorching': 5,
  'soot accumulation': 5,
  'heavy soot': 5,
  'total paint loss': 4,
  'charred': 4,
  'paint scraping': 3,
  'black paint': 5,

  // Additional common variations
  'cracking': 5,
  'scratched': 1,
  'dented': 2,
  'rusted': 3,
  'corroded': 3,
  'corrosion': 3,
  'chipped': 2,
  'chip': 2,
  'peeling': 2,
  'faded': 1,
  'discolored': 1,
  'warped': 3,
  'punctured': 4,
  'puncture': 4,
  'shattered': 5,
  'crushed': 5,
  'collapsed': 5,
  'loose': 2,
  'separated': 3,
  'split': 4
};

/**
 * Get severity decision (Repair/Replace) based on damage type index.
 * Simple rule: index < 4 → Repair, index >= 4 → Replace.
 * Unknown damage types → ALWAYS Replace.
 * @param {string} damageType - The damage type detected
 * @returns {object} - { decision, index, isKnownType }
 */
function getSeverityDecision(damageType) {
  if (!damageType) {
    return { decision: 'Replace', index: null, isKnownType: false };
  }

  // 1. Resolve the damage-type index
  const normalizedType = damageType.toLowerCase().trim();
  let index = null;
  let isKnownType = false;

  // Try exact match first
  if (DAMAGE_TYPE_INDEX.hasOwnProperty(normalizedType)) {
    index = DAMAGE_TYPE_INDEX[normalizedType];
    isKnownType = true;
  } else {
    // Try partial match
    for (const [knownType, idx] of Object.entries(DAMAGE_TYPE_INDEX)) {
      if (normalizedType.includes(knownType) || knownType.includes(normalizedType)) {
        index = idx;
        isKnownType = true;
        break;
      }
    }
  }

  // 2. Unknown damage type → ALWAYS Replace
  if (!isKnownType) {
    console.log(`⚠️ Unknown damage type "${damageType}" - defaulting to Replace`);
    return { decision: 'Replace', index: null, isKnownType: false };
  }

  // 3. Simple rule: index < 4 → Repair, index >= 4 → Replace
  const decision = index < 4 ? 'Repair' : 'Replace';

  return { decision, index, isKnownType: true };
}

/**
 * Get the highest severity decision when multiple damage types are present.
 * Uses worst-case (highest index). If any type is unknown → Replace.
 * @param {string[]} damageTypes - Array of damage types
 * @returns {object} - { decision, maxIndex, hasUnknownType }
 */
function getMultipleDamageDecision(damageTypes) {
  if (!damageTypes || damageTypes.length === 0) {
    return { decision: 'Replace', maxIndex: null, hasUnknownType: true };
  }

  let maxIndex = 0;
  let hasUnknownType = false;

  for (const damageType of damageTypes) {
    const result = getSeverityDecision(damageType);
    if (!result.isKnownType) {
      hasUnknownType = true;
    }
    if (result.index !== null && result.index > maxIndex) {
      maxIndex = result.index;
    }
  }

  // If any unknown type → always Replace
  if (hasUnknownType) {
    return { decision: 'Replace', maxIndex: maxIndex || null, hasUnknownType: true };
  }

  // Simple rule applied to worst-case index
  const decision = maxIndex < 4 ? 'Repair' : 'Replace';

  return { decision, maxIndex, hasUnknownType: false };
}

// ============================================================================
// VALIDATE ENVIRONMENT
// ============================================================================
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error('\n❌ CRITICAL ERROR: GEMINI_API_KEY not found in environment!');
  console.error('\n📋 Setup Instructions:');
  console.error('   1. Go to: https://aistudio.google.com/app/apikey');
  console.error('   2. Create an API key');
  console.error('   3. Create .env.local file in project root');
  console.error('   4. Add: GEMINI_API_KEY=your_key_here\n');
  process.exit(1);
}

// ============================================================================
// PARTS DATABASE — Part Taxonomy v3.1 (202 rows in xlsx → 187 canonical entries
// after merging near-duplicate IDs into aliases). 5 categories: exterior_body,
// interior, airbags_safety, mechanical, chassis_structure. Source of truth:
// public/Part_Taxonomy_v3_1.xlsx.
// Note: chassis_structure parts trigger the buckled-→-Replace override; all
// other categories repair buckled damage via bodywork.
// ============================================================================
const PARTS_DATABASE = {
  hood: { price: 2800, nameEn: 'hood', nameAr: 'كبوت', partId: 'PT_0001', category: 'exterior' },
  front_windshield: { price: 2100, nameEn: 'front windshield', nameAr: 'زجاج أمامي', partId: 'PT_0002', category: 'exterior' },
  front_wipers: { price: 0, nameEn: 'front wipers', nameAr: 'مسّاحات أمامي', partId: 'PT_0003', category: 'exterior' },
  a_pillars: { price: 0, nameEn: 'A pillars', nameAr: '(قائم أمامي)', partId: 'PT_0004', category: 'chassis_structure' },
  roof: { price: 5000, nameEn: 'roof', nameAr: 'سقف', partId: 'PT_0005', category: 'exterior' },
  grille: { price: 1050, nameEn: 'grille', nameAr: 'شبكة أمامية', partId: 'PT_0006', category: 'exterior' },
  front_right_headlight: { price: 5600, nameEn: 'front right headlight', nameAr: 'فانوس أمامي يمين', partId: 'PT_0007', category: 'exterior' },
  front_left_headlight: { price: 5600, nameEn: 'front left headlight', nameAr: 'فانوس أمامي شمال', partId: 'PT_0008', category: 'exterior' },
  upper_bumper: { price: 1610, nameEn: 'upper bumper', nameAr: 'اكصدام أمامي علوي', partId: 'PT_0009', category: 'exterior' },
  front_car_logo: { price: 0, nameEn: 'front car logo', nameAr: 'شعار العربية (امامي)', partId: 'PT_0010', category: 'exterior' },
  trim_nickel_grille: { price: 0, nameEn: 'trim nickel grille', nameAr: 'كروم/حلية الشبكة', partId: 'PT_0011', category: 'exterior' },
  lower_grille: { price: 0, nameEn: 'lower grille', nameAr: 'شبكة سفلية', partId: 'PT_0012', category: 'exterior' },
  front_right_foglight: { price: 0, nameEn: 'front right foglight', nameAr: 'كشاف ضباب يمين', partId: 'PT_0013', category: 'exterior' },
  front_left_foglight: { price: 0, nameEn: 'front left foglight', nameAr: 'كشاف ضباب شمال', partId: 'PT_0014', category: 'exterior' },
  lower_bumper: { price: 0, nameEn: 'lower bumper', nameAr: 'اكصدام أمامي سفلي', partId: 'PT_0015', category: 'exterior' },
  front_left_fog_trim: { price: 0, nameEn: 'front left fog trim', nameAr: 'إطار/تريم كشاف الضباب شمال', partId: 'PT_0016', category: 'exterior' },
  front_right_fog_trim: { price: 0, nameEn: 'front right fog trim', nameAr: 'إطار/تريم كشاف الضباب يمين', partId: 'PT_0017', category: 'exterior' },
  front_left_fender: { price: 2000, nameEn: 'front left fender', nameAr: 'رفرف أمامي شمال', partId: 'PT_0018', category: 'exterior' },
  left_rocker_panel: { price: 0, nameEn: 'left rocker panel', nameAr: 'عتبة جنب شمال', partId: 'PT_0019', category: 'exterior' },
  front_left_door: { price: 4200, nameEn: 'front left door', nameAr: 'باب أمامي شمال', partId: 'PT_0020', category: 'exterior' },
  rear_left_door: { price: 3800, nameEn: 'rear left door', nameAr: 'باب خلفي شمال', partId: 'PT_0021', category: 'exterior' },
  left_quarter_panel: { price: 3500, nameEn: 'left quarter panel', nameAr: 'رفرف خلفي شمال', partId: 'PT_0022', category: 'exterior' },
  left_mirror: { price: 800, nameEn: 'left mirror', nameAr: 'مراية شمال', partId: 'PT_0023', category: 'exterior' },
  front_left_door_window: { price: 0, nameEn: 'front left door window', nameAr: 'زجاج باب أمامي شمال', partId: 'PT_0024', category: 'exterior' },
  rear_left_door_window: { price: 0, nameEn: 'rear left door window', nameAr: 'زجاج باب خلفي شمال', partId: 'PT_0025', category: 'exterior' },
  front_left_door_handle: { price: 0, nameEn: 'front left door handle', nameAr: 'أوكره/مقبض باب أمامي شمال', partId: 'PT_0026', category: 'exterior' },
  rear_left_door_handle: { price: 0, nameEn: 'rear left door handle', nameAr: 'أوكره/مقبض باب خلفي شمال', partId: 'PT_0027', category: 'exterior' },
  front_right_fender: { price: 2000, nameEn: 'front right fender', nameAr: 'رفرف أمامي يمين', partId: 'PT_0028', category: 'exterior' },
  right_rocker_panel: { price: 0, nameEn: 'right rocker panel', nameAr: 'عتبة جنب يمين', partId: 'PT_0029', category: 'exterior' },
  front_right_door: { price: 4200, nameEn: 'front right door', nameAr: 'باب أمامي يمين', partId: 'PT_0030', category: 'exterior' },
  rear_right_door: { price: 3800, nameEn: 'rear right door', nameAr: 'باب خلفي يمين', partId: 'PT_0031', category: 'exterior' },
  rear_right_quarter_panel: { price: 3500, nameEn: 'rear right quarter panel', nameAr: 'رفرف خلفي يمين', partId: 'PT_0032', category: 'exterior' },
  b_pillar: { price: 0, nameEn: 'B pillar', nameAr: 'قايم وسط', partId: 'PT_0033', category: 'chassis_structure' },
  right_mirror: { price: 800, nameEn: 'right mirror', nameAr: 'مراية يمين', partId: 'PT_0034', category: 'exterior' },
  front_right_door_window: { price: 0, nameEn: 'front right door window', nameAr: 'زجاج باب أمامي يمين', partId: 'PT_0035', category: 'exterior' },
  rear_right_door_window: { price: 0, nameEn: 'rear right door window', nameAr: 'زجاج باب خلفي يمين', partId: 'PT_0036', category: 'exterior' },
  front_right_door_trim: { price: 0, nameEn: 'front right door trim', nameAr: 'تريم/حلية باب أمامي يمين', partId: 'PT_0037', category: 'exterior' },
  rear_right_door_trim: { price: 0, nameEn: 'rear right door trim', nameAr: 'تريم/حلية باب خلفي يمين', partId: 'PT_0038', category: 'exterior' },
  front_right_door_handle: { price: 0, nameEn: 'front right door handle', nameAr: 'أوكره/مقبض باب أمامي يمين', partId: 'PT_0039', category: 'exterior' },
  rear_right_door_handle: { price: 0, nameEn: 'rear right door handle', nameAr: 'أوكره/مقبض باب خلفي يمين', partId: 'PT_0040', category: 'exterior' },
  rear_bumper_upper: { price: 2030, nameEn: 'rear bumper upper', nameAr: 'اكصدام خلفي علوي', partId: 'PT_0041', category: 'exterior' },
  rear_bumper_lower: { price: 0, nameEn: 'rear bumper lower', nameAr: 'اكصدام خلفي سفلي', partId: 'PT_0042', category: 'exterior' },
  rear_wiper: { price: 0, nameEn: 'rear wiper', nameAr: 'مسّاحة خلفي', partId: 'PT_0043', category: 'exterior' },
  c_pillar: { price: 0, nameEn: 'C pillar', nameAr: 'قايم خلفي', partId: 'PT_0044', category: 'chassis_structure' },
  rear_windshield: { price: 0, nameEn: 'rear windshield', nameAr: 'زجاج خلفي', partId: 'PT_0045', category: 'exterior' },
  rear_left_headlight_inner: { price: 3200, nameEn: 'rear left headlight inner', nameAr: 'فانوس خلفي شمال (داخلي)', partId: 'PT_0046', category: 'exterior' },
  rear_right_headlight_inner: { price: 3200, nameEn: 'rear right headlight inner', nameAr: 'فانوس خلفي يمين (داخلي)', partId: 'PT_0047', category: 'exterior' },
  rear_left_headlight_outer: { price: 3200, nameEn: 'rear left headlight outer', nameAr: 'فانوس خلفي شمال (خارجي)', partId: 'PT_0048', category: 'exterior' },
  rear_right_headlight_outer: { price: 3200, nameEn: 'rear right headlight outer', nameAr: 'فانوس خلفي يمين (خارجي)', partId: 'PT_0049', category: 'exterior' },
  trunk_door: { price: 3500, nameEn: 'trunk door', nameAr: 'باب الشنطة', partId: 'PT_0050', category: 'exterior' },
  rear_car_logo: { price: 0, nameEn: 'rear car logo', nameAr: 'شعار العربية (خلفي)', partId: 'PT_0051', category: 'exterior' },
  front_left_tire: { price: 0, nameEn: 'front left tire', nameAr: 'كوتش أمامي شمال', partId: 'PT_0052', category: 'exterior' },
  front_right_tire: { price: 0, nameEn: 'front right tire', nameAr: 'كوتش أمامي يمين', partId: 'PT_0053', category: 'exterior' },
  rear_right_tire: { price: 0, nameEn: 'rear right tire', nameAr: 'كوتش خلفي يمين', partId: 'PT_0054', category: 'exterior' },
  rear_left_tire: { price: 0, nameEn: 'rear left tire', nameAr: 'كوتش خلفي شمال', partId: 'PT_0055', category: 'exterior' },
  front_left_wheel: { price: 0, nameEn: 'front left wheel', nameAr: 'جنط أمامي شمال', partId: 'PT_0056', category: 'exterior' },
  front_right_wheel: { price: 0, nameEn: 'front right wheel', nameAr: 'جنط أمامي يمين', partId: 'PT_0057', category: 'exterior' },
  rear_right_wheel: { price: 0, nameEn: 'rear right wheel', nameAr: 'جنط خلفي يمين', partId: 'PT_0058', category: 'exterior' },
  rear_left_wheel: { price: 0, nameEn: 'rear left wheel', nameAr: 'جنط خلفي شمال', partId: 'PT_0059', category: 'exterior' },
  roof_window: { price: 0, nameEn: 'roof window', nameAr: 'فتحة سقف', partId: 'PT_0060', category: 'exterior' },
  roof_trims: { price: 0, nameEn: 'roof trims', nameAr: 'حليات/تريم السقف', partId: 'PT_0061', category: 'exterior' },
  aerial: { price: 0, nameEn: 'aerial', nameAr: 'أريال', partId: 'PT_0062', category: 'exterior' },
  front_left_fender_liner: { price: 0, nameEn: 'front left fender liner', nameAr: 'داير رفرف امامي شمال', partId: 'PT_0063', category: 'exterior' },
  front_right_fender_liner: { price: 0, nameEn: 'front right fender liner', nameAr: 'داير رفرف امامي يمين', partId: 'PT_0064', category: 'exterior' },
  rear_left_fender_liner: { price: 0, nameEn: 'rear left fender liner', nameAr: 'داير رفرف خلفي شمال', partId: 'PT_0065', category: 'exterior' },
  rear_right_fender_liner: { price: 0, nameEn: 'rear right fender liner', nameAr: 'داير رفرف خلفي يمين', partId: 'PT_0066', category: 'exterior' },
  tableau: { price: 0, nameEn: 'tableau', nameAr: 'تابلوه', partId: 'PT_0067', category: 'interior' },
  dashboard_internal_structure: { price: 0, nameEn: 'dashboard internal structure', nameAr: 'تابلوه', partId: 'PT_0068', category: 'interior' },
  washer_fluid_reservoir: { price: 0, nameEn: 'washer fluid reservoir', nameAr: 'قربه مياه مساحات', partId: 'PT_0069', category: 'interior' },
  front_left_seatbelt: { price: 0, nameEn: 'front left seatbelt', nameAr: 'حزام امامي شمال', partId: 'PT_0070', category: 'airbags_safety', isSafety: true },
  front_right_seatbelt: { price: 0, nameEn: 'front right seatbelt', nameAr: 'حزام امامي يمين', partId: 'PT_0071', category: 'airbags_safety', isSafety: true },
  rear_left_seatbelt: { price: 0, nameEn: 'rear left seatbelt', nameAr: 'حزام خلفي شمال', partId: 'PT_0072', category: 'airbags_safety', isSafety: true },
  rear_right_seatbelt: { price: 0, nameEn: 'rear right seatbelt', nameAr: 'حزام خلفي يمين', partId: 'PT_0073', category: 'airbags_safety', isSafety: true },
  front_left_seatbelt_pretensioner: { price: 0, nameEn: 'front left seatbelt pretensioner', nameAr: 'شدّاد حزام الأمان', partId: 'PT_0074', category: 'airbags_safety', isSafety: true },
  front_right_seatbelt_pretensioner: { price: 0, nameEn: 'front right seatbelt pretensioner', nameAr: 'شدّاد حزام الأمان', partId: 'PT_0075', category: 'airbags_safety', isSafety: true },
  rear_left_seatbelt_pretensioner: { price: 0, nameEn: 'rear left seatbelt pretensioner', nameAr: 'شدّاد حزام الأمان', partId: 'PT_0076', category: 'airbags_safety', isSafety: true },
  rear_right_seatbelt_pretensioner: { price: 0, nameEn: 'rear right seatbelt pretensioner', nameAr: 'شدّاد حزام الأمان', partId: 'PT_0077', category: 'airbags_safety', isSafety: true },
  airbag_module: { price: 0, nameEn: 'airbag module', nameAr: 'كنترول الايرباج', partId: 'PT_0078', category: 'airbags_safety', isSafety: true },
  airbag_control_module: { price: 0, nameEn: 'airbag control module', nameAr: 'كنترول ايرباج', partId: 'PT_0079', category: 'airbags_safety', isSafety: true },
  side_curtain_airbag_system: { price: 0, nameEn: 'side curtain airbag system', nameAr: 'ايرباجات قوايم', partId: 'PT_0080', category: 'airbags_safety', isSafety: true },
  left_side_curtain_airbags: { price: 0, nameEn: 'left-side curtain airbags', nameAr: 'ايرباج قايم شمال', partId: 'PT_0081', category: 'airbags_safety', isSafety: true },
  right_side_curtain_airbags: { price: 0, nameEn: 'right-side curtain airbags', nameAr: 'ايرباج قايم يمين', partId: 'PT_0082', category: 'airbags_safety', isSafety: true },
  steering_wheel_driver_airbag: { price: 0, nameEn: 'steering wheel/driver airbag', nameAr: 'ايرباج سائق', partId: 'PT_0083', category: 'airbags_safety', isSafety: true },
  steering_wheel_airbag: { price: 0, nameEn: 'steering wheel airbag', nameAr: 'ايرباج تابلوه', partId: 'PT_0084', category: 'airbags_safety', isSafety: true },
  driver_knee_airbag: { price: 0, nameEn: 'driver knee airbag', nameAr: 'وسادة هوائية لركبة السائق', partId: 'PT_0085', category: 'airbags_safety', isSafety: true },
  airbag_impact_sensors: { price: 0, nameEn: 'airbag impact sensors', nameAr: 'حساس تصادم ايرباج امامي', partId: 'PT_0086', category: 'airbags_safety', isSafety: true },
  front_impact_sensor: { price: 0, nameEn: 'front impact sensor', nameAr: 'حساس تصادم امامي', partId: 'PT_0087', category: 'airbags_safety', isSafety: false },
  bcm_module: { price: 0, nameEn: 'bcm module', nameAr: 'كنترول BCM', partId: 'PT_0088', category: 'airbags_safety', isSafety: true },
  ecm_module: { price: 0, nameEn: 'ecm module', nameAr: 'كنترول ECM', partId: 'PT_0089', category: 'airbags_safety', isSafety: true },
  tcm_module: { price: 0, nameEn: 'tcm module', nameAr: 'كنترول TCM', partId: 'PT_0090', category: 'airbags_safety', isSafety: true },
  adas_module: { price: 0, nameEn: 'adas module', nameAr: 'كنترول ADAS', partId: 'PT_0091', category: 'airbags_safety', isSafety: true },
  front_parking_sensors: { price: 0, nameEn: 'front parking sensors', nameAr: 'حساسات ركن أمامي', partId: 'PT_0092', category: 'airbags_safety', isSafety: false },
  rear_parking_sensors: { price: 0, nameEn: 'rear parking sensors', nameAr: 'حساسات ركن خلفي', partId: 'PT_0093', category: 'airbags_safety', isSafety: false },
  front_camera: { price: 0, nameEn: 'front camera', nameAr: 'كاميرا أمامية', partId: 'PT_0094', category: 'airbags_safety', isSafety: true },
  rear_camera: { price: 0, nameEn: 'rear camera', nameAr: 'كاميرا خلفية', partId: 'PT_0095', category: 'airbags_safety', isSafety: false },
  front_harness: { price: 0, nameEn: 'front harness', nameAr: 'ضفيرة أمامي', partId: 'PT_0096', category: 'airbags_safety', isSafety: false },
  rear_harness: { price: 0, nameEn: 'rear harness', nameAr: 'ضفيرة خلفي', partId: 'PT_0097', category: 'airbags_safety', isSafety: false },
  front_wiring_harness_and_sensors: { price: 0, nameEn: 'front wiring harness and sensors', nameAr: 'ضفيره امامي بالحساسات', partId: 'PT_0098', category: 'airbags_safety', isSafety: false },
  rear_parking_sensor_harness: { price: 0, nameEn: 'rear parking sensor harness', nameAr: 'ضفيره خلفي بالحساسات', partId: 'PT_0099', category: 'airbags_safety', isSafety: false },
  battery: { price: 0, nameEn: 'battery', nameAr: 'بطارية', partId: 'PT_0100', category: 'airbags_safety', isSafety: false },
  exhaust_manifold: { price: 0, nameEn: 'exhaust manifold', nameAr: 'مانيفولد الشكمان', partId: 'PT_0101', category: 'mechanical' },
  exhaust_front_pipe: { price: 0, nameEn: 'exhaust front pipe', nameAr: 'ماسورة الشكمان الأمامية', partId: 'PT_0102', category: 'mechanical' },
  exhaust_middle_pipe: { price: 0, nameEn: 'exhaust middle pipe', nameAr: 'ماسورة الشكمان الوسط', partId: 'PT_0103', category: 'mechanical' },
  exhaust_rear_pipe: { price: 0, nameEn: 'exhaust rear pipe', nameAr: 'ماسورة الشكمان الخلفية', partId: 'PT_0104', category: 'mechanical' },
  brake_hoses: { price: 0, nameEn: 'brake hoses', nameAr: 'خراطيم الفرامل', partId: 'PT_0105', category: 'mechanical' },
  gas_hoses: { price: 0, nameEn: 'gas hoses', nameAr: 'خراطيم البنزين', partId: 'PT_0106', category: 'mechanical' },
  fuel_tank: { price: 0, nameEn: 'fuel tank', nameAr: 'تانك البنزين', partId: 'PT_0107', category: 'mechanical' },
  engine_block: { price: 0, nameEn: 'engine block', nameAr: 'بلوك الموتور', partId: 'PT_0108', category: 'mechanical' },
  engine_oil_pan: { price: 0, nameEn: 'engine oil pan', nameAr: 'كرتيرة زيت الموتور', partId: 'PT_0109', category: 'mechanical' },
  transmission_housing: { price: 0, nameEn: 'transmission housing', nameAr: 'جسم/علبة الفتيس', partId: 'PT_0110', category: 'mechanical' },
  transmission_oil_pan: { price: 0, nameEn: 'transmission oil pan', nameAr: 'كرتيرة زيت الفتيس', partId: 'PT_0111', category: 'mechanical' },
  engine_mounts: { price: 0, nameEn: 'engine mounts', nameAr: 'قواعد الموتور', partId: 'PT_0112', category: 'mechanical' },
  transmission_mounts: { price: 0, nameEn: 'transmission mounts', nameAr: 'قواعد الفتيس', partId: 'PT_0113', category: 'mechanical' },
  driveshaft: { price: 0, nameEn: 'driveshaft', nameAr: 'عمود الكردان', partId: 'PT_0114', category: 'mechanical' },
  front_differential: { price: 0, nameEn: 'front differential', nameAr: 'دفرنس أمامي', partId: 'PT_0115', category: 'mechanical' },
  rear_differential: { price: 0, nameEn: 'rear differential', nameAr: 'دفرنس خلفي', partId: 'PT_0116', category: 'mechanical' },
  radiator: { price: 0, nameEn: 'radiator', nameAr: 'ردياتير', partId: 'PT_0117', category: 'mechanical' },
  ac_condenser: { price: 0, nameEn: 'ac condenser', nameAr: '(سربنتينه التكييف)', partId: 'PT_0118', category: 'mechanical' },
  intercooler_turbo: { price: 0, nameEn: 'intercooler turbo', nameAr: 'انتركولر التيربو', partId: 'PT_0119', category: 'mechanical' },
  radiator_cap: { price: 0, nameEn: 'radiator cap', nameAr: 'غطا الردياتير', partId: 'PT_0120', category: 'mechanical' },
  transmission_cooler: { price: 0, nameEn: 'transmission cooler', nameAr: 'مبرد الفتيس', partId: 'PT_0121', category: 'mechanical' },
  coolant_pump: { price: 0, nameEn: 'coolant pump', nameAr: 'طلمبة مياه', partId: 'PT_0122', category: 'mechanical' },
  radiator_hoses: { price: 0, nameEn: 'radiator hoses', nameAr: 'خراطيم الردياتير', partId: 'PT_0123', category: 'mechanical' },
  turbo_coolant_hoses: { price: 0, nameEn: 'turbo coolant hoses', nameAr: 'خراطيم مياه التيربو', partId: 'PT_0124', category: 'mechanical' },
  radiator_fan: { price: 0, nameEn: 'radiator fan', nameAr: 'مروحة الردياتير', partId: 'PT_0125', category: 'mechanical' },
  fan_motor: { price: 0, nameEn: 'fan motor', nameAr: 'موتور المروحة', partId: 'PT_0126', category: 'mechanical' },
  front_right_shock_absorber: { price: 0, nameEn: 'front right shock absorber', nameAr: 'مساعد أمامي يمين', partId: 'PT_0127', category: 'mechanical' },
  front_left_shock_absorber: { price: 0, nameEn: 'front left shock absorber', nameAr: 'مساعد أمامي شمال', partId: 'PT_0128', category: 'mechanical' },
  rear_left_shock_absorber: { price: 0, nameEn: 'rear left shock absorber', nameAr: 'مساعد خلفي شمال', partId: 'PT_0129', category: 'mechanical' },
  rear_right_shock_absorber: { price: 0, nameEn: 'rear right shock absorber', nameAr: 'مساعد خلفي يمين', partId: 'PT_0130', category: 'mechanical' },
  front_right_control_arm: { price: 0, nameEn: 'front right control arm', nameAr: 'مقص أمامي يمين', partId: 'PT_0131', category: 'mechanical' },
  front_left_control_arm: { price: 0, nameEn: 'front left control arm', nameAr: 'مقص أمامي شمال', partId: 'PT_0132', category: 'mechanical' },
  rear_right_control_arm: { price: 0, nameEn: 'rear right control arm', nameAr: 'مقص خلفي يمين', partId: 'PT_0133', category: 'mechanical' },
  rear_left_control_arm: { price: 0, nameEn: 'rear left control arm', nameAr: 'مقص خلفي شمال', partId: 'PT_0134', category: 'mechanical' },
  front_right_steering_knuckle: { price: 0, nameEn: 'front right steering knuckle', nameAr: 'شمعدان امامي يمين', partId: 'PT_0135', category: 'mechanical' },
  front_left_steering_knuckle: { price: 0, nameEn: 'front left steering knuckle', nameAr: 'شمعدان امامي شمال', partId: 'PT_0136', category: 'mechanical' },
  rear_right_steering_knuckle: { price: 0, nameEn: 'rear right steering knuckle', nameAr: 'شمعدان خلفي يمين', partId: 'PT_0137', category: 'mechanical' },
  rear_left_steering_knuckle: { price: 0, nameEn: 'rear left steering knuckle', nameAr: 'شمعدان خلفي شمال', partId: 'PT_0138', category: 'mechanical' },
  steering_rack: { price: 0, nameEn: 'steering rack', nameAr: 'علبة الدريكسيون', partId: 'PT_0139', category: 'mechanical' },
  steering_column: { price: 0, nameEn: 'steering column', nameAr: 'عمود الدريكسيون', partId: 'PT_0140', category: 'mechanical' },
  inner_tie_rod: { price: 0, nameEn: 'inner tie rod', nameAr: 'باره داخلي', partId: 'PT_0141', category: 'mechanical' },
  outer_tie_rod: { price: 0, nameEn: 'outer tie rod', nameAr: 'باره خارجي', partId: 'PT_0142', category: 'mechanical' },
  suspension_control_arms: { price: 0, nameEn: 'suspension control arms', nameAr: 'مقصات امامي', partId: 'PT_0143', category: 'mechanical' },
  tie_rods: { price: 0, nameEn: 'tie rods', nameAr: 'بارات خارجي', partId: 'PT_0144', category: 'mechanical' },
  front_left_suspension_assembly: { price: 0, nameEn: 'front left suspension assembly', nameAr: 'عفشه امامي شمال', partId: 'PT_0145', category: 'mechanical' },
  front_right_suspension_assembly: { price: 0, nameEn: 'front right suspension assembly', nameAr: 'عفشه امامي يمين', partId: 'PT_0146', category: 'mechanical' },
  rear_left_suspension_assembly: { price: 0, nameEn: 'rear left suspension assembly', nameAr: 'عفشه خلفي شمال', partId: 'PT_0147', category: 'mechanical' },
  rear_right_suspension_assembly: { price: 0, nameEn: 'rear right suspension assembly', nameAr: 'عفشه خلفي يمين', partId: 'PT_0148', category: 'mechanical' },
  cooling_system: { price: 0, nameEn: 'cooling system', nameAr: 'طقم تبريد', partId: 'PT_0149', category: 'mechanical' },
  cooling_fan_assembly: { price: 0, nameEn: 'cooling fan assembly', nameAr: 'مروحه تبريد', partId: 'PT_0150', category: 'mechanical' },
  radiator_and_cooling_fan_assembly: { price: 0, nameEn: 'radiator and cooling fan assembly', nameAr: 'طقم تبريد', partId: 'PT_0151', category: 'mechanical' },
  radiator_and_condenser: { price: 0, nameEn: 'radiator and condenser', nameAr: 'طقم تبريد بدون مروحه', partId: 'PT_0152', category: 'mechanical' },
  underbody_chassis: { price: 0, nameEn: 'underbody chassis', nameAr: 'بطن العربية/الشاسيه السفلي', partId: 'PT_0153', category: 'chassis_structure' },
  engine_shield: { price: 0, nameEn: 'engine shield', nameAr: 'غطاء/درع حماية الموتور السفلي', partId: 'PT_0154', category: 'chassis_structure' },
  rear_shield: { price: 0, nameEn: 'rear shield', nameAr: 'غطاء/درع حماية خلفي', partId: 'PT_0155', category: 'chassis_structure' },
  front_shield: { price: 0, nameEn: 'front shield', nameAr: 'غطاء/درع حماية أمامي', partId: 'PT_0156', category: 'chassis_structure' },
  front_bumper_chassis_bar: { price: 0, nameEn: 'front bumper chassis bar', nameAr: 'عارضة/حديد الصدام الأمامي', partId: 'PT_0157', category: 'chassis_structure' },
  front_carrier: { price: 0, nameEn: 'front carrier', nameAr: 'صدر أمامي (حامل ردياتير)', partId: 'PT_0158', category: 'chassis_structure' },
  rear_bumper_chassis_bar: { price: 0, nameEn: 'rear bumper chassis bar', nameAr: 'عارضة/حديد الصدام الخلفي', partId: 'PT_0159', category: 'chassis_structure' },
  rear_bumper_crash_foam: { price: 0, nameEn: 'rear bumper crash foam', nameAr: 'فوم اكصدام خلفي', partId: 'PT_0160', category: 'chassis_structure' },
  front_right_cross_member: { price: 0, nameEn: 'front right cross member', nameAr: 'فرده شاسيه أمامية يمين', partId: 'PT_0161', category: 'chassis_structure' },
  front_left_cross_member: { price: 0, nameEn: 'front left cross member', nameAr: 'فرده شاسيه أمامية شمال', partId: 'PT_0162', category: 'chassis_structure' },
  hood_latch: { price: 0, nameEn: 'hood latch', nameAr: 'كالون/قفل الكبوت', partId: 'PT_0163', category: 'chassis_structure' },
  hood_latch_assembly: { price: 0, nameEn: 'hood latch assembly', nameAr: 'كالون كبود', partId: 'PT_0164', category: 'chassis_structure' },
  front_right_rail: { price: 0, nameEn: 'front rail right', nameAr: 'سلاح رفرف امامي يمين', partId: 'PT_0165', category: 'chassis_structure' },
  front_left_rail: { price: 0, nameEn: 'front rail left', nameAr: 'سلاح رفرف امامي شمال', partId: 'PT_0166', category: 'chassis_structure' },
  front_left_pan_panel: { price: 0, nameEn: 'front left pan panel', nameAr: 'كرتيره صاج امامي شمال', partId: 'PT_0167', category: 'chassis_structure' },
  front_right_pan_panel: { price: 0, nameEn: 'front right pan panel', nameAr: 'كرتيره صاج امامي يمين', partId: 'PT_0168', category: 'chassis_structure' },
  rear_right_cross_member: { price: 0, nameEn: 'rear right cross member', nameAr: 'فرده شاسيه خلفية يمين', partId: 'PT_0169', category: 'chassis_structure' },
  rear_left_cross_member: { price: 0, nameEn: 'rear left cross member', nameAr: 'فرده شاسيه خلفية شمال', partId: 'PT_0170', category: 'chassis_structure' },
  spare_tire_pan: { price: 0, nameEn: 'spare tire pan', nameAr: 'حله الاستبن', partId: 'PT_0171', category: 'chassis_structure' },
  rear_right_pan_panel: { price: 0, nameEn: 'rear right pan panel', nameAr: 'كرتيره صاج خلفي يمين', partId: 'PT_0172', category: 'chassis_structure' },
  rear_left_pan_panel: { price: 0, nameEn: 'rear left pan panel', nameAr: 'كرتيره صاج خلفي شمال', partId: 'PT_0173', category: 'chassis_structure' },
  rear_right_inner_pillar: { price: 0, nameEn: 'rear right inner pillar', nameAr: 'قايم داخلي خلفي يمين', partId: 'PT_0174', category: 'chassis_structure' },
  rear_left_inner_pillar: { price: 0, nameEn: 'rear left inner pillar', nameAr: 'قايم داخلي خلفي شمال', partId: 'PT_0175', category: 'chassis_structure' },
  front_right_inner_pillar: { price: 0, nameEn: 'front right inner pillar', nameAr: 'قايم داخلي أمامي يمين', partId: 'PT_0176', category: 'chassis_structure' },
  front_left_inner_pillar: { price: 0, nameEn: 'front left inner pillar', nameAr: 'قايم داخلي أمامي شمال', partId: 'PT_0177', category: 'chassis_structure' },
  front_right_door_hinge: { price: 0, nameEn: 'front right door hinge', nameAr: 'مفصلة باب أمامي يمين', partId: 'PT_0178', category: 'chassis_structure' },
  front_left_door_hinge: { price: 0, nameEn: 'front left door hinge', nameAr: 'مفصلة باب أمامي شمال', partId: 'PT_0179', category: 'chassis_structure' },
  rear_right_door_hinge: { price: 0, nameEn: 'rear right door hinge', nameAr: 'مفصلة باب خلفي يمين', partId: 'PT_0180', category: 'chassis_structure' },
  rear_left_door_hinge: { price: 0, nameEn: 'rear left door hinge', nameAr: 'مفصلة باب خلفي شمال', partId: 'PT_0181', category: 'chassis_structure' },
  left_front_door_hinges: { price: 0, nameEn: 'left front door hinges', nameAr: 'مفصلات أبواب شمال', partId: 'PT_0182', category: 'chassis_structure' },
  rear_panel: { price: 0, nameEn: 'rear panel', nameAr: 'ضهر صاج خلفي', partId: 'PT_0183', category: 'chassis_structure' },
  rear_body_panel: { price: 0, nameEn: 'rear body panel', nameAr: 'ضهر صاج', partId: 'PT_0184', category: 'chassis_structure' },
  front_impact_bar: { price: 0, nameEn: 'front impact bar', nameAr: 'شاسيه اكصدام امامي', partId: 'PT_0185', category: 'chassis_structure' },
  rear_impact_bar: { price: 0, nameEn: 'rear impact bar', nameAr: 'شاسيه اكصدام خلفي', partId: 'PT_0186', category: 'chassis_structure' },
  radiator_support: { price: 0, nameEn: 'radiator support', nameAr: 'صدر فبر', partId: 'PT_0187', category: 'chassis_structure' },
  radiator_support___core_support: { price: 0, nameEn: 'Radiator Support / Core Support', nameAr: 'صدر فبر', partId: 'PT_0188', category: 'chassis_structure' },
  radiator_core_support: { price: 0, nameEn: 'radiator core support', nameAr: 'صدر فبر', partId: 'PT_0189', category: 'chassis_structure' },
  headlight_mounting_brackets: { price: 0, nameEn: 'headlight mounting brackets', nameAr: 'قواعد فوانيس امامي', partId: 'PT_0190', category: 'chassis_structure' },
  trunk_latch_and_striker: { price: 0, nameEn: 'trunk latch and striker', nameAr: 'كالون شنطه', partId: 'PT_0191', category: 'chassis_structure' },
  trunk_latch: { price: 0, nameEn: 'trunk latch', nameAr: 'كالون شنطه', partId: 'PT_0192', category: 'chassis_structure' },
  liftgate_struts: { price: 0, nameEn: 'liftgate struts', nameAr: 'مساعدين شنطه', partId: 'PT_0193', category: 'chassis_structure' },
  rear_bumper_brackets: { price: 0, nameEn: 'rear bumper brackets', nameAr: 'قواعد اكصدام خلفي', partId: 'PT_0194', category: 'chassis_structure' },
  front_right_apron: { price: 0, nameEn: 'front right apron', nameAr: 'كرتيره رفرف يمين', partId: 'PT_0195', category: 'chassis_structure' },
  front_left_apron: { price: 0, nameEn: 'front left apron', nameAr: 'كرتيره رفرف شمال', partId: 'PT_0196', category: 'chassis_structure' },
  rear_floor_pan_and_spare_tire_well: { price: 0, nameEn: 'rear floor pan and spare tire well', nameAr: 'حله استبن', partId: 'PT_0197', category: 'chassis_structure' },
  trunk_floor: { price: 0, nameEn: 'trunk Floor', nameAr: 'حله استبن', partId: 'PT_0198', category: 'chassis_structure' },
  rear_frame_rail_left: { price: 0, nameEn: 'rear frame rail left', nameAr: 'سلاح رفرف خلفي شمال', partId: 'PT_0199', category: 'chassis_structure' },
  rear_frame_rail_right: { price: 0, nameEn: 'rear frame rail right', nameAr: 'سلاح رفرف خلفي يمين', partId: 'PT_0200', category: 'chassis_structure' },
  front_left_chassis_rail: { price: 0, nameEn: 'front left chassis rail', nameAr: 'سلاح رفرف امامي شمال', partId: 'PT_0201', category: 'chassis_structure' },
  front_bulkhead: { price: 0, nameEn: 'front bulkhead', nameAr: 'صدر السيارة', partId: 'PT_0202', category: 'chassis_structure' },
};

// ============================================================================
// DAMAGE DESCRIPTIONS DATABASE - ALL DETECTABLE DAMAGES BY GEMINI
// ============================================================================
// Format: "description1 | description2 | description3" for alternatives
// Confidence levels: HIGH (>70%), MEDIUM (50-70%), LOW (<50%)
// Hidden damage indicators marked with [HIDDEN] prefix
// ============================================================================

const DAMAGE_DESCRIPTIONS = {
  // ==========================================================================
  // FRONT BUMPER DAMAGES
  // ==========================================================================
  front_bumper: {
    visible: [
      "cracked bumper cover | split plastic | broken bumper shell",
      "deep scratches on bumper surface | paint transfer marks | scuff marks",
      "dents on front bumper | impact deformation | pushed-in section",
      "missing bumper piece | torn section | detached fragment",
      "bumper misalignment | shifted position | uneven gaps",
      "paint peeling on bumper | clear coat damage | oxidation",
      "puncture hole in bumper | penetration damage | through-hole",
      "bumper sagging | loose mounting | hanging section"
    ],
    hidden: [
      "[HIDDEN] Likely bent bumper reinforcement bar behind cover - needs inspection",
      "[HIDDEN] Probable damage to crash foam absorber - check during disassembly",
      "[HIDDEN] Suspected mounting bracket damage - verify attachment points",
      "[HIDDEN] Likely bent or broken bumper support (<70% confidence)",
      "[HIDDEN] Possible damage to bumper beam - recommend removal for inspection"
    ],
    severity_descriptions: {
      minor: "light scratches | minor scuffs | small paint chips - Probably intact",
      moderate: "moderate dents | noticeable cracks | paint damage - Likely deformed due to impact, needs inspection",
      severe: "severe cracking | structural damage | major deformation - Likely bent or broken"
    }
  },

  // ==========================================================================
  // REAR BUMPER DAMAGES
  // ==========================================================================
  rear_bumper: {
    visible: [
      "cracked rear bumper | split plastic cover | broken shell",
      "scratches on rear bumper | scuff marks | paint transfer",
      "dents on rear bumper | impact marks | pushed-in area",
      "missing rear bumper section | torn piece | detached part",
      "rear bumper misalignment | shifted from impact | uneven fitment",
      "puncture in rear bumper | hole from impact | penetration",
      "rear bumper sagging | loose attachment | drooping section"
    ],
    hidden: [
      "[HIDDEN] Likely bent rear bumper reinforcement - inspect behind cover",
      "[HIDDEN] Probable trunk floor damage from rear impact - check underside",
      "[HIDDEN] Suspected rear crash foam damage - needs removal to verify",
      "[HIDDEN] Possible rear body panel deformation behind bumper (<70% confidence)",
      "[HIDDEN] Likely damaged rear mounting brackets - verify during repair"
    ],
    severity_descriptions: {
      minor: "light scratches | minor scuffs | small marks - Probably intact",
      moderate: "noticeable dents | cracks forming | paint damage - Likely deformed due to impact, needs flagging",
      severe: "major cracking | structural failure | severe deformation - Likely bent or broken"
    }
  },

  // ==========================================================================
  // UPPER BUMPER SECTION DAMAGES
  // ==========================================================================
  upper_bumper_front: {
    visible: [
      "upper bumper crack | top section damage | upper shell split",
      "scratches on upper bumper area | paint damage on top section",
      "dent on upper bumper portion | deformation near hood line",
      "upper bumper trim damage | chrome strip damage | accent piece broken"
    ],
    hidden: [
      "[HIDDEN] Possible hood latch mechanism damage - verify operation",
      "[HIDDEN] Likely front carrier damage behind upper bumper section"
    ]
  },

  // ==========================================================================
  // LOWER BUMPER SECTION DAMAGES
  // ==========================================================================
  lower_bumper_front: {
    visible: [
      "lower bumper scrape | bottom section damage | underside scratches",
      "lower air dam damage | lower grille broken | chin spoiler cracked",
      "lower bumper torn | ripped from curb contact | ground impact damage",
      "lower bumper missing pieces | detached sections | broken clips"
    ],
    hidden: [
      "[HIDDEN] Possible radiator support damage - check cooling system",
      "[HIDDEN] Likely underbody shield damage - inspect splash guards"
    ]
  },

  // ==========================================================================
  // HEADLIGHT DAMAGES (LEFT)
  // ==========================================================================
  headlight_left: {
    visible: [
      "cracked lens | internal damage | moisture inside housing",
      "broken glass | shattered lens | cracked housing",
      "cracked lens | broken pieces | missing fragments",
      "headlight housing crack | outer shell damage | bezel broken",
      "scratched headlight lens | hazed surface | oxidation",
      "headlight misaligned | shifted position | improper aim",
      "LED/DRL damage | accent light broken | running light failure",
      "projector lens damage | inner optics cracked | beam distorted",
      "headlight seal failure | condensation inside | water intrusion"
    ],
    hidden: [
      "[HIDDEN] Likely headlight bracket bent - check mounting points",
      "[HIDDEN] Possible wiring harness damage behind headlight (<70% confidence)",
      "[HIDDEN] Suspected fender inner liner damage - inspect attachment",
      "[HIDDEN] Probable headlight motor/adjuster damage - verify aim mechanism"
    ],
    severity_descriptions: {
      minor: "light scratches on lens | minor hazing | small chips - Probably intact, polish recommended",
      moderate: "visible cracks | moisture present | partial damage - Likely compromised, needs sealing or replacement",
      severe: "shattered lens | broken housing | internal damage - Replacement required"
    }
  },

  // ==========================================================================
  // HEADLIGHT DAMAGES (RIGHT)
  // ==========================================================================
  headlight_right: {
    visible: [
      "cracked lens | internal damage | moisture inside housing",
      "broken glass | shattered lens | cracked housing",
      "cracked lens | broken pieces | missing fragments",
      "headlight housing crack | outer shell damage | bezel broken",
      "scratched headlight lens | hazed surface | oxidation",
      "headlight misaligned | shifted position | improper aim",
      "LED/DRL damage | accent light broken | running light failure",
      "projector lens damage | inner optics cracked | beam distorted",
      "headlight seal failure | condensation inside | water intrusion"
    ],
    hidden: [
      "[HIDDEN] Likely headlight bracket bent - check mounting points",
      "[HIDDEN] Possible wiring harness damage behind headlight (<70% confidence)",
      "[HIDDEN] Suspected fender inner liner damage - inspect attachment",
      "[HIDDEN] Probable headlight motor/adjuster damage - verify aim mechanism"
    ],
    severity_descriptions: {
      minor: "light scratches on lens | minor hazing | small chips - Probably intact, polish recommended",
      moderate: "visible cracks | moisture present | partial damage - Likely compromised, needs sealing or replacement",
      severe: "shattered lens | broken housing | internal damage - Replacement required"
    }
  },

  // ==========================================================================
  // TAILLIGHT DAMAGES (LEFT)
  // ==========================================================================
  taillight_left: {
    visible: [
      "cracked taillight lens | broken red plastic | shattered light",
      "taillight housing damage | outer shell cracked | bezel broken",
      "missing taillight pieces | fragments gone | broken sections",
      "taillight moisture | condensation inside | seal failure",
      "taillight misaligned | shifted from impact | loose mounting",
      "LED failure | individual LEDs out | partial illumination"
    ],
    hidden: [
      "[HIDDEN] Likely rear body panel damage behind taillight",
      "[HIDDEN] Possible trunk/liftgate hinge stress - check operation",
      "[HIDDEN] Suspected wiring damage in rear harness (<70% confidence)"
    ],
    severity_descriptions: {
      minor: "light scratches | minor cracks | small chips - Probably functional",
      moderate: "visible cracks | moisture ingress | partial breaks - Needs replacement soon",
      severe: "shattered lens | broken housing | non-functional - Immediate replacement required"
    }
  },

  // ==========================================================================
  // TAILLIGHT DAMAGES (RIGHT)
  // ==========================================================================
  taillight_right: {
    visible: [
      "cracked taillight lens | broken red plastic | shattered light",
      "taillight housing damage | outer shell cracked | bezel broken",
      "missing taillight pieces | fragments gone | broken sections",
      "taillight moisture | condensation inside | seal failure",
      "taillight misaligned | shifted from impact | loose mounting",
      "LED failure | individual LEDs out | partial illumination"
    ],
    hidden: [
      "[HIDDEN] Likely rear body panel damage behind taillight",
      "[HIDDEN] Possible trunk/liftgate hinge stress - check operation",
      "[HIDDEN] Suspected wiring damage in rear harness (<70% confidence)"
    ],
    severity_descriptions: {
      minor: "light scratches | minor cracks | small chips - Probably functional",
      moderate: "visible cracks | moisture ingress | partial breaks - Needs replacement soon",
      severe: "shattered lens | broken housing | non-functional - Immediate replacement required"
    }
  },

  // ==========================================================================
  // HOOD DAMAGES
  // ==========================================================================
  hood: {
    visible: [
      "hood dent | impact deformation | pushed-in area",
      "hood crease | sharp fold line | buckled section",
      "hood scratches | paint damage | clear coat failure",
      "hood misalignment | uneven gaps | shifted position",
      "hood buckled | severe deformation | structural damage",
      "hood paint peeling | oxidation | rust forming",
      "hood hinge area damage | mounting point stress | pivot damage"
    ],
    hidden: [
      "[HIDDEN] Likely hood latch mechanism damage - verify secure closure",
      "[HIDDEN] Probable hood hinge deformation - check operation",
      "[HIDDEN] Suspected hood insulation damage underneath - inspect liner",
      "[HIDDEN] Possible front fender mounting stress - check alignment",
      "[HIDDEN] Likely inner hood reinforcement bent (<70% confidence)"
    ],
    severity_descriptions: {
      minor: "light scratches | small dents | paint chips - Probably repairable with PDR",
      moderate: "noticeable dents | creasing | paint damage - Likely needs bodywork",
      severe: "buckled hood | structural damage | major deformation - Repair via bodywork (panels are repaired, not replaced, unless chassis members are involved)"
    }
  },

  // ==========================================================================
  // FRONT FENDER DAMAGES (LEFT)
  // ==========================================================================
  front_fender_left: {
    visible: [
      "fender dent | impact mark | pushed-in section",
      "fender scratches | paint damage | scuff marks",
      "fender crease | sharp fold | buckled area",
      "fender rust | corrosion | oxidation damage",
      "fender misalignment | shifted position | uneven gaps",
      "fender wheel arch damage | flared out | bent inward",
      "fender paint peeling | clear coat failure | bubbling"
    ],
    hidden: [
      "[HIDDEN] Likely inner fender liner damage - inspect wheel well",
      "[HIDDEN] Probable fender mounting bracket stress - check bolts",
      "[HIDDEN] Suspected door hinge pillar stress (<70% confidence)",
      "[HIDDEN] Possible inner fender apron damage - needs inspection",
      "[HIDDEN] Likely bent inner structure behind fender - verify alignment"
    ],
    severity_descriptions: {
      minor: "light scratches | small dents - Probably PDR repairable",
      moderate: "noticeable dents | creasing | misalignment - Likely needs bodywork",
      severe: "severe deformation | buckled | structural damage - Repair via bodywork (fender panel is repaired, not replaced, unless chassis rail is involved)"
    }
  },

  // ==========================================================================
  // FRONT FENDER DAMAGES (RIGHT)
  // ==========================================================================
  front_fender_right: {
    visible: [
      "fender dent | impact mark | pushed-in section",
      "fender scratches | paint damage | scuff marks",
      "fender crease | sharp fold | buckled area",
      "fender rust | corrosion | oxidation damage",
      "fender misalignment | shifted position | uneven gaps",
      "fender wheel arch damage | flared out | bent inward",
      "fender paint peeling | clear coat failure | bubbling"
    ],
    hidden: [
      "[HIDDEN] Likely inner fender liner damage - inspect wheel well",
      "[HIDDEN] Probable fender mounting bracket stress - check bolts",
      "[HIDDEN] Suspected door hinge pillar stress (<70% confidence)",
      "[HIDDEN] Possible inner fender apron damage - needs inspection",
      "[HIDDEN] Likely bent inner structure behind fender - verify alignment"
    ],
    severity_descriptions: {
      minor: "light scratches | small dents - Probably PDR repairable",
      moderate: "noticeable dents | creasing | misalignment - Likely needs bodywork",
      severe: "severe deformation | buckled | structural damage - Repair via bodywork (fender panel is repaired, not replaced, unless chassis rail is involved)"
    }
  },

  // ==========================================================================
  // FRONT DOOR DAMAGES (LEFT)
  // ==========================================================================
  front_door_left: {
    visible: [
      "door dent | impact damage | pushed-in panel",
      "door scratches | paint damage | key marks",
      "door crease | sharp fold line | buckled section",
      "door handle damage | broken handle | loose mechanism",
      "door molding damage | trim broken | side strip torn",
      "door misalignment | sagging | won't close properly",
      "door edge damage | ding marks | parking damage",
      "door glass damage | window cracked | shattered"
    ],
    hidden: [
      "[HIDDEN] Likely door intrusion beam damage - safety concern",
      "[HIDDEN] Probable door hinge stress - check operation",
      "[HIDDEN] Suspected inner door panel damage (<70% confidence)",
      "[HIDDEN] Possible window regulator damage - verify operation",
      "[HIDDEN] Likely door latch mechanism affected - test closure",
      "[HIDDEN] Probable door wiring harness stress - check electronics"
    ],
    severity_descriptions: {
      minor: "light scratches | small dents | edge dings - Probably repairable",
      moderate: "noticeable dents | creasing | handle issues - Likely needs panel work",
      severe: "major deformation | buckled | won't close - Repair via bodywork (door panel is repaired, not replaced, unless chassis/pillar is involved)"
    }
  },

  // ==========================================================================
  // FRONT DOOR DAMAGES (RIGHT)
  // ==========================================================================
  front_door_right: {
    visible: [
      "door dent | impact damage | pushed-in panel",
      "door scratches | paint damage | key marks",
      "door crease | sharp fold line | buckled section",
      "door handle damage | broken handle | loose mechanism",
      "door molding damage | trim broken | side strip torn",
      "door misalignment | sagging | won't close properly",
      "door edge damage | ding marks | parking damage",
      "door glass damage | window cracked | shattered"
    ],
    hidden: [
      "[HIDDEN] Likely door intrusion beam damage - safety concern",
      "[HIDDEN] Probable door hinge stress - check operation",
      "[HIDDEN] Suspected inner door panel damage (<70% confidence)",
      "[HIDDEN] Possible window regulator damage - verify operation",
      "[HIDDEN] Likely door latch mechanism affected - test closure",
      "[HIDDEN] Probable door wiring harness stress - check electronics"
    ],
    severity_descriptions: {
      minor: "light scratches | small dents | edge dings - Probably repairable",
      moderate: "noticeable dents | creasing | handle issues - Likely needs panel work",
      severe: "major deformation | buckled | won't close - Repair via bodywork (door panel is repaired, not replaced, unless chassis/pillar is involved)"
    }
  },

  // ==========================================================================
  // REAR DOOR DAMAGES (LEFT)
  // ==========================================================================
  rear_door_left: {
    visible: [
      "rear door dent | impact mark | pushed-in area",
      "rear door scratches | paint damage | scuff marks",
      "rear door crease | buckled section | fold line",
      "rear door handle damage | broken | non-functional",
      "rear door trim damage | molding broken | strip torn",
      "rear door misalignment | sagging | closure issues"
    ],
    hidden: [
      "[HIDDEN] Likely rear door beam damage - verify structural integrity",
      "[HIDDEN] Probable B-pillar stress from impact (<70% confidence)",
      "[HIDDEN] Suspected child lock mechanism damage - test operation"
    ],
    severity_descriptions: {
      minor: "light scratches | small dents - Probably repairable",
      moderate: "noticeable dents | trim damage - Likely needs bodywork",
      severe: "major deformation | buckled | closure failure - Repair via bodywork (rear door panel is repaired, not replaced, unless chassis/pillar is involved)"
    }
  },

  // ==========================================================================
  // REAR DOOR DAMAGES (RIGHT)
  // ==========================================================================
  rear_door_right: {
    visible: [
      "rear door dent | impact mark | pushed-in area",
      "rear door scratches | paint damage | scuff marks",
      "rear door crease | buckled section | fold line",
      "rear door handle damage | broken | non-functional",
      "rear door trim damage | molding broken | strip torn",
      "rear door misalignment | sagging | closure issues"
    ],
    hidden: [
      "[HIDDEN] Likely rear door beam damage - verify structural integrity",
      "[HIDDEN] Probable B-pillar stress from impact (<70% confidence)",
      "[HIDDEN] Suspected child lock mechanism damage - test operation"
    ],
    severity_descriptions: {
      minor: "light scratches | small dents - Probably repairable",
      moderate: "noticeable dents | trim damage - Likely needs bodywork",
      severe: "major deformation | buckled | closure failure - Repair via bodywork (rear door panel is repaired, not replaced, unless chassis/pillar is involved)"
    }
  },

  // ==========================================================================
  // WINDSHIELD DAMAGES
  // ==========================================================================
  windshield: {
    visible: [
      "windshield crack | single line crack | spreading crack",
      "windshield chip | stone chip | impact point",
      "windshield shattered | spider web crack | multiple fractures",
      "windshield delamination | layer separation | clouding",
      "windshield scratch | wiper damage | surface marks",
      "windshield seal damage | rubber deterioration | leak potential"
    ],
    hidden: [
      "[HIDDEN] Possible A-pillar damage from windshield frame stress",
      "[HIDDEN] Likely cowl panel damage - inspect under windshield base",
      "[HIDDEN] Suspected ADAS camera calibration needed if equipped"
    ],
    severity_descriptions: {
      minor: "small chip | minor scratch - Probably repairable with resin fill",
      moderate: "spreading crack | multiple chips - Likely needs replacement soon",
      severe: "shattered | structural crack | vision obstruction - Immediate replacement required"
    }
  },

  // ==========================================================================
  // REAR WINDSHIELD DAMAGES
  // ==========================================================================
  rear_windshield: {
    visible: [
      "rear glass crack | fracture line | stress crack",
      "rear glass shattered | broken completely | fragments missing",
      "rear glass defroster damage | grid lines broken | heating failure",
      "rear glass seal failure | rubber deterioration | water leak"
    ],
    hidden: [
      "[HIDDEN] Possible C-pillar stress from glass frame (<70% confidence)",
      "[HIDDEN] Likely trunk/hatch seal damage - check for water intrusion"
    ]
  },

  // ==========================================================================
  // GRILLE DAMAGES
  // ==========================================================================
  grille: {
    visible: [
      "grille broken | slats cracked | pieces missing",
      "grille scratches | paint damage | chrome peeling",
      "grille misaligned | shifted position | uneven gaps",
      "grille emblem damage | logo broken | badge missing",
      "grille mesh torn | honeycomb damage | insert broken"
    ],
    hidden: [
      "[HIDDEN] Likely radiator damage behind grille - check for leaks",
      "[HIDDEN] Possible condenser damage - inspect AC system",
      "[HIDDEN] Suspected hood latch interference (<70% confidence)"
    ],
    severity_descriptions: {
      minor: "light scratches | minor cracks - Probably cosmetic only",
      moderate: "broken sections | misalignment - Likely needs replacement",
      severe: "major damage | multiple breaks - Replacement required"
    }
  },

  // ==========================================================================
  // SIDE MIRROR DAMAGES (LEFT)
  // ==========================================================================
  side_mirror_left: {
    visible: [
      "mirror glass cracked | shattered mirror | broken reflective surface",
      "mirror housing broken | cover cracked | shell damaged",
      "mirror folded in | impact position | stuck folded",
      "mirror loose | wobbling | unstable mount",
      "mirror turn signal damage | indicator broken | LED failure",
      "mirror cap scratched | paint damage | cover scraped"
    ],
    hidden: [
      "[HIDDEN] Likely mirror motor damage - verify electric adjustment",
      "[HIDDEN] Possible door panel stress at mirror mount (<70% confidence)",
      "[HIDDEN] Suspected wiring damage in mirror assembly"
    ],
    severity_descriptions: {
      minor: "scratched cap | minor glass damage - Probably repairable",
      moderate: "cracked housing | motor issues - Likely needs parts replacement",
      severe: "shattered | complete failure - Full mirror replacement required"
    }
  },

  // ==========================================================================
  // SIDE MIRROR DAMAGES (RIGHT)
  // ==========================================================================
  side_mirror_right: {
    visible: [
      "mirror glass cracked | shattered mirror | broken reflective surface",
      "mirror housing broken | cover cracked | shell damaged",
      "mirror folded in | impact position | stuck folded",
      "mirror loose | wobbling | unstable mount",
      "mirror turn signal damage | indicator broken | LED failure",
      "mirror cap scratched | paint damage | cover scraped"
    ],
    hidden: [
      "[HIDDEN] Likely mirror motor damage - verify electric adjustment",
      "[HIDDEN] Possible door panel stress at mirror mount (<70% confidence)",
      "[HIDDEN] Suspected wiring damage in mirror assembly"
    ],
    severity_descriptions: {
      minor: "scratched cap | minor glass damage - Probably repairable",
      moderate: "cracked housing | motor issues - Likely needs parts replacement",
      severe: "shattered | complete failure - Full mirror replacement required"
    }
  },

  // ==========================================================================
  // TRUNK/BOOT DAMAGES
  // ==========================================================================
  trunk: {
    visible: [
      "trunk dent | impact damage | pushed-in panel",
      "trunk crease | fold line | buckled metal",
      "trunk scratches | paint damage | key marks",
      "trunk misalignment | won't close | latch issues",
      "trunk rust | corrosion | oxidation spots",
      "trunk spoiler damage | wing broken | lip cracked"
    ],
    hidden: [
      "[HIDDEN] Likely trunk floor damage - inspect spare tire well",
      "[HIDDEN] Probable trunk hinge stress - check spring operation",
      "[HIDDEN] Suspected rear body panel damage behind trunk (<70% confidence)",
      "[HIDDEN] Possible trunk latch mechanism damage - verify secure closure"
    ],
    severity_descriptions: {
      minor: "light scratches | small dents - Probably PDR repairable",
      moderate: "noticeable dents | alignment issues - Likely needs bodywork",
      severe: "major deformation | buckled | won't close - Repair via bodywork (trunk panel is repaired, not replaced, unless chassis is involved)"
    }
  },

  // ==========================================================================
  // ROOF DAMAGES
  // ==========================================================================
  roof: {
    visible: [
      "roof dent | hail damage | impact marks",
      "roof scratches | paint damage | surface marks",
      "roof rust | corrosion | oxidation",
      "roof rail damage | rack mounting issues | trim broken",
      "sunroof damage | glass cracked | seal failure",
      "roof liner sagging | headliner detaching | interior visible"
    ],
    hidden: [
      "[HIDDEN] Likely roof reinforcement stress - check structural integrity",
      "[HIDDEN] Possible pillar joint stress from roof impact (<70% confidence)",
      "[HIDDEN] Suspected roof drain blockage - check for water intrusion"
    ],
    severity_descriptions: {
      minor: "light scratches | small dents - Probably cosmetic repair",
      moderate: "multiple dents | paint damage - Likely needs professional PDR",
      severe: "major deformation | structural concern - Professional assessment required"
    }
  },

  // ==========================================================================
  // QUARTER PANEL DAMAGES (LEFT)
  // ==========================================================================
  quarter_panel_left: {
    visible: [
      "quarter panel dent | impact damage | pushed-in area",
      "quarter panel scratches | paint damage | scuff marks",
      "quarter panel crease | buckled section | fold line",
      "quarter panel rust | corrosion | wheel well rust",
      "quarter panel misalignment | body line disruption | uneven gaps"
    ],
    hidden: [
      "[HIDDEN] Likely inner quarter panel damage - welded section affected",
      "[HIDDEN] Probable wheel house liner damage - inspect inner fender",
      "[HIDDEN] Suspected rear suspension mounting stress (<70% confidence)",
      "[HIDDEN] Possible fuel filler neck damage if near impact - verify sealing"
    ],
    severity_descriptions: {
      minor: "light scratches | small dents - Probably repairable",
      moderate: "noticeable dents | paint damage - Likely needs body filler work",
      severe: "major deformation | buckled | structural damage - Repair via bodywork (quarter panel is repaired, not replaced, unless chassis is involved)"
    }
  },

  // ==========================================================================
  // QUARTER PANEL DAMAGES (RIGHT)
  // ==========================================================================
  quarter_panel_right: {
    visible: [
      "quarter panel dent | impact damage | pushed-in area",
      "quarter panel scratches | paint damage | scuff marks",
      "quarter panel crease | buckled section | fold line",
      "quarter panel rust | corrosion | wheel well rust",
      "quarter panel misalignment | body line disruption | uneven gaps"
    ],
    hidden: [
      "[HIDDEN] Likely inner quarter panel damage - welded section affected",
      "[HIDDEN] Probable wheel house liner damage - inspect inner fender",
      "[HIDDEN] Suspected rear suspension mounting stress (<70% confidence)",
      "[HIDDEN] Possible exhaust system interference if near impact - check routing"
    ],
    severity_descriptions: {
      minor: "light scratches | small dents - Probably repairable",
      moderate: "noticeable dents | paint damage - Likely needs body filler work",
      severe: "major deformation | buckled | structural damage - Repair via bodywork (quarter panel is repaired, not replaced, unless chassis is involved)"
    }
  },

  // ==========================================================================
  // FOG LIGHT DAMAGES (FRONT LEFT)
  // ==========================================================================
  fog_light_left: {
    visible: [
      "fog light cracked | lens broken | housing damage",
      "fog light missing | completely gone | torn out",
      "fog light scratched | hazed lens | oxidation",
      "fog light misaligned | aim incorrect | loose mount"
    ],
    hidden: [
      "[HIDDEN] Possible wiring damage behind fog light assembly",
      "[HIDDEN] Likely bumper inner support damage near fog light mount"
    ],
    severity_descriptions: {
      minor: "scratched lens | minor hazing - Probably functional",
      moderate: "cracked lens | moisture inside - Needs replacement",
      severe: "broken | missing | non-functional - Replacement required"
    }
  },

  // ==========================================================================
  // FOG LIGHT DAMAGES (FRONT RIGHT)
  // ==========================================================================
  fog_light_right: {
    visible: [
      "fog light cracked | lens broken | housing damage",
      "fog light missing | completely gone | torn out",
      "fog light scratched | hazed lens | oxidation",
      "fog light misaligned | aim incorrect | loose mount"
    ],
    hidden: [
      "[HIDDEN] Possible wiring damage behind fog light assembly",
      "[HIDDEN] Likely bumper inner support damage near fog light mount"
    ],
    severity_descriptions: {
      minor: "scratched lens | minor hazing - Probably functional",
      moderate: "cracked lens | moisture inside - Needs replacement",
      severe: "broken | missing | non-functional - Replacement required"
    }
  },

  // ==========================================================================
  // FOG LIGHT TRIM DAMAGES
  // ==========================================================================
  fog_trim_left: {
    visible: [
      "scratches on the left fog trim | scuff marks | paint transfer",
      "left fog trim cracked | broken bezel | damaged surround",
      "left fog trim missing | torn off | detached",
      "left fog trim discolored | faded | sun damage"
    ],
    severity_descriptions: {
      minor: "light scratches | minor scuffs - Probably cosmetic only",
      moderate: "visible cracks | partial damage - Replacement recommended",
      severe: "broken | missing - Replacement required"
    }
  },

  fog_trim_right: {
    visible: [
      "scratches on the right fog trim | scuff marks | paint transfer",
      "right fog trim cracked | broken bezel | damaged surround",
      "right fog trim missing | torn off | detached",
      "right fog trim discolored | faded | sun damage"
    ],
    severity_descriptions: {
      minor: "light scratches | minor scuffs - Probably cosmetic only",
      moderate: "visible cracks | partial damage - Replacement recommended",
      severe: "broken | missing - Replacement required"
    }
  },

  // ==========================================================================
  // ROCKER PANEL / SIDE SKIRT DAMAGES
  // ==========================================================================
  rocker_panel_left: {
    visible: [
      "rocker panel dent | side skirt damage | lower body damage",
      "rocker panel scratches | curb rash | parking damage",
      "rocker panel rust | corrosion | structural decay",
      "rocker panel cracked | plastic broken | trim damaged"
    ],
    hidden: [
      "[HIDDEN] Likely inner rocker structure damage - check for rust perforation",
      "[HIDDEN] Possible floor pan edge damage (<70% confidence)",
      "[HIDDEN] Suspected pinch weld damage - verify jack point integrity"
    ]
  },

  rocker_panel_right: {
    visible: [
      "rocker panel dent | side skirt damage | lower body damage",
      "rocker panel scratches | curb rash | parking damage",
      "rocker panel rust | corrosion | structural decay",
      "rocker panel cracked | plastic broken | trim damaged"
    ],
    hidden: [
      "[HIDDEN] Likely inner rocker structure damage - check for rust perforation",
      "[HIDDEN] Possible floor pan edge damage (<70% confidence)",
      "[HIDDEN] Suspected pinch weld damage - verify jack point integrity"
    ]
  },

  // ==========================================================================
  // WHEEL DAMAGES
  // ==========================================================================
  wheel_front_left: {
    visible: [
      "wheel curb rash | rim scratches | edge damage",
      "wheel bent | impact damage | out of round",
      "wheel cracked | structural damage | fracture line",
      "wheel corrosion | oxidation | pitting",
      "wheel cover damage | hubcap broken | center cap missing"
    ],
    hidden: [
      "[HIDDEN] Likely tire damage from wheel impact - inspect sidewall",
      "[HIDDEN] Possible suspension component stress (<70% confidence)",
      "[HIDDEN] Suspected wheel bearing stress - check for noise"
    ]
  },

  wheel_front_right: {
    visible: [
      "wheel curb rash | rim scratches | edge damage",
      "wheel bent | impact damage | out of round",
      "wheel cracked | structural damage | fracture line",
      "wheel corrosion | oxidation | pitting",
      "wheel cover damage | hubcap broken | center cap missing"
    ],
    hidden: [
      "[HIDDEN] Likely tire damage from wheel impact - inspect sidewall",
      "[HIDDEN] Possible suspension component stress (<70% confidence)",
      "[HIDDEN] Suspected wheel bearing stress - check for noise"
    ]
  },

  wheel_rear_left: {
    visible: [
      "wheel curb rash | rim scratches | edge damage",
      "wheel bent | impact damage | out of round",
      "wheel cracked | structural damage | fracture line",
      "wheel corrosion | oxidation | pitting"
    ],
    hidden: [
      "[HIDDEN] Likely tire damage from wheel impact - inspect sidewall",
      "[HIDDEN] Possible rear suspension stress - check alignment"
    ]
  },

  wheel_rear_right: {
    visible: [
      "wheel curb rash | rim scratches | edge damage",
      "wheel bent | impact damage | out of round",
      "wheel cracked | structural damage | fracture line",
      "wheel corrosion | oxidation | pitting"
    ],
    hidden: [
      "[HIDDEN] Likely tire damage from wheel impact - inspect sidewall",
      "[HIDDEN] Possible rear suspension stress - check alignment"
    ]
  },

  // ==========================================================================
  // TIRE DAMAGES
  // ==========================================================================
  tire_front_left: {
    visible: [
      "tire sidewall damage | bulge | bubble forming",
      "tire puncture | nail | screw embedded",
      "tire tread wear | uneven wear | bald spots",
      "tire cut | slash | gash in rubber",
      "tire cracking | dry rot | age deterioration"
    ],
    hidden: [
      "[HIDDEN] Possible internal tire structure damage - needs dismount inspection",
      "[HIDDEN] Likely alignment issue causing wear pattern"
    ]
  },

  tire_front_right: {
    visible: [
      "tire sidewall damage | bulge | bubble forming",
      "tire puncture | nail | screw embedded",
      "tire tread wear | uneven wear | bald spots",
      "tire cut | slash | gash in rubber",
      "tire cracking | dry rot | age deterioration"
    ],
    hidden: [
      "[HIDDEN] Possible internal tire structure damage - needs dismount inspection",
      "[HIDDEN] Likely alignment issue causing wear pattern"
    ]
  },

  tire_rear_left: {
    visible: [
      "tire sidewall damage | bulge | bubble forming",
      "tire puncture | nail | screw embedded",
      "tire tread wear | uneven wear | bald spots",
      "tire cut | slash | gash in rubber"
    ]
  },

  tire_rear_right: {
    visible: [
      "tire sidewall damage | bulge | bubble forming",
      "tire puncture | nail | screw embedded",
      "tire tread wear | uneven wear | bald spots",
      "tire cut | slash | gash in rubber"
    ]
  },

  // ==========================================================================
  // B-PILLAR DAMAGES
  // ==========================================================================
  b_pillar_left: {
    visible: [
      "B-pillar dent | impact damage | deformation",
      "B-pillar trim damage | cover broken | plastic cracked",
      "B-pillar paint damage | scratches | chips"
    ],
    hidden: [
      "[HIDDEN] CRITICAL: Likely structural B-pillar damage - safety inspection required",
      "[HIDDEN] Possible seatbelt anchor point stress - verify mounting",
      "[HIDDEN] Suspected door striker misalignment - check closure (<70% confidence)"
    ]
  },

  b_pillar_right: {
    visible: [
      "B-pillar dent | impact damage | deformation",
      "B-pillar trim damage | cover broken | plastic cracked",
      "B-pillar paint damage | scratches | chips"
    ],
    hidden: [
      "[HIDDEN] CRITICAL: Likely structural B-pillar damage - safety inspection required",
      "[HIDDEN] Possible seatbelt anchor point stress - verify mounting",
      "[HIDDEN] Suspected door striker misalignment - check closure (<70% confidence)"
    ]
  },

  // ==========================================================================
  // A-PILLAR DAMAGES
  // ==========================================================================
  a_pillar_left: {
    visible: [
      "A-pillar dent | impact damage | deformation",
      "A-pillar trim damage | cover broken | plastic cracked"
    ],
    hidden: [
      "[HIDDEN] CRITICAL: Structural A-pillar damage suspected - professional inspection required",
      "[HIDDEN] Likely windshield seal compromise - check for leaks",
      "[HIDDEN] Possible airbag deployment path obstruction (<70% confidence)"
    ]
  },

  a_pillar_right: {
    visible: [
      "A-pillar dent | impact damage | deformation",
      "A-pillar trim damage | cover broken | plastic cracked"
    ],
    hidden: [
      "[HIDDEN] CRITICAL: Structural A-pillar damage suspected - professional inspection required",
      "[HIDDEN] Likely windshield seal compromise - check for leaks",
      "[HIDDEN] Possible airbag deployment path obstruction (<70% confidence)"
    ]
  },

  // ==========================================================================
  // C-PILLAR DAMAGES
  // ==========================================================================
  c_pillar_left: {
    visible: [
      "C-pillar dent | rear pillar damage | deformation",
      "C-pillar trim damage | cover broken | plastic cracked"
    ],
    hidden: [
      "[HIDDEN] Likely rear quarter panel inner damage - needs inspection",
      "[HIDDEN] Possible rear seatbelt anchor stress (<70% confidence)"
    ]
  },

  c_pillar_right: {
    visible: [
      "C-pillar dent | rear pillar damage | deformation",
      "C-pillar trim damage | cover broken | plastic cracked"
    ],
    hidden: [
      "[HIDDEN] Likely rear quarter panel inner damage - needs inspection",
      "[HIDDEN] Possible rear seatbelt anchor stress (<70% confidence)"
    ]
  },

  // ==========================================================================
  // INNER PANEL DAMAGES (CHASSIS/STRUCTURAL)
  // ==========================================================================
  inner_fender_left: {
    visible: [
      "inner fender dent | apron damage | deformation",
      "inner fender rust | corrosion | perforation",
      "inner fender cracked | torn | bent"
    ],
    hidden: [
      "[HIDDEN] Likely strut tower stress - check suspension mounting",
      "[HIDDEN] Possible frame rail connection damage (<70% confidence)"
    ]
  },

  inner_fender_right: {
    visible: [
      "inner fender dent | apron damage | deformation",
      "inner fender rust | corrosion | perforation",
      "inner fender cracked | torn | bent"
    ],
    hidden: [
      "[HIDDEN] Likely strut tower stress - check suspension mounting",
      "[HIDDEN] Possible frame rail connection damage (<70% confidence)"
    ]
  },

  inner_quarter_panel_left: {
    visible: [
      "inner quarter panel dent | inner body damage | deformation",
      "inner quarter panel rust | corrosion | holes"
    ],
    hidden: [
      "[HIDDEN] Likely rear suspension mounting stress - check alignment",
      "[HIDDEN] Possible trunk floor damage (<70% confidence)"
    ]
  },

  inner_quarter_panel_right: {
    visible: [
      "inner quarter panel dent | inner body damage | deformation",
      "inner quarter panel rust | corrosion | holes"
    ],
    hidden: [
      "[HIDDEN] Likely rear suspension mounting stress - check alignment",
      "[HIDDEN] Possible trunk floor damage (<70% confidence)"
    ]
  },

  // ==========================================================================
  // FRAME/RAIL DAMAGES
  // ==========================================================================
  front_rail_left: {
    visible: [
      "front rail bent | frame damage | structural deformation",
      "front rail kinked | buckled | compressed",
      "front rail rust | corrosion | structural decay"
    ],
    hidden: [
      "[HIDDEN] CRITICAL: Frame damage affects vehicle safety - professional assessment required",
      "[HIDDEN] Likely suspension geometry affected - full alignment check needed",
      "[HIDDEN] Possible engine/transmission mount stress (<70% confidence)"
    ]
  },

  front_rail_right: {
    visible: [
      "front rail bent | frame damage | structural deformation",
      "front rail kinked | buckled | compressed",
      "front rail rust | corrosion | structural decay"
    ],
    hidden: [
      "[HIDDEN] CRITICAL: Frame damage affects vehicle safety - professional assessment required",
      "[HIDDEN] Likely suspension geometry affected - full alignment check needed",
      "[HIDDEN] Possible engine/transmission mount stress (<70% confidence)"
    ]
  },

  rear_rail_left: {
    visible: [
      "rear rail bent | rear frame damage | deformation",
      "rear rail kinked | buckled section | compressed"
    ],
    hidden: [
      "[HIDDEN] CRITICAL: Rear frame damage - structural integrity compromised",
      "[HIDDEN] Likely rear suspension alignment affected"
    ]
  },

  rear_rail_right: {
    visible: [
      "rear rail bent | rear frame damage | deformation",
      "rear rail kinked | buckled section | compressed"
    ],
    hidden: [
      "[HIDDEN] CRITICAL: Rear frame damage - structural integrity compromised",
      "[HIDDEN] Likely rear suspension alignment affected"
    ]
  },

  // ==========================================================================
  // RADIATOR SUPPORT / FRONT CARRIER DAMAGES
  // ==========================================================================
  radiator_support: {
    visible: [
      "radiator support bent | core support damage | deformed",
      "radiator support cracked | broken mounts | torn",
      "radiator support misaligned | shifted | pushed back"
    ],
    hidden: [
      "[HIDDEN] Likely radiator damage - check for coolant leaks",
      "[HIDDEN] Probable AC condenser damage - verify refrigerant charge",
      "[HIDDEN] Possible hood latch misalignment (<70% confidence)"
    ]
  },

  // ==========================================================================
  // SUSPENSION DAMAGES
  // ==========================================================================
  suspension_front_left: {
    visible: [
      "strut damage | shock absorber leak | spring broken",
      "control arm bent | bushing damage | ball joint wear",
      "steering knuckle damage | hub assembly damage"
    ],
    hidden: [
      "[HIDDEN] Likely alignment out of specification - needs 4-wheel alignment",
      "[HIDDEN] Possible CV axle damage (<70% confidence)",
      "[HIDDEN] Suspected bearing damage - check for play/noise"
    ]
  },

  suspension_front_right: {
    visible: [
      "strut damage | shock absorber leak | spring broken",
      "control arm bent | bushing damage | ball joint wear",
      "steering knuckle damage | hub assembly damage"
    ],
    hidden: [
      "[HIDDEN] Likely alignment out of specification - needs 4-wheel alignment",
      "[HIDDEN] Possible CV axle damage (<70% confidence)",
      "[HIDDEN] Suspected bearing damage - check for play/noise"
    ]
  },

  suspension_rear_left: {
    visible: [
      "rear shock damage | absorber leak | spring broken",
      "rear control arm bent | trailing arm damage | bushing worn"
    ],
    hidden: [
      "[HIDDEN] Likely rear alignment affected - check toe/camber",
      "[HIDDEN] Possible rear subframe stress (<70% confidence)"
    ]
  },

  suspension_rear_right: {
    visible: [
      "rear shock damage | absorber leak | spring broken",
      "rear control arm bent | trailing arm damage | bushing worn"
    ],
    hidden: [
      "[HIDDEN] Likely rear alignment affected - check toe/camber",
      "[HIDDEN] Possible rear subframe stress (<70% confidence)"
    ]
  },

  // ==========================================================================
  // ENGINE BAY DAMAGES
  // ==========================================================================
  engine: {
    visible: [
      "engine oil leak | pan damage | gasket failure",
      "engine mount broken | displaced | torn",
      "engine cover damaged | plastic broken | missing",
      "engine belt damage | serpentine worn | tensioner failed",
      "engine coolant leak | hose damage | reservoir cracked"
    ],
    hidden: [
      "[HIDDEN] Possible internal engine damage from impact - needs diagnostic",
      "[HIDDEN] Likely sensor damage - check for fault codes",
      "[HIDDEN] Suspected timing component stress (<70% confidence)"
    ]
  },

  radiator: {
    visible: [
      "radiator leak | coolant spray | fins damaged",
      "radiator cracked | tank broken | core punctured",
      "radiator bent | shifted position | misaligned"
    ],
    hidden: [
      "[HIDDEN] Likely cooling system pressure loss - check all hoses",
      "[HIDDEN] Possible water pump stress (<70% confidence)"
    ]
  },

  condenser: {
    visible: [
      "AC condenser damaged | fins bent | leak detected",
      "condenser punctured | debris damage | road impact"
    ],
    hidden: [
      "[HIDDEN] Likely refrigerant loss - AC system evacuation needed",
      "[HIDDEN] Possible compressor damage from low charge"
    ]
  },

  // ==========================================================================
  // ELECTRICAL/SENSOR DAMAGES
  // ==========================================================================
  parking_sensor_front: {
    visible: [
      "front parking sensor damaged | pushed in | cracked",
      "front parking sensor missing | torn out | hole visible"
    ],
    hidden: [
      "[HIDDEN] Likely wiring damage behind sensor - check harness"
    ]
  },

  parking_sensor_rear: {
    visible: [
      "rear parking sensor damaged | pushed in | cracked",
      "rear parking sensor missing | torn out | hole visible"
    ],
    hidden: [
      "[HIDDEN] Likely wiring damage behind sensor - check harness"
    ]
  },

  front_camera: {
    visible: [
      "front camera damaged | lens cracked | housing broken",
      "front camera misaligned | aim incorrect | blocked"
    ],
    hidden: [
      "[HIDDEN] ADAS calibration required after repair/replacement"
    ]
  },

  rear_camera: {
    visible: [
      "rear camera damaged | lens cracked | housing broken",
      "rear camera misaligned | blurry image | water intrusion"
    ],
    hidden: [
      "[HIDDEN] Camera calibration may be required"
    ]
  },

  // ==========================================================================
  // EXHAUST SYSTEM DAMAGES
  // ==========================================================================
  exhaust_system: {
    visible: [
      "exhaust pipe dented | crushed | restricted",
      "exhaust hanger broken | pipe sagging | loose mount",
      "muffler damage | dented | hole | rust through",
      "catalytic converter damage | heat shield loose | rattling"
    ],
    hidden: [
      "[HIDDEN] Possible exhaust leak - check for fumes",
      "[HIDDEN] Likely O2 sensor damage if cat impacted (<70% confidence)"
    ]
  },

  // ==========================================================================
  // FUEL SYSTEM DAMAGES
  // ==========================================================================
  fuel_tank: {
    visible: [
      "fuel tank dent | impact damage | deformation",
      "fuel tank leak | smell of fuel | wet spot"
    ],
    hidden: [
      "[HIDDEN] CRITICAL: Fuel system inspection required - safety hazard",
      "[HIDDEN] Likely fuel line stress - check connections"
    ]
  },

  // ==========================================================================
  // DOOR HANDLE DAMAGES
  // ==========================================================================
  door_handle_front_left: {
    visible: [
      "door handle scratched | paint damage | chips",
      "door handle broken | cracked | mechanism failed",
      "door handle loose | wobbly | not returning"
    ]
  },

  door_handle_front_right: {
    visible: [
      "door handle scratched | paint damage | chips",
      "door handle broken | cracked | mechanism failed",
      "door handle loose | wobbly | not returning"
    ]
  },

  door_handle_rear_left: {
    visible: [
      "door handle scratched | paint damage | chips",
      "door handle broken | cracked | mechanism failed"
    ]
  },

  door_handle_rear_right: {
    visible: [
      "door handle scratched | paint damage | chips",
      "door handle broken | cracked | mechanism failed"
    ]
  },

  // ==========================================================================
  // DOOR TRIM / MOLDING DAMAGES
  // ==========================================================================
  door_trim_front_left: {
    visible: [
      "door trim scratched | molding damaged | strip torn",
      "door trim missing | fallen off | clips broken",
      "door trim faded | discolored | sun damaged"
    ]
  },

  door_trim_front_right: {
    visible: [
      "door trim scratched | molding damaged | strip torn",
      "door trim missing | fallen off | clips broken",
      "door trim faded | discolored | sun damaged"
    ]
  },

  // ==========================================================================
  // WINDOW DAMAGES
  // ==========================================================================
  window_front_left: {
    visible: [
      "window cracked | glass broken | shattered",
      "window scratched | deep marks | visibility affected",
      "window won't operate | stuck | motor failure"
    ],
    hidden: [
      "[HIDDEN] Likely window regulator damage - check mechanism"
    ]
  },

  window_front_right: {
    visible: [
      "window cracked | glass broken | shattered",
      "window scratched | deep marks | visibility affected",
      "window won't operate | stuck | motor failure"
    ],
    hidden: [
      "[HIDDEN] Likely window regulator damage - check mechanism"
    ]
  },

  window_rear_left: {
    visible: [
      "window cracked | glass broken | shattered",
      "window scratched | visibility affected"
    ]
  },

  window_rear_right: {
    visible: [
      "window cracked | glass broken | shattered",
      "window scratched | visibility affected"
    ]
  },

  // ==========================================================================
  // CAR EMBLEMS/BADGES
  // ==========================================================================
  front_emblem: {
    visible: [
      "front emblem scratched | badge damaged | logo cracked",
      "front emblem missing | torn off | broken clips",
      "front emblem faded | discolored | chrome peeling"
    ]
  },

  rear_emblem: {
    visible: [
      "rear emblem scratched | badge damaged | logo cracked",
      "rear emblem missing | torn off | broken clips",
      "rear emblem faded | discolored | chrome peeling"
    ]
  },

  // ==========================================================================
  // NICKEL/CHROME TRIM DAMAGES
  // ==========================================================================
  grille_nickel_trim: {
    visible: [
      "grille chrome trim scratched | nickel peeling | oxidation",
      "grille trim dented | bent | misaligned",
      "grille trim missing section | broken piece | detached"
    ]
  },

  rear_nickel_trim_left: {
    visible: [
      "rear left chrome trim scratched | nickel peeling | oxidation",
      "rear trim dented | bent | damaged"
    ]
  },

  rear_nickel_trim_right: {
    visible: [
      "rear right chrome trim scratched | nickel peeling | oxidation",
      "rear trim dented | bent | damaged"
    ]
  },

  // ==========================================================================
  // UNDERCARRIAGE DAMAGES
  // ==========================================================================
  underbody_shield: {
    visible: [
      "underbody shield damaged | splash guard torn | hanging",
      "underbody shield missing | ripped off | broken clips",
      "underbody shield scraped | ground contact damage"
    ],
    hidden: [
      "[HIDDEN] Possible underbody damage - needs lift inspection",
      "[HIDDEN] Likely oil pan exposure risk without shield"
    ]
  },

  // ==========================================================================
  // AIRBAG / SAFETY SYSTEM
  // ==========================================================================
  airbag_deployed: {
    visible: [
      "airbag deployed | inflated | triggered",
      "airbag cover broken | deployment evidence | powder residue"
    ],
    hidden: [
      "[HIDDEN] CRITICAL: Full SRS system inspection required",
      "[HIDDEN] Seatbelt pretensioners likely fired - need replacement",
      "[HIDDEN] Airbag module needs replacement and coding"
    ]
  },

  seatbelt_damage: {
    visible: [
      "seatbelt torn | frayed | webbing damaged",
      "seatbelt locked | pretensioner fired | won't retract",
      "seatbelt buckle damaged | won't latch | mechanism failed"
    ],
    hidden: [
      "[HIDDEN] SAFETY: Seatbelt inspection required - may have internal damage"
    ]
  }
};

// Map new taxonomy keys → existing DAMAGE_DESCRIPTIONS keys for backward compat
const DAMAGE_DESCRIPTION_ALIASES = {
  'front_left_headlight': 'headlight_left',
  'front_right_headlight': 'headlight_right',
  'front_windshield': 'windshield',
  'upper_bumper': 'front_bumper',
  'lower_bumper': 'front_bumper',
  'rear_bumper_upper': 'rear_bumper',
  'rear_bumper_lower': 'rear_bumper',
  'front_left_fender': 'front_fender_left',
  'front_right_fender': 'front_fender_right',
  'front_left_door': 'front_door_left',
  'front_right_door': 'front_door_right',
  'rear_left_door': 'rear_door_left',
  'rear_right_door': 'rear_door_right',
  'left_mirror': 'side_mirror_left',
  'right_mirror': 'side_mirror_right',
  'rear_left_headlight_outer': 'taillight_left',
  'rear_right_headlight_outer': 'taillight_right',
  'rear_left_headlight_inner': 'taillight_left',
  'rear_right_headlight_inner': 'taillight_right',
  'trunk_door': 'trunk',
  'left_quarter_panel': 'quarter_panel_left',
  'rear_right_quarter_panel': 'quarter_panel_right',
  // Legacy v1 names
  'left_quarterpanel': 'quarter_panel_left',
  'rear_right_quarterpanel': 'quarter_panel_right',
  'left_rocker_panel': 'rocker_panel_left',
  'right_rocker_panel': 'rocker_panel_right',
  // Legacy v1 names
  'left_rockerpanel': 'rocker_panel_left',
  'right_rockerpanel': 'rocker_panel_right',
  'front_left_pan_panel': 'inner_fender_left',
  'front_right_pan_panel': 'inner_fender_right',
  'rear_left_pan_panel': 'inner_quarter_panel_left',
  'rear_right_pan_panel': 'inner_quarter_panel_right',
  'front_right_rail': 'front_rail_right',
  'front_left_rail': 'front_rail_left',
  'front_right_cross_member': 'front_rail_right',
  'front_left_cross_member': 'front_rail_left',
  'rear_right_cross_member': 'rear_rail_right',
  'rear_left_cross_member': 'rear_rail_left',
  'front_right_shock_absorber': 'suspension_front_right',
  'front_left_shock_absorber': 'suspension_front_left',
  'rear_left_shock_absorber': 'suspension_rear_left',
  'rear_right_shock_absorber': 'suspension_rear_right',
  'front_right_control_arm': 'suspension_front_right',
  'front_left_control_arm': 'suspension_front_left',
  'rear_right_control_arm': 'suspension_rear_right',
  'rear_left_control_arm': 'suspension_rear_left',
  'front_carrier': 'radiator_support',
  'rear_bumper_crash_foam': 'rear_bumper',
  'front_bumper_chassis_bar': 'radiator_support',
  'rear_right_inner_pillar': 'inner_quarter_panel_right',
  'rear_left_inner_pillar': 'inner_quarter_panel_left',
  'front_right_inner_pillar': 'inner_fender_right',
  'front_left_inner_pillar': 'inner_fender_left',
  'rear_panel': 'rear_bumper',
  // Condenser rename
  'ac_condenser': 'condenser',
  // Additional / Repair parts → existing DAMAGE_DESCRIPTIONS
  'front_impact_bar': 'radiator_support',
  'radiator_support': 'radiator_support',
  'hood_latch_assembly': 'hood',
  'headlight_mounting_brackets': 'headlight_right',
  'suspension_control_arms': 'suspension_front_right',
  'tie_rods': 'suspension_front_right',
  'front_wiring_harness_and_sensors': 'front_harness',
  'front_left_fender_liner': 'front_fender_left',
  'front_right_fender_liner': 'front_fender_right',
  'rear_left_fender_liner': 'quarter_panel_left',
  'rear_right_fender_liner': 'quarter_panel_right',
  'front_left_suspension_assembly': 'suspension_front_left',
  'front_right_suspension_assembly': 'suspension_front_right',
  'rear_left_suspension_assembly': 'suspension_rear_left',
  'rear_right_suspension_assembly': 'suspension_rear_right',
  'cooling_system': 'condenser',
  'dashboard_internal_structure': 'tableau',
  'front_left_chassis_rail': 'front_rail_left',
  'rear_impact_bar': 'rear_impact_bar',
  'rear_body_panel': 'rear_bumper',
  'trunk_latch_and_striker': 'trunk',
  'liftgate_struts': 'trunk',
  'rear_bumper_brackets': 'rear_bumper',
  'rear_parking_sensor_harness': 'rear_harness',
  'inner_wheel_well_liner': 'front_fender_left',
  // v2 fog trim renames
  'front_left_fog_trim': 'front_fender_left',
  'front_right_fog_trim': 'front_fender_right',
  // Legacy v1 fog trim names
  'front_left_fogtrim': 'front_fender_left',
  'front_right_fogtrim': 'front_fender_right',
  // v2 split airbags → airbag_deployed descriptions
  'front_left_airbag': 'airbag_deployed',
  'front_right_airbag': 'airbag_deployed',
  'rear_left_airbag': 'airbag_deployed',
  'rear_right_airbag': 'airbag_deployed',
  // v3.1 canonical airbag entries → reuse airbag_deployed descriptors
  'airbag_module': 'airbag_deployed',
  'side_curtain_airbag_system': 'airbag_deployed',
  'left_side_curtain_airbags': 'airbag_deployed',
  'right_side_curtain_airbags': 'airbag_deployed',
  'steering_wheel_driver_airbag': 'airbag_deployed',
  'driver_knee_airbag': 'airbag_deployed',
  'airbag_impact_sensors': 'airbag_deployed',
  // v3.1 chassis bulkhead → radiator_support descriptors (similar concept)
  'front_bulkhead': 'radiator_support',
  // Legacy generic airbags
  'airbags': 'airbag_deployed',
  // v2 split seatbelts → seatbelt_damage descriptions
  'front_left_seatbelt': 'seatbelt_damage',
  'front_right_seatbelt': 'seatbelt_damage',
  'rear_left_seatbelt': 'seatbelt_damage',
  'rear_right_seatbelt': 'seatbelt_damage',
  // Legacy generic seatbelts
  'seatbelts': 'seatbelt_damage',
  // v2 split seatbelt pretensioners
  'front_left_seatbelt_pretensioner': 'seatbelt_damage',
  'front_right_seatbelt_pretensioner': 'seatbelt_damage',
  'rear_left_seatbelt_pretensioner': 'seatbelt_damage',
  'rear_right_seatbelt_pretensioner': 'seatbelt_damage',
  // Legacy generic pretensioner
  'seatbelt_pretensioner': 'seatbelt_damage',
};

// ============================================================================
// HELPER: Generate Damage Descriptions Reference for Prompt
// ============================================================================
function generateDamageDescriptionsReference() {
  let reference = '';

  for (const [partKey, partData] of Object.entries(DAMAGE_DESCRIPTIONS)) {
    const partName = partKey.replace(/_/g, ' ').toUpperCase();
    reference += `\n[${partName}]\n`;

    // Visible damages
    if (partData.visible && partData.visible.length > 0) {
      reference += `  Visible: ${partData.visible.slice(0, 3).join(' | ')}\n`;
    }

    // Hidden damages (important for detecting damage behind visible damage)
    if (partData.hidden && partData.hidden.length > 0) {
      reference += `  Hidden: ${partData.hidden.slice(0, 2).join(' | ')}\n`;
    }

    // Severity descriptions
    if (partData.severity_descriptions) {
      reference += `  Severity:\n`;
      reference += `    - Minor: ${partData.severity_descriptions.minor}\n`;
      reference += `    - Moderate: ${partData.severity_descriptions.moderate}\n`;
      reference += `    - Severe: ${partData.severity_descriptions.severe}\n`;
    }
  }

  return reference;
}

function normalizeVehicleInfo(vehicleInfo) {
  if (!vehicleInfo || typeof vehicleInfo !== 'object') return null;

  const normalized = {};
  for (const field of ['make', 'model', 'year', 'trim']) {
    const value = vehicleInfo[field];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) normalized[field] = trimmed;
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
}

function describeVehicle(vehicleInfo) {
  const normalized = normalizeVehicleInfo(vehicleInfo);
  if (!normalized) return '';

  return ['year', 'make', 'model', 'trim']
    .map(field => normalized[field])
    .filter(Boolean)
    .join(' ');
}

// ============================================================================
// [LEGACY] GEMINI AI PROMPT (MULTI-IMAGE COMPREHENSIVE INSPECTION)
// ============================================================================
function buildAnalysisPrompt(vehicleInfo, imageCount) {
  const vehicleLabel = describeVehicle(vehicleInfo);
  const damageDescriptionsRef = generateDamageDescriptionsReference();

  return `You are an AI computer vision assistant engineer and insurance damage assessor specialized in specialized in vehicle damage assessment based on visual evidence

You are analyzing ${imageCount} images of a vehicle${vehicleLabel ? ` (${vehicleLabel})` : ''}.
You must analyze ALL ${imageCount} images together to create a comprehensive damage assessment.
Follow fixed rules and fixed output structure.
You must NEVER hallucinate damage.
You must NEVER infer damage not visually supported across the images.
You must NEVER guess any damage not found visually in the vehicle object.
Use consistent wording and fixed labels.

-----------------------------------
CORE PRINCIPLES (MANDATORY)
-----------------------------------
- Temperature is assumed 0 → no creativity.
- If visual evidence is insufficient → mark as "Retake needed".
- Cross-reference multiple images to confirm damage.

-----------------------------------
PHOTO QUALITY CHECK (FIRST STEP)
-----------------------------------
Evaluate the quality of all ${imageCount} images provided.
For each image assess:
- Resolution
- Lighting
- Visibility of relevant vehicle areas
- Presence of blur, glare, shadows, colors, resolution, edges  or obstruction
If most images prevent reliable inspection:
- photo_quality_status = ""Retake needed".

------------------------
STRUCTURED VISUAL INSPECTION
-----------------------------------
Perform a structured inspection using predefined regions and parts.

Before listing damages, you must perform a full Structured visual inspection by predefined regions and parts. (rule-based) scan of the vehicle images:
"Structured visual inspection by predefined regions and parts"
Regions and parts include (but are not limited to):

1.1 - Front upper [REGION]
[PART TAXONOMY]: (hood, front windshield, front wipers, a pillars, roof)

1.2 - Front middle [REGION]
[PART TAXONOMY]: (grille, front right headlight, front left headlight, upper bumper, front car logo, trim nickel grille)

1.3 - Front lower [REGION]
[PART TAXONOMY]: (lower grille, front right foglight, front left foglight, lower bumper, front left fog trim, front right fog trim)

1.4 - Left side [REGION]
[PART TAXONOMY]: (front left fender, left rocker panel, front left door, rear left door, left quarter panel, left mirror, front left door window, rear left door window, front left door handle, rear left door handle)

1.5 - Right side [REGION]
[PART TAXONOMY]: (front right fender, right rocker panel, front right door, rear right door, rear right quarter panel, b pillar, right mirror, front right door window, rear right door window, front right door trim, rear right door trim, front right door handle, rear right door handle)

1.6 - Rear upper [REGION]
[PART TAXONOMY]: (rear bumper upper, rear bumper lower, rear wiper, c pillar, rear windshield)

1.7 - Rear middle [REGION]
[PART TAXONOMY]: (rear left headlight inner, rear right headlight inner, rear left headlight outer, rear right headlight outer, trunk door, rear car logo)

1.8 - Tires [REGION]
[PART TAXONOMY]: (front left tire, front right tire, rear right tire, rear left tire)

1.9 - Wheels [REGION]
[PART TAXONOMY]: (front left wheel, front right wheel, rear right wheel, rear left wheel)

1.10 - Top view [REGION]
[PART TAXONOMY]: (roof, roof window, roof trims, aerial)

1.11 - Undercarriage area [REGION]
[PART TAXONOMY]: (exhaust manifold, exhaust front pipe, exhaust middle pipe, exhaust rear pipe, underbody chassis, engine shield, rear shield, front shield, brake hoses, gas hoses, fuel tank)

1.12 - Chassis structure [REGION]
[PART TAXONOMY]: (front bumper chassis bar, front carrier, rear bumper chassis bar, rear bumper crash foam, front right cross member, front left cross member, hood latch, front right rail, front left rail, front left pan panel, front right pan panel, rear right cross member, rear left cross member, spare tire pan, rear right pan panel, rear left pan panel, rear right inner pillar, rear left inner pillar, front right inner pillar, front left inner pillar, front right door hinge, front left door hinge, rear right door hinge, rear left door hinge, rear panel)

1.13 - Interiors [REGION]
[PART TAXONOMY]: (front left airbag, front right airbag, rear left airbag, rear right airbag, front left seatbelt, front right seatbelt, rear left seatbelt, rear right seatbelt, tableau)

1.14 - Mechanicals [REGION]
[PART TAXONOMY]: (engine block, engine oil pan, transmission housing, transmission oil pan, engine mounts, transmission mounts, driveshaft, front differential, rear differential)

1.15 - Cooling system [REGION]
[PART TAXONOMY]: (radiator, ac condenser, intercooler turbo, radiator cap, transmission cooler, coolant pump, radiator hoses, turbo coolant hoses, radiator fan, fan motor)

1.16 - Suspension [REGION]
[PART TAXONOMY]: (front right shock absorber, front left shock absorber, rear left shock absorber, rear right shock absorber, front right control arm, front left control arm, rear right control arm, rear left control arm, front right steering knuckle, front left steering knuckle, rear right steering knuckle, rear left steering knuckle, steering rack, steering column, inner tie rod, outer tie rod)

1.17 - Electrical [REGION]
[PART TAXONOMY]: (front harness, rear harness, battery, front parking sensors, rear parking sensors, front camera, rear camera, airbag module, front left seatbelt pretensioner, front right seatbelt pretensioner, rear left seatbelt pretensioner, rear right seatbelt pretensioner, bcm module, ecm module, tcm module, adas module)

1.18 - Additional / Repair Parts [REGION]
[PART TAXONOMY]: (front impact bar, radiator support, hood latch assembly, headlight mounting brackets, suspension control arms, tie rods, front wiring harness and sensors, washer fluid reservoir, front left fender liner, front right fender liner, rear left fender liner, rear right fender liner, front left suspension assembly, front right suspension assembly, rear left suspension assembly, rear right suspension assembly, cooling system, dashboard internal structure, front left chassis rail, rear impact bar, rear body panel, trunk latch and striker, liftgate struts, rear bumper brackets, rear parking sensor harness, inner wheel well liner)
---------------------------------------

*For these regions,
  undercarriage
  chassis structure
  interiors
  mechanicals
  cooling system
  suspension
  electrical modules
  additional / repair parts
Only inspect these regions if they are clearly visible in the images.
If not visible, mark as "Not visible".



2. For each region:
 2.1  - Inspect edges, alignment, panel gaps, deformation , cracks,broken , scratches , dents , tears, inconsistent curvature, wavy body, paint cracking , missed part, distorted and reflection lines, and all types of damages.
  2.2 - Check symmetry between left and right.
  2.3- Look for dents, cracks, bends, deformation, misalignment, or displaced  and missed parts.

3. After scanning all regions:
   - List every damaged part you found in each region.
   - Do not stop early if you find one damage.
   - Avoid focusing only on the most obvious damage, instead focus on all damages in images
- Detect visually damaged physical areas
- Internally map each damage to the matching PART from the taxonomy
- Output ONLY the mapped taxonomy part_name


Do NOT:
- Guess
- Assume internal damage
- Generalize beyond visible evidence

4. If a region cannot be fully inspected due to angle, occlusion, or lighting:
   - Mark that region as "Retake needed" instead of skipping it.

*5. Only after all regions are examined, produce the final structured output. *
6. You are NOT allowed to invent, rename, alias, shorten, translate, or reformat any vehicle part names.
7.You must SELECT part names ONLY from the predefined PART TAXONOMY listed under each REGION.

-----------------------------------
Important rules.
-----------------------------------

1. For PAIRED PARTS (headlights, mirrors, fog lights, doors, fenders, etc.):
   - ONLY report the SPECIFIC side that is damaged (left OR right)
   - Do NOT report both sides unless BOTH are detected to be  damaged
   - Example: If only right headlight is cracked, report "front right headlight" only

2. For BUMPERS with sectional damage:
   - Specify if damage is on "upper bumper" or "lower bumper" section, do not detect both, only detect the damaged part.

3. For HIDDEN Prefix detection:

If visible exterior damage reasonably suggests possible underlying damage:
- Flag it using [HIDDEN]
- Confidence must be < 0.70
- Only flag when a clear visual trigger exists
- Do not flag if evidence is weak or speculative

4. part_name values MUST be exact string matches from the predefined [PART TAXONOMY]
- For part name, Do NOT:
  - Invent new part names
  - Use synonyms (e.g., "headlamp" instead of "FR_Right_Headlight")
  - Use alternative casing, spacing, or prefixes
- If visual damage exists but mapping is uncertain:
  → Place the taxonomy part ONLY in "needs_check_parts"
- If no taxonomy part applies:
  → Do NOT output any part
TAXONOMY ENFORCEMENT RULE:
- All part_name values MUST exactly match predefined taxonomy PARTS
- Any output using a non-taxonomy name is INVALID
- Example:
  ❌ - INVALID- FR_Bumper
  ✅ -VALID- Upper bumper

ONE PART PER ITEM RULE (MANDATORY):
- Each "part_name" MUST refer to EXACTLY ONE taxonomy part.
- DO NOT combine multiple parts in a single string using "and", "/", "&", "+", or commas.
- DO NOT use grouping nouns like "cooling stack", "front-end assembly", "front cooling pack".
- If two parts are damaged, emit TWO SEPARATE objects in the array — one per part.
- ❌ INVALID: "radiator and ac condenser", "radiator/condenser", "front bumper and grille"
- ✅ VALID: { "part_name": "radiator", ... }, { "part_name": "ac condenser", ... }


---------------------------------------
DAMAGE DESCRIPTIONS BY PART:
${damageDescriptionsRef}

-----------------------------------
SAFETY & FUNCTIONAL FLAGS
-----------------------------------
Flag TRUE if visible in any image:
- Headlamp broken
- Windshield cracked
- Wheel or suspension misalignment
- Electrical exposure
- Airbag deployment evidence
- Engine bay intrusion

If not clearly visible → FALSE


-----------------------------------
CONFIDENCE SCORING
-----------------------------------
Overall confidence:
- Weighted average of item confidences
- Reduced if photo_quality_status = "Retake needed".
- Increased if damage visible from multiple angles
----------------------------------------------
OUTPUT REQUIREMENTS
--------------------------------------------------
Return a single structured output.
Use consistent wording and fixed labels.
Base all conclusions strictly on visual evidence.
Return a single structured JSON output.
Part_name MUST come ONLY from predefined PART TAXONOMY
No aliases, no free-text part names
No inferred or assumed parts
No duplicate parts across arrays
- If confidence < 0.70 → part MUST appear ONLY in "needs_check_parts"

---------------------------------------
VALIDATION RULES (MANDATORY):
---------------------------------------
- Any part with confidence < 0.70 MUST be listed ONLY in "needs_check_parts".
- No part with confidence < 0.70 may appear in "damages".
- Any damage description containing words such as:
  "likely", "possible", "may", "unclear", "not sure"
  MUST be listed ONLY in "needs_check_parts".
- Parts listed in "needs_check_parts" MUST NOT be duplicated in "damages".
- Parts listed in "damages" MUST have confidence >= 0.70 and assertive wording. SELF-CHECK RULE:
- Before final output, verify that no part violates the confidence thresholds.
- If a violation exists, correct the output before returning JSON.
-----------------------------------
Python Schema
------------------------------------

damage_assessment_schema = {
    "type": "OBJECT",
    "properties": {
        "photo_quality_status": {
            "type": "STRING",
            "enum": ["Good", "Retake needed"],
            "description": "Assessment of image quality. If 'Retake needed', confidence is reduced."
        },
        "vehicle_details_confirmed": {
            "type": "OBJECT",
            "properties": {
                "make": {"type": "STRING"},
                "model": {"type": "STRING"},
                "year": {"type": "STRING"},
                "color": {"type": "STRING"}
            }
        },
        "safety_flags": {
            "type": "OBJECT",
            "properties": {
                "headlamp_broken": {"type": "BOOLEAN"},
                "windshield_cracked": {"type": "BOOLEAN"},
                "electrical_exposure": {"type": "BOOLEAN"},
                "airbag_deployment": {"type": "BOOLEAN"},
                "engine_bay_intrusion": {"type": "BOOLEAN"}
            },

        "damages": {
            "type": "ARRAY",
            "description": "List of CONFIRMED damages (Confidence >= 0.70).",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "part_name": {"type": "STRING"},
                    "damage_type": {"type": "STRING"},
                    "description": {"type": "STRING"},
                    "confidence": {"type": "NUMBER", "description": "Must be >= 0.70"}
                },
                "required": ["part_name", "damage_type", "description", "confidence"]
            }
        },
        "needs_check_parts": {
            "type": "ARRAY",
            "description": "List of SUSPECTED damages (Confidence < 0.70) or hidden prefixes.",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "part_name": {"type": "STRING"},
     "damage_type": {"type": "STRING"},
                    "description": {"type": "STRING"},

                    "reason_for_uncertainty": {"type": "STRING", "description": "Why is confidence low? (e.g., glare, angle, occlusion)"},
                    "confidence": {"type": "NUMBER", "description": "Must be < 0.70"}
                },
                "required": ["part_name",  "damage_type" , "description", "confidence"]
            }
        },
        "overall_confidence_score": {
            "type": "NUMBER",
            "description": "Weighted average 0.0 to 1.0"
        },
        "summary": {
            "type": "STRING",
            "description": "A concise text summary of the total loss/damage assessment."
        }
    },
    "required": ["photo_quality_status", "damages", "needs_check_parts", "safety_flags"]
}


---------------------
Json
---------------------
{
  "photo_quality_status": "Good",
  "vehicle_details_confirmed": { ... },
  "safety_flags": { ... },
  "damages": [
    {
      "part_name": "Upper bumper",
      "damage_type": "Dent",
      "description": "Deep impact dent on the right side, approx 5cm.",
      "confidence": 0.95
    },
    {
      "part_name": "FR_Right_Headlight",
      "damage_type": "Crack",
      "description": "Lens cracked across the center.",
      "confidence": 0.98
    }
  ],
  "needs_check_parts": [],
  "overall_confidence_score": 0.96,
  "summary": "Vehicle shows clear impact damage to the front right corner..."
}

Now analyze the provided ${imageCount} image(s):`;
}

// ============================================================================
// [PIPELINE] 4-STAGE CHAINED PROMPT — Anti-Hallucination Architecture
// ============================================================================
// Stage 1: Image Quality + Vehicle ID       → gate check
// Stage 2: Visible Damage Detection         → constrained by Stage 1
// Stage 3: Structural Assessment (text-only) → from confirmed damages only
// Stage 4: Hidden Damage Inference (text-only) → auto-capped confidence
// ============================================================================

/**
 * Area-to-parts mapping for anti-hallucination filter.
 * Maps visible regions to the taxonomy part names that belong to them.
 * Includes both normalized and raw taxonomy forms for fuzzy matching.
 */
function buildAreaToPartsMap() {
  return {
    front_upper: [
      'hood', 'front_windshield', 'front_wipers', 'a_pillars', 'roof',
      // Legacy aliases
      'windshield', 'a_pillar_left', 'a_pillar_right', 'a-pillars'
    ],
    front_middle: [
      'grille', 'front_right_headlight', 'front_left_headlight',
      'upper_bumper', 'front_car_logo', 'trim_nickel_grille',
      'headlight_mounting_brackets', 'washer_fluid_reservoir',
      // Legacy aliases
      'headlight_right', 'headlight_left', 'front_bumper',
      'fr_right_headlight', 'fr_left_headlight', 'upper_bumper_front', 'fr_car_logo'
    ],
    front_lower: [
      'lower_grille', 'front_right_foglight', 'front_left_foglight',
      'lower_bumper', 'front_left_fog_trim', 'front_right_fog_trim',
      // Legacy aliases
      'lower_bumper_front', 'front_bumper', 'foglight_right', 'foglight_left',
      'fr_right_foglight', 'fr_left_foglight', 'fog_trim_left', 'fog_trim_right',
      'fr_left_fogtrim', 'fr_right_fogtrim',
      'front_left_fogtrim', 'front_right_fogtrim'
    ],
    left_side: [
      'front_left_fender', 'left_rocker_panel', 'front_left_door', 'rear_left_door',
      'left_quarter_panel', 'left_mirror',
      'front_left_door_window', 'rear_left_door_window',
      'front_left_door_handle', 'rear_left_door_handle',
      'front_left_fender_liner', 'rear_left_fender_liner',
      // Legacy aliases
      'front_fender_left', 'fl_fender', 'rocker_panel_left', 'l_rockerpanel', 'left_rockerpanel',
      'front_door_left', 'fl_door', 'rear_door_left', 'rl_door',
      'quarter_panel_left', 'left_quarterpanel',
      'b_pillar_left', 'left_b_pillar', 'side_mirror_left',
      'fl_door_window', 'rl_door_window', 'fl_door_trim', 'rl_door_trim',
      'fl_door_handle', 'rl_door_handle'
    ],
    right_side: [
      'front_right_fender', 'right_rocker_panel', 'front_right_door', 'rear_right_door',
      'rear_right_quarter_panel', 'b_pillar', 'right_mirror',
      'front_right_door_window', 'rear_right_door_window',
      'front_right_door_trim', 'rear_right_door_trim',
      'front_right_door_handle', 'rear_right_door_handle',
      'front_right_fender_liner', 'rear_right_fender_liner',
      // Legacy aliases
      'front_fender_right', 'fr_fender', 'rocker_panel_right', 'r_rockerpanel', 'right_rockerpanel',
      'front_door_right', 'fr_door', 'rear_door_right', 'rr_door',
      'quarter_panel_right', 'rear_right_quarterpanel',
      'b_pillar_right', 'right_b_pillar', 'side_mirror_right',
      'fr_door_window', 'rr_door_window', 'fr_door_trim', 'rr_door_trim',
      'fr_door_handle', 'rr_door_handle'
    ],
    rear_upper: [
      'rear_bumper_upper', 'rear_bumper_lower', 'rear_wiper', 'c_pillar', 'rear_windshield', 'roof',
      // Legacy aliases
      'rear_bumper', 'trunk', 'c_pillar_left', 'c_pillar_right', 'c-pillar'
    ],
    rear_middle: [
      'rear_left_headlight_inner', 'rear_right_headlight_inner',
      'rear_left_headlight_outer', 'rear_right_headlight_outer',
      'trunk_door', 'rear_car_logo',
      'trunk_latch_and_striker', 'liftgate_struts',
      // Legacy aliases
      'taillight_left', 'taillight_right',
      'rl_headlight_inner', 'rr_headlight_inner',
      'rl_headlight_outer', 'rr_headlight_outer',
      'trunk', 'trunk_lid'
    ],
    rear_lower: [
      'rear_bumper_upper', 'rear_bumper_lower',
      // Legacy aliases
      'rear_bumper', 'rear_lower_bumper',
      'rr_foglight', 'rl_foglight', 'rr_nickel_trim', 'rl_nickel_trim'
    ],
    tires: [
      'front_left_tire', 'front_right_tire', 'rear_right_tire', 'rear_left_tire',
      // Legacy aliases
      'fl_tire', 'fr_tire', 'rr_tire', 'rl_tire'
    ],
    wheels: [
      'front_left_wheel', 'front_right_wheel', 'rear_right_wheel', 'rear_left_wheel',
      // Legacy aliases
      'fl_wheel', 'fr_wheel', 'rr_wheel', 'rl_wheel'
    ],
    top_view: ['roof', 'roof_window', 'roof_trims', 'aerial'],
    undercarriage: [
      'exhaust_manifold', 'exhaust_front_pipe', 'exhaust_middle_pipe', 'exhaust_rear_pipe',
      'underbody_chassis', 'engine_shield', 'rear_shield', 'front_shield',
      'brake_hoses', 'gas_hoses', 'fuel_tank'
    ],
    chassis: [
      // Part Taxonomy v3.1 canonicals
      'front_bumper_chassis_bar', 'front_carrier', 'rear_bumper_chassis_bar',
      'rear_bumper_crash_foam', 'front_right_cross_member', 'front_left_cross_member',
      'hood_latch', 'front_right_rail', 'front_left_rail',
      'front_left_pan_panel', 'front_right_pan_panel',
      'rear_right_cross_member', 'rear_left_cross_member', 'spare_tire_pan',
      'rear_right_pan_panel', 'rear_left_pan_panel',
      'rear_right_inner_pillar', 'rear_left_inner_pillar',
      'front_right_inner_pillar', 'front_left_inner_pillar',
      'front_right_door_hinge', 'front_left_door_hinge',
      'rear_right_door_hinge', 'rear_left_door_hinge',
      'rear_panel', 'rear_impact_bar', 'radiator_support',
      'rear_bumper_brackets', 'front_right_apron', 'front_left_apron',
      'rear_frame_rail_left', 'rear_frame_rail_right', 'front_bulkhead',
      'underbody_chassis', 'engine_shield', 'rear_shield', 'front_shield',
      'headlight_mounting_brackets', 'trunk_latch_and_striker', 'liftgate_struts',
      // Folded-into-canonical aliases (resolved via PART_NAME_ALIASES)
      'front_impact_bar', 'hood_latch_assembly',
      'front_left_chassis_rail', 'rear_body_panel',
      // Legacy short aliases
      'fr_carrier', 'bumper_crash_foam', 'fr_cross_member', 'fl_cross_member',
      'fr_rail', 'fl_rail', 'fr_inner_quarterpanel', 'fl_inner_quarterpanel_fender',
      'rr_cross_member', 'rl_cross_member', 'rr_inner_quarterpanel', 'rl_inner_quarterpanel',
      'rr_inner_pillar', 'rl_inner_pillar', 'fr_inner_pillar', 'fl_inner_pillar',
      'fr_door_hinge', 'fl_door_hinge', 'rr_door_hinge', 'rl_door_hinge',
      'fr_fender_sidemember', 'fl_fender_sidemember',
      'front_bumper_reinforcement_bar', 'core_support', 'hood_lock', 'hood_lock_assembly',
      'rear_impact_reinforcement_bar', 'rear_end_panel'
    ],
    interiors: [
      // Part Taxonomy v3.1 canonicals (airbags + seatbelts + tableau)
      'airbag_module', 'side_curtain_airbag_system',
      'left_side_curtain_airbags', 'right_side_curtain_airbags',
      'steering_wheel_driver_airbag', 'driver_knee_airbag', 'airbag_impact_sensors',
      'front_left_seatbelt', 'front_right_seatbelt', 'rear_left_seatbelt', 'rear_right_seatbelt',
      'tableau', 'dashboard_internal_structure',
      // Folded/legacy aliases (resolved via PART_NAME_ALIASES)
      'front_left_airbag', 'front_right_airbag', 'rear_left_airbag', 'rear_right_airbag',
      'airbags', 'seatbelts'
    ],
    mechanicals: [
      'engine_block', 'engine_oil_pan', 'transmission_housing', 'transmission_oil_pan',
      'engine_mounts', 'transmission_mounts', 'driveshaft',
      'front_differential', 'rear_differential'
    ],
    cooling: [
      'radiator', 'ac_condenser', 'intercooler_turbo', 'radiator_cap',
      'transmission_cooler', 'coolant_pump', 'radiator_hoses',
      'turbo_coolant_hoses', 'radiator_fan', 'fan_motor',
      'cooling_system',
      // Legacy aliases
      'condenser', 'fan_shroud', 'fr_carrier'
    ],
    suspension: [
      'front_right_shock_absorber', 'front_left_shock_absorber',
      'rear_left_shock_absorber', 'rear_right_shock_absorber',
      'front_right_control_arm', 'front_left_control_arm',
      'rear_right_control_arm', 'rear_left_control_arm',
      'front_right_steering_knuckle', 'front_left_steering_knuckle',
      'rear_right_steering_knuckle', 'rear_left_steering_knuckle',
      'steering_rack', 'steering_column', 'inner_tie_rod', 'outer_tie_rod',
      'suspension_control_arms', 'tie_rods',
      'front_left_suspension_assembly', 'front_right_suspension_assembly',
      'rear_left_suspension_assembly', 'rear_right_suspension_assembly',
      // Legacy aliases
      'fr_shock_absorber', 'fl_shock_absorber', 'rl_shock_absorber', 'rr_shock_absorber',
      'fr_control_arm', 'fl_control_arm', 'rr_control_arm', 'rl_control_arm',
      'fr_steering_knuckle', 'fl_steering_knuckle', 'rr_steering_knuckle', 'rl_steering_knuckle',
      'fr_coil_spring', 'fl_coil_spring', 'rr_coil_spring', 'rl_coil_spring'
    ],
    electrical: [
      'front_harness', 'rear_harness', 'battery',
      'front_parking_sensors', 'rear_parking_sensors',
      'front_camera', 'rear_camera', 'airbag_module',
      'front_left_seatbelt_pretensioner', 'front_right_seatbelt_pretensioner',
      'rear_left_seatbelt_pretensioner', 'rear_right_seatbelt_pretensioner',
      'bcm_module', 'ecm_module', 'tcm_module', 'adas_module',
      // Legacy alias
      'seatbelt_pretensioner',
      'front_wiring_harness_and_sensors', 'rear_parking_sensor_harness'
    ],
    interiors_additional: [
      'dashboard_internal_structure',
      // Legacy aliases
      'tableau'
    ],
    additional_repair: [
      'inner_wheel_well_liner'
    ]
  };
}

// --- Generic Gemini API callers ---

async function callGeminiRaw(requestBody) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONFIG.AI_TIMEOUT);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      }
    );

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 401) throw new Error('Invalid API key. Please check your GEMINI_API_KEY.');
      if (response.status === 429) throw new Error('Rate limit exceeded. Please try again later.');
      throw new Error(`Gemini API error: ${response.status} - ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`Gemini error: ${data.error.message || JSON.stringify(data.error)}`);
    }

    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) {
      throw new Error('No content in Gemini response');
    }

    return content;
  } catch (error) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      throw new Error('AI analysis timeout. Please try with fewer or smaller images.');
    }
    throw error;
  }
}

// Map of internal view keys → human-readable labels used in prompts.
// The frontend uses a 17-slot IMAGE PROTOCOL: each slot maps to exactly one
// (view, angle) pair below.
//
//  Section A — Perimeter (general context, all WIDE):
//    front, back, right, left, top, interior
//  Section B — Zone-specific deep dives (all CLOSE):
//    front, front_right, front_left, back, rear_right, rear_left
//  Section C — Structural & chassis (optional, WIDE):
//    front_chassis_rails, rear_chassis
//  Section D — Mechanical (WIDE):
//    engine_bay, fluid_leaks, dashboard_running
const VEHICLE_VIEW_LABELS = {
  front: 'FRONT (front-facing exterior — hood, grille, front bumper, headlights, windshield)',
  back: 'BACK / REAR (rear-facing exterior — trunk, rear bumper, taillights, rear windshield)',
  left: 'LEFT SIDE (driver-side exterior, full-length — left fender, left doors, left rocker, left quarter panel, left mirror)',
  right: 'RIGHT SIDE (passenger-side exterior, full-length — right fender, right doors, right rocker, right quarter panel, right mirror)',
  top: 'TOP / ROOF (overhead view — roof panel, sunroof/roof window, roof trims, antenna)',
  interior: 'INTERIOR (cabin shot with ENGINE OFF — dashboard/tableau, steering wheel, deployed/undeployed airbags, seatbelts)',
  front_right: 'FRONT-RIGHT CORNER (close-up of front-right corner — right headlight, right end of front bumper, right edge of hood, right front fender)',
  front_left: 'FRONT-LEFT CORNER (close-up of front-left corner — left headlight, left end of front bumper, left edge of hood, left front fender)',
  rear_right: 'REAR-RIGHT CORNER (close-up of rear-right corner — right taillight, right end of rear bumper, right edge of trunk, right rear quarter panel)',
  rear_left: 'REAR-LEFT CORNER (close-up of rear-left corner — left taillight, left end of rear bumper, left edge of trunk, left rear quarter panel)',
  front_chassis_rails: 'FRONT CHASSIS RAILS (structural shot of front chassis rails / front frame rails / front cross members — only present if applicable)',
  rear_chassis: 'REAR CHASSIS (structural shot of rear chassis / rear frame rails / rear cross members — only present if applicable)',
  engine_bay: 'ENGINE BAY (open hood — engine block, mounts, radiator/AC condenser, cooling fan, radiator core support, wiring harness)',
  fluid_leaks: 'FLUID LEAKS (under-car shot looking for oil/coolant/fuel/brake-fluid puddles or drips — undercarriage staining)',
  dashboard_running: 'DASHBOARD WITH ENGINE RUNNING (instrument cluster while the engine is ON — check for active warning lights: check engine, ABS, airbag, oil pressure, battery, coolant temp)',
};
const VEHICLE_VIEW_KEYS = Object.keys(VEHICLE_VIEW_LABELS);

// Per-image angle keys. Each image carries ONE view + ONE angle.
//  - "wide": full overview shot of the section. Use as the primary panel evidence.
//  - "close": close-up / zoom-in of a specific damage on the same section. Confirms or
//    refines damage already visible in the WIDE shots; does NOT create separate panels.
const IMAGE_ANGLE_LABELS = {
  wide: 'WIDE ANGLE (full-section overview)',
  close: 'CLOSE-UP ANGLE (zoomed-in detail of a specific damage on this section)',
};
const IMAGE_ANGLE_KEYS = Object.keys(IMAGE_ANGLE_LABELS);
const DEFAULT_IMAGE_ANGLE = 'wide';

function buildViewLabelsHeader(imageViews, imageAngles) {
  if (!Array.isArray(imageViews) || imageViews.length === 0) return '';

  const counts = imageViews.reduce((acc, v) => {
    acc[v] = (acc[v] || 0) + 1;
    return acc;
  }, {});
  const providedViews = VEHICLE_VIEW_KEYS.filter(k => counts[k]);
  const missingViews = VEHICLE_VIEW_KEYS.filter(k => !counts[k]);

  // Per-view wide/close split (when angles are supplied)
  const angleByView = {};
  imageViews.forEach((v, idx) => {
    const a = (Array.isArray(imageAngles) && imageAngles[idx]) || DEFAULT_IMAGE_ANGLE;
    if (!angleByView[v]) angleByView[v] = { wide: 0, close: 0 };
    angleByView[v][a] = (angleByView[v][a] || 0) + 1;
  });

  const providedSummary = providedViews
    .map(k => {
      const split = angleByView[k] || { wide: 0, close: 0 };
      return `  • ${k.toUpperCase()}: ${counts[k]} image(s)  [wide: ${split.wide || 0}, close: ${split.close || 0}]`;
    })
    .join('\n');
  const missingSummary = missingViews.length > 0
    ? missingViews.map(k => `  • ${k.toUpperCase()}`).join('\n')
    : `  (none — all ${VEHICLE_VIEW_KEYS.length} views provided)`;

  const lines = imageViews
    .map((v, i) => {
      const labelText = VEHICLE_VIEW_LABELS[v] || v.toUpperCase();
      const a = (Array.isArray(imageAngles) && imageAngles[i]) || DEFAULT_IMAGE_ANGLE;
      const angleText = IMAGE_ANGLE_LABELS[a] || a.toUpperCase();
      return `  • IMAGE ${i + 1} OF ${imageViews.length} → VIEW: ${labelText} | ANGLE: ${angleText}`;
    })
    .join('\n');

  return `\n--- IMAGE VIEW LABELS (PROVIDED BY USER) ---
The user follows a 17-SLOT IMAGE PROTOCOL with four sections. Every slot is OPTIONAL — many will be missing. That is EXPECTED, not an error. You MUST still produce a complete damage assessment using ONLY the images that ARE provided.

THE 17-SLOT PROTOCOL:
  A. PERIMETER (general context, WIDE angle):
     1. front (wide)        2. back (wide)         3. right (full length, wide)
     4. left  (full length, wide)                  5. top / roof (wide, from above)
     6. interior (dashboard / steering wheel, ENGINE OFF — used to detect deployed airbags)
  B. ZONE-SPECIFIC DEEP DIVES (CLOSE-UP angle):
     7. front (close)       8. front_right (corner close)    9. front_left (corner close)
    10. back  (close)      11. rear_right  (corner close)   12. rear_left  (corner close)
  C. STRUCTURAL & CHASSIS (WIDE, optional — only present after disassembly):
    13. front_chassis_rails    14. rear_chassis
  D. MECHANICAL (WIDE):
    15. engine_bay     16. fluid_leaks (under-car staining)     17. dashboard_running (ENGINE ON — warning lights)

VIEW vs ANGLE — both are provided per image. WIDE = full overview (primary evidence). CLOSE-UP = zoomed detail used to CONFIRM, refine, or upgrade severity of damage already evident in a WIDE shot — never to invent a separate panel/finding that has no support elsewhere.

When multiple images share the same view label, treat them as alternate angles / closer crops of the SAME area and CROSS-REFERENCE them (use them to confirm or rule out damage, not to double-count it). A part is "damaged" only if at least one image clearly shows the damage; if images of the same view conflict, prefer the higher-quality / closer image and lower the confidence accordingly. CLOSE-UPs without any matching WIDE shot are still valid — but lower confidence and flag the uncertainty.

INTERIOR vs DASHBOARD_RUNNING — both show the cabin/dash but their purpose differs:
  · interior  → engine is OFF. Use this to detect deployed airbags, broken windshield from inside, cabin intrusion, seatbelt deployment.
  · dashboard_running → engine is ON. Use ONLY this view to read active warning lights (check engine, ABS, airbag, oil pressure, battery, coolant temp) and feed them into the engine assessment.

SECTION C (front_chassis_rails, rear_chassis) is structural after disassembly. Only consult parts that physically live in that region. SECTION D (engine_bay, fluid_leaks, dashboard_running) covers mechanical and cooling. DO NOT infer damage to suspension, electrical, cooling, exhaust, undercarriage, or fuel system from exterior photos alone — those parts must be supported by a Section C or Section D image.

PER-VIEW IMAGE COUNTS (PROVIDED, with wide/close split):
${providedSummary}

VIEWS NOT PROVIDED BY THE USER (NO IMAGES — DO NOT INFER DAMAGE HERE):
${missingSummary}

CRITICAL RULES FOR MISSING VIEWS:
- For any view listed under "VIEWS NOT PROVIDED" above, treat every part that lives ONLY in that region as "Not visible" / unassessable.
- Do NOT report damage on parts that are not visible in ANY of the provided images.
- Do NOT mark the analysis as failed just because some views are absent — analyze what is provided and carry on.
- Lower the overall confidence proportionally if major views are missing, but still emit a complete structured report based on the provided images.
- Symmetry checks (left vs right, front vs rear) only apply when BOTH sides are represented in the provided images; if only one side is provided, do not infer the other side.

The image data in this request appears in the SAME ORDER as listed below.
Use the announced label for each image to focus on the parts visible from that angle and to disambiguate left/right and front/rear taxonomy parts.

PER-IMAGE ORDER:
${lines}
--- END IMAGE VIEW LABELS ---\n`;
}

async function callGeminiWithImages(prompt, images, imageViews, imageAngles) {
  const viewHeader = buildViewLabelsHeader(imageViews, imageAngles);
  const fullPrompt = viewHeader ? `${viewHeader}\n${prompt}` : prompt;
  const parts = [{ text: fullPrompt }];

  images.forEach((imageBase64, idx) => {
    const view = Array.isArray(imageViews) ? imageViews[idx] : null;
    const angle = (Array.isArray(imageAngles) && imageAngles[idx]) || (view ? DEFAULT_IMAGE_ANGLE : null);
    if (view) {
      const labelText = VEHICLE_VIEW_LABELS[view] || view.toUpperCase();
      const angleText = angle ? (IMAGE_ANGLE_LABELS[angle] || angle.toUpperCase()) : null;
      const annotation = angleText
        ? `\n[IMAGE ${idx + 1} OF ${images.length} — VIEW: ${labelText} — ANGLE: ${angleText}]`
        : `\n[IMAGE ${idx + 1} OF ${images.length} — VIEW: ${labelText}]`;
      parts.push({ text: annotation });
    }
    const { mimeType, imageData } = parseImageData(imageBase64);
    parts.push({ inline_data: { mime_type: mimeType, data: imageData } });
  });

  return callGeminiRaw({
    contents: [{ parts }],
    generationConfig: { temperature: 0, maxOutputTokens: 8192, topP: 1.0, seed: 42 }
  });
}

async function callGeminiTextOnly(prompt) {
  return callGeminiRaw({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 4096, topP: 1.0, seed: 42 }
  });
}

function parseStageJSON(content, stageName) {
  if (!content || content.trim().length === 0) {
    throw new Error(`${stageName}: Empty response`);
  }

  const jsonMatch =
    content.match(/```json\s*([\s\S]*?)\s*```/) ||
    content.match(/```\s*([\s\S]*?)\s*```/) ||
    content.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    throw new Error(`${stageName}: No JSON found in response`);
  }

  let jsonString = jsonMatch[1] || jsonMatch[0];

  try {
    return JSON.parse(jsonString.trim());
  } catch (firstError) {
    console.log(`  ${stageName}: Initial parse failed, attempting repair...`);
    try {
      return JSON.parse(repairTruncatedJSON(jsonString));
    } catch (repairError) {
      throw new Error(`${stageName}: JSON parse failed: ${firstError.message}`);
    }
  }
}

// --- Stage Prompt Builders ---

function buildStage1Prompt(vehicleInfo, imageCount) {
  const vehicleLabel = describeVehicle(vehicleInfo);

  return `You are a vehicle image triage system. Analyze these ${imageCount} image(s) and return ONLY a JSON object.

YOUR TASKS (in order):
1. Is this a vehicle? If not, set "isVehicle": false and return immediately.
2. Assess overall image quality (resolution, lighting, blur, obstruction).
3. Identify the vehicle: make, model, approximate year, color.
4. List which regions/areas of the vehicle are visible across ALL images.

${vehicleLabel ? `User-provided vehicle details (may be incomplete): ${vehicleLabel}` : 'No vehicle details were provided by the user. Infer them visually only if they are obvious.'}

VISIBLE AREA KEYS — use ONLY these exact strings:
front_upper, front_middle, front_lower, left_side, right_side,
rear_upper, rear_middle, rear_lower, tires, wheels, top_view,
undercarriage, chassis, interiors, mechanicals, cooling, suspension, electrical

RULES:
- Only list an area as visible if you can clearly see parts belonging to that region.
- Do NOT list areas that are occluded, cut off, or too dark to inspect.
- Do NOT detect or mention any damage — that is handled separately.

Return this exact JSON structure:
\`\`\`json
{
  "isVehicle": true,
  "photoQuality": "Good",
  "qualityIssues": [],
  "vehicleDetails": {
    "make": "detected or unknown",
    "model": "detected or unknown",
    "year": "detected or unknown",
    "color": "detected color"
  },
  "visibleAreas": ["front_middle", "front_lower"],
  "imageCount": ${imageCount},
  "notes": "brief coverage notes"
}
\`\`\``;
}

// Stage 2A: Quick pre-check — "Is there ANY damage?" (no bias from damage descriptions)
function buildStage2APrompt(stage1Result, vehicleInfo) {
  const vehicleLabel =
    describeVehicle(vehicleInfo) || describeVehicle(stage1Result?.vehicleDetails);
  const color = (stage1Result.vehicleDetails && stage1Result.vehicleDetails.color) || '';
  const isRedOrDark = /red|black|dark|maroon|burgundy|brown/i.test(color);

  const colorWarning = isRedOrDark
    ? `\nCRITICAL WARNING: This is a ${color.toUpperCase()} vehicle. ${color} paint is NOTORIOUS for creating optical illusions that look exactly like dents, scratches, and deformations but are actually just reflections and shadows. You MUST apply extreme skepticism. On ${color} vehicles, what appears to be a "dent" is almost always a reflection of a nearby object, cloud, or building. What looks like a "scratch" is usually a highlight/reflection line from a light source. Assume it is NOT damage unless you can see paint transfer, bare metal, cracked plastic, or a missing piece.`
    : '';

  return `You are a SKEPTICAL vehicle damage screener. Your primary goal is to AVOID FALSE POSITIVES. You are screening images of a vehicle${vehicleLabel ? ` (${vehicleLabel})` : ''}.

DEFAULT ASSUMPTION: This vehicle has NO damage. You must PROVE damage exists beyond reasonable doubt before reporting it.
${colorWarning}

THE FOLLOWING ARE **NOT** DAMAGE — do not report them:
- Reflections of surrounding objects on paint (buildings, trees, sky, people, other cars)
- Shadows from lighting angles, overhangs, or nearby structures
- Factory body lines, character lines, panel edges, trim seams
- Paint color variation from different viewing angles (metallic/pearl paint shifts)
- Normal curves and contours of the vehicle body
- Dirt, dust, water droplets, or minor stone chips from normal driving
- Camera lens distortion, JPEG compression artifacts, image noise
- Matte vs glossy transitions on different body panels
- Any subtle variation that COULD be explained by lighting or reflections

REAL DAMAGE requires at least ONE of these UNMISTAKABLE signs:
- Clearly displaced metal/plastic that breaks the smooth body contour with sharp edges
- Visible paint transfer from another object (different color paint on the surface)
- Cracked, shattered, or broken components (glass, plastic, lenses)
- Missing parts (trim pieces, mirror caps, bumper sections that are clearly absent)
- Exposed bare metal, primer, or substrate beneath the paint
- Sharp creases or folds in metal that could not be a factory line
- Parts hanging loose, detached, or severely misaligned with large uneven gaps

If you are LESS than 95% certain something is real physical damage (not a visual artifact), classify it as NOT damage.

Answer with ONLY this JSON:
\`\`\`json
{
  "has_damage": true or false,
  "confidence": 0.0 to 1.0,
  "reasoning": "brief explanation"
}
\`\`\``;
}

function buildStage2AVerifyPrompt(stage2AClaims, vehicleInfo, stage1Result) {
  const vehicleLabel =
    describeVehicle(vehicleInfo) || describeVehicle(stage1Result?.vehicleDetails);
  const color = (stage1Result.vehicleDetails && stage1Result.vehicleDetails.color) || '';

  return `You are a SECOND OPINION damage verifier. A previous AI analysis of this ${color || 'unknown-color'} vehicle${vehicleLabel ? ` (${vehicleLabel})` : ''} claimed to find the following damage:

"${stage2AClaims}"

Your job is to CHALLENGE these claims. Look at the SAME images and determine whether the claimed damages are REAL or FALSE POSITIVES.

For EACH claimed damage, ask yourself:
1. Can I see a clear physical deformation that breaks the smooth factory contour?
2. Could this be explained by a reflection, shadow, lighting angle, or camera artifact?
3. Is there paint transfer, bare metal, cracked plastic, or a missing piece?
4. If I covered the "damaged" area with my hand and revealed it again, would I STILL see damage?

IMPORTANT: On painted surfaces (especially ${color || 'colored'} ones), reflections of nearby objects create dark/light patches that look EXACTLY like dents. Shadows from edges create lines that look like scratches. These are NOT damage.

If even ONE of the claimed damages could reasonably be a visual artifact rather than real damage, mark has_damage as false.

Answer with ONLY this JSON:
\`\`\`json
{
  "has_damage": true or false,
  "confidence": 0.0 to 1.0,
  "reasoning": "For each claimed damage, explain whether it is confirmed real or likely a false positive"
}
\`\`\``;
}

// Stage 2B: Full detailed damage detection (only called if Stage 2A confirms damage)
function buildStage2Prompt(stage1Result, vehicleInfo) {
  const vehicleLabel =
    describeVehicle(vehicleInfo) || describeVehicle(stage1Result?.vehicleDetails);
  const visibleAreas = stage1Result.visibleAreas || [];
  const areaMap = buildAreaToPartsMap();
  const damageDescriptionsRef = generateDamageDescriptionsReference();

  // Build visible-only part list
  let validPartsSection = 'VALID PARTS FOR VISIBLE AREAS:\n';
  visibleAreas.forEach(area => {
    const parts = areaMap[area];
    if (parts) {
      validPartsSection += `  ${area}: ${parts.join(', ')}\n`;
    }
  });

  return `You are a vehicle damage detection system analyzing images of a vehicle${vehicleLabel ? ` (${vehicleLabel})` : ''}.
Photo quality: ${stage1Result.photoQuality}

CRITICAL CONSTRAINT — READ CAREFULLY:
You may ONLY report damage on parts that belong to the following visible areas:
${JSON.stringify(visibleAreas)}

${validPartsSection}

If you detect damage on a part NOT listed above, you MUST discard it — that area is not visible.

DAMAGE DESCRIPTIONS REFERENCE:
${damageDescriptionsRef}

IMPORTANT — FALSE POSITIVE PREVENTION:
Many vehicles are in PERFECT condition with NO damage. Do NOT hallucinate or invent damage.
- If the vehicle appears clean and undamaged, return EMPTY arrays for "damages" and "needs_check_parts". This is the CORRECT and EXPECTED response for an undamaged vehicle.
- Do NOT confuse the following with actual damage:
  * Normal reflections, shadows, or lighting variations on paint
  * Factory panel gaps, body lines, or trim seams
  * Normal wear patterns (minor stone chips, road dust, dirt)
  * Camera artifacts, JPEG compression, or image noise
  * Dark areas caused by angles or lighting, not dents
  * Plastic trim texture or matte vs glossy surface transitions
- You MUST have clear, unambiguous visual evidence of ACTUAL physical damage before reporting it.
- When in doubt, do NOT report it. Err on the side of NOT reporting damage rather than over-reporting.
- A confidence of 0.70+ means you are CERTAIN the damage exists — reserve high confidence for obvious, unmistakable damage only.

DETECTION RULES:
1. Report ONLY damage you can SEE in the images — never guess or infer.
2. Parts with confidence >= 0.70 go in "damages".
3. Parts with confidence < 0.70 go in "needs_check_parts".
4. Use part names from the valid parts list above — use the EXACT snake_case key as written (e.g. "front_left_fender", "radiator_support").
5. NEVER combine two parts into one entry with a slash, "/", "and", or "&" (e.g. do NOT write "Front Rail / Apron" or "Roof Panel / Header Rail"). If two parts are damaged, emit TWO separate entries — one per part.
6. For paired parts (headlights, mirrors, doors), only report the SPECIFIC side that is damaged.
7. Cross-reference multiple images to confirm damage when possible.
8. If photo quality is "Retake needed", reduce all confidences by 0.15.
9. Do NOT report both upper and lower bumper unless BOTH are clearly damaged — pick the specific section.
10. If no damage is visible, return empty arrays — do NOT fabricate findings.

LEFT/RIGHT CRITICAL RULE:
- Always determine left/right from the DRIVER'S perspective sitting inside the car
- Driver left = viewer's right when looking at front of car
- Driver right = viewer's left when looking at front of car
- If you see damage on the right side of a front photo → that is front_left_fender or front_left_headlight (driver's left)
- Double-check every part name contains the correct _left or _right suffix before outputting
- When uncertain about side → describe in the description field which physical side you see it on

Return this exact JSON:
\`\`\`json
{
  "damages": [
    {
      "part_name": "exact part name from valid parts list",
      "damage_type": "Dent|Scratch|Crack|Broken|Missing|Deformation|Misalignment|Rust|Buckled|Puncture",
      "description": "specific visual evidence observed",
      "confidence": 0.85
    }
  ],
  "needs_check_parts": [
    {
      "part_name": "exact part name",
      "damage_type": "string",
      "description": "what you observed",
      "reason_for_uncertainty": "why confidence is low",
      "confidence": 0.50
    }
  ],
  "safety_flags": {
    "headlamp_broken": false,
    "windshield_cracked": false,
    "electrical_exposure": false,
    "airbag_deployment": false,
    "engine_bay_intrusion": false
  },
  "overall_confidence_score": 0.90,
  "summary": "brief damage summary or 'No damage detected' if vehicle appears undamaged"
}
\`\`\`

NOTE: For an undamaged vehicle the correct response is:
\`\`\`json
{
  "damages": [],
  "needs_check_parts": [],
  "safety_flags": { "headlamp_broken": false, "windshield_cracked": false, "electrical_exposure": false, "airbag_deployment": false, "engine_bay_intrusion": false },
  "overall_confidence_score": 0.95,
  "summary": "No damage detected — vehicle appears to be in good condition"
}
\`\`\``;
}

function buildStage3Prompt(stage1Result, stage2Result) {
  const vehicleDetails = stage1Result.vehicleDetails || {};
  const visibleAreas = stage1Result.visibleAreas || [];
  const damages = stage2Result.damages || [];
  const needsCheck = stage2Result.needs_check_parts || [];

  return `You are a vehicle structural damage assessment system.
Based ONLY on the confirmed damage report below, assess potential structural impact.

You do NOT have access to images — reason ONLY from the damage data provided.

Vehicle: ${vehicleDetails.year || '2021'} ${vehicleDetails.make || 'MG'} ${vehicleDetails.model || 'MG 5'}
Visible Areas: ${JSON.stringify(visibleAreas)}

Confirmed Damages:
${JSON.stringify(damages, null, 2)}

Suspected Damages (lower confidence):
${JSON.stringify(needsCheck, null, 2)}

RULES:
1. ONLY assess structural impact that logically follows from the damages listed above.
2. Do NOT invent new damages or assume damage beyond what is reported.
3. If no damage suggests structural concern, set "detected" to false with empty concerns array.
4. Be conservative — when in doubt, say no structural concern.
5. Focus on: frame alignment, structural integrity, crumple zones, pillar damage, subframe issues.

Return this exact JSON:
\`\`\`json
{
  "structuralDamage": {
    "detected": false,
    "concerns": [
      {
        "location": "affected structural area (e.g. front-left, rear)",
        "component": "structural component name (e.g. Front Rail, A-Pillar, Subframe)",
        "indicator": "what structural issue is suspected based on the damages",
        "riskLevel": "minor|moderate|severe"
      }
    ]
  }
}
\`\`\``;
}

function buildStage4Prompt(stage1Result, stage2Result) {
  const vehicleDetails = stage1Result.vehicleDetails || {};
  const visibleAreas = stage1Result.visibleAreas || [];
  const damages = stage2Result.damages || [];

  // Check if engine-area damage was found
  const engineAreaParts = ['hood', 'upper_bumper', 'lower_bumper', 'lower_grille',
    'grille', 'front_carrier', 'front_bumper_chassis_bar',
    'radiator', 'ac_condenser', 'engine_block',
    'front_impact_bar', 'radiator_support', 'headlight_mounting_brackets',
    'cooling_system', 'front_left_chassis_rail',
    // Legacy aliases
    'condenser', 'front_bumper', 'upper_bumper_front', 'lower_bumper_front', 'fr_carrier'];
  const hasEngineAreaDamage = damages.some(d => {
    const normalized = (d.part_name || '').toLowerCase().replace(/\s+/g, '_');
    return engineAreaParts.some(ep => normalized.includes(ep) || ep.includes(normalized));
  });

  const engineSection = hasEngineAreaDamage
    ? `ENGINE ASSESSMENT:
Since damage was detected in the engine area, provide an engine risk assessment.
Assess based on the severity and location of front-end damage.
Use engine_status: "AT_RISK" or "DAMAGED" only if severe front-end impact is present.
Confidence MUST be <= 0.6.`
    : `ENGINE ASSESSMENT:
No engine-area damage was detected. You MUST set engine_status to "NOT_VISIBLE".
Do NOT speculate about engine condition when no front-end damage exists.`;

  return `You are a hidden damage inference system for insurance assessment.
Based ONLY on the confirmed damage report below, infer what hidden damage MIGHT exist behind visible damage.

You do NOT have access to images — reason ONLY from the damage data provided.

Vehicle: ${vehicleDetails.year || '2021'} ${vehicleDetails.make || 'MG'} ${vehicleDetails.model || 'MG 5'}
Visible Areas: ${JSON.stringify(visibleAreas)}

Confirmed Damages:
${JSON.stringify(damages, null, 2)}

RULES:
1. ONLY infer hidden damage that logically follows from the confirmed visible damages above.
2. ALL confidence values MUST be <= 0.6 — these are inferences, not observations.
3. EVERY item MUST have "requires_inspection": true.
4. Be conservative — only infer when there is strong mechanical/physical reasoning.
5. Do NOT repeat damages already listed above — only ADD new hidden possibilities.
6. Maximum 5 hidden damage items.
7. ONE PART PER ITEM — "suspected_hidden_part" MUST contain exactly ONE taxonomy part name.
   - DO NOT combine multiple parts with "and", "/", "&", "+", or commas.
   - ❌ INVALID: "radiator and ac condenser", "radiator/condenser", "cooling stack"
   - ✅ VALID: emit TWO separate items, one with "radiator" and one with "ac_condenser".
   - The same rule applies to "visible_damage_part".
8. "suspected_hidden_part" MUST be an exact taxonomy part name (snake_case or the names from the PART TAXONOMY). No aliases, no free-text grouping nouns ("cooling stack", "front-end assembly", etc.).

${engineSection}

Return this exact JSON:
\`\`\`json
{
  "hiddenDamageAssessment": [
    {
      "visible_damage_part": "which confirmed damage triggers this inference",
      "suspected_hidden_part": "hidden part name that may be damaged",
      "hidden_indicator": "what hidden damage is suspected and why",
      "confidence": 0.45,
      "requires_inspection": true
    }
  ],
  "engineAssessment": {
    "engine_status": "NOT_VISIBLE",
    "concerns": [],
    "confidence": 0.0
  }
}
\`\`\``;
}

// --- Stage Runners ---

async function runStage1(images, vehicleInfo, imageViews, imageAngles) {
  console.log('\n' + '='.repeat(60));
  console.log('--- STAGE 1: Image Quality + Vehicle Identification ---');
  console.log('='.repeat(60));

  const prompt = buildStage1Prompt(vehicleInfo, images.length);

  // Single-pass optimization: Enhanced prompt guides comprehensive area detection
  const content = await callGeminiWithImages(prompt, images, imageViews, imageAngles);
  const result = parseStageJSON(content, 'Stage 1');

  console.log(`  visibleAreas: [${(result.visibleAreas || []).join(', ')}]`);
  console.log(`  isVehicle: ${result.isVehicle}`);
  console.log(`  photoQuality: ${result.photoQuality}`);
  console.log(`  vehicle: ${result.vehicleDetails?.year} ${result.vehicleDetails?.make} ${result.vehicleDetails?.model} (${result.vehicleDetails?.color})`);

  appendLog('STAGE 1 - Image Quality + Vehicle Identification');
  appendLog(`  visibleAreas: [${(result.visibleAreas || []).join(', ')}]`);
  appendLogJSON('Stage 1 Result', result);

  if (!result.isVehicle) {
    throw new Error('The provided images do not appear to show a vehicle. Please upload vehicle images.');
  }

  if (!result.visibleAreas || result.visibleAreas.length === 0) {
    throw new Error('Could not identify any visible vehicle areas in the images. Please upload clearer images.');
  }

  return result;
}

async function runStage2(images, vehicleInfo, stage1Result, imageViews, imageAngles) {
  console.log('\n' + '='.repeat(60));
  console.log('--- STAGE 2: Visible Damage Detection ---');
  console.log('='.repeat(60));

  // --- Stage 2A: Pre-check for any damage ---
  console.log('  [Stage 2A] Running damage pre-check (unbiased)...');
  appendLog('STAGE 2A - Damage Pre-Check');
  const preCheckPrompt = buildStage2APrompt(stage1Result, vehicleInfo);
  const preCheckContent = await callGeminiWithImages(preCheckPrompt, images, imageViews, imageAngles);
  const preCheckResult = parseStageJSON(preCheckContent, 'Stage 2A');

  const hasDamage = preCheckResult.has_damage === true;
  const preCheckConfidence = preCheckResult.confidence || 0;
  const preCheckReasoning = preCheckResult.reasoning || '';

  console.log(`  [Stage 2A] has_damage: ${hasDamage}, confidence: ${preCheckConfidence}`);
  console.log(`  [Stage 2A] reasoning: ${preCheckReasoning}`);
  appendLog(`  Pre-check result: has_damage=${hasDamage}, confidence=${preCheckConfidence}`);
  appendLog(`  Pre-check reasoning: ${preCheckReasoning}`);
  appendLogJSON('Stage 2A Result', preCheckResult);

  // If pre-check says NO damage, skip the full scan
  if (!hasDamage) {
    console.log('  [Stage 2A] No damage detected — skipping full scan');
    appendLog('  Pre-check: No damage detected — skipping Stage 2B full scan');

    const emptyResult = {
      damages: [],
      needs_check_parts: [],
      safety_flags: {
        headlamp_broken: false,
        windshield_cracked: false,
        electrical_exposure: false,
        airbag_deployment: false,
        engine_bay_intrusion: false
      },
      overall_confidence_score: preCheckConfidence,
      summary: 'Pre-check determined no visible damage on the vehicle.'
    };

    appendLog('STAGE 2 - Visible Damage Detection');
    appendLog('  Confirmed damages: 0');
    appendLog('  Needs check: 0');
    appendLogJSON('Stage 2 Result', emptyResult);

    return emptyResult;
  }

  // --- Stage 2A-Verify & 2B: Run in parallel for performance ---
  // Stage 2A-Verify: Counter-check the pre-check claims
  // Stage 2B: Full detailed damage scan (prepared in parallel)
  console.log('  [Stage 2A-Verify] Pre-check claimed damage — running verification + full scan in parallel...');
  appendLog('STAGE 2A-Verify - Counter-Check (parallelized with 2B)');

  const verifyPrompt = buildStage2AVerifyPrompt(preCheckReasoning, vehicleInfo, stage1Result);
  const stage2bPrompt = buildStage2Prompt(stage1Result, vehicleInfo);

  // Run sequentially (parallelization causes fetch failures with multiple large images)
  console.log('  [Stage 2A-Verify] Running verification...');
  const verifyContent = await callGeminiWithImages(verifyPrompt, images, imageViews, imageAngles);
  const verifyResult = parseStageJSON(verifyContent, 'Stage 2A-Verify');

  const verifiedDamage = verifyResult.has_damage === true;
  const verifyConfidence = verifyResult.confidence || 0;
  const verifyReasoning = verifyResult.reasoning || '';

  console.log(`  [Stage 2A-Verify] has_damage: ${verifiedDamage}, confidence: ${verifyConfidence}`);
  console.log(`  [Stage 2A-Verify] reasoning: ${verifyReasoning}`);
  appendLog(`  Verify result: has_damage=${verifiedDamage}, confidence=${verifyConfidence}`);
  appendLog(`  Verify reasoning: ${verifyReasoning}`);
  appendLogJSON('Stage 2A-Verify Result', verifyResult);

  // If verification says NO damage — the pre-check was a false positive
  if (!verifiedDamage) {
    console.log('  [Stage 2A-Verify] Verification REJECTED pre-check claims — no real damage');
    appendLog('  Verification rejected pre-check claims — skipping Stage 2B');

    const emptyResult = {
      damages: [],
      needs_check_parts: [],
      safety_flags: {
        headlamp_broken: false,
        windshield_cracked: false,
        electrical_exposure: false,
        airbag_deployment: false,
        engine_bay_intrusion: false
      },
      overall_confidence_score: verifyConfidence,
      summary: 'Verification determined the initial damage claims were false positives (reflections/shadows).'
    };

    appendLog('STAGE 2 - Visible Damage Detection');
    appendLog('  Confirmed damages: 0 (false positives rejected by verification)');
    appendLog('  Needs check: 0');
    appendLogJSON('Stage 2 Result', emptyResult);

    return emptyResult;
  }

  console.log('  [Stage 2B] Running full damage scan...');
  const stage2bContent = await callGeminiWithImages(stage2bPrompt, images, imageViews, imageAngles);
  const result = parseStageJSON(stage2bContent, 'Stage 2');

  console.log('  [Stage 2A-Verify] Verification CONFIRMED damage — using Stage 2B results');
  appendLog('STAGE 2B - Full Damage Scan (sequential execution)');

  console.log('  [Stage 2A-Verify] Verification CONFIRMED damage — using parallel Stage 2B results');
  appendLog('STAGE 2B - Full Damage Scan (results from parallel execution)');

  // Fan out combined part names ("radiator and ac condenser") into separate items.
  const expandCombined = (arr, label) => (arr || []).flatMap(item => {
    const parts = splitCombinedPartName(item.part_name);
    if (parts.length > 1) {
      console.log(`  [Stage2 SPLIT ${label}] "${item.part_name}" → [${parts.join(', ')}]`);
    }
    return parts.map(p => ({ ...item, part_name: p }));
  });
  result.damages = expandCombined(result.damages, 'damages');
  result.needs_check_parts = expandCombined(result.needs_check_parts, 'needs_check');

  // --- Anti-hallucination filter ---
  const areaMap = buildAreaToPartsMap();
  const visibleAreas = stage1Result.visibleAreas || [];

  // Build set of all valid parts (normalized) from visible areas
  const validPartsSet = new Set();
  visibleAreas.forEach(area => {
    const parts = areaMap[area] || [];
    parts.forEach(p => validPartsSet.add(p.toLowerCase().replace(/\s+/g, '_')));
  });

  // Check if a part name belongs to any visible area
  function isPartVisible(partName) {
    if (!partName) return false;
    const normalized = partName.toLowerCase().trim().replace(/\s+/g, '_');

    // Direct match
    if (validPartsSet.has(normalized)) return true;

    // Fuzzy: check containment both ways
    for (const validPart of validPartsSet) {
      if (normalized.includes(validPart) || validPart.includes(normalized)) return true;
    }

    return false;
  }

  // Helper to check if a part is safety-critical (airbags, seatbelts, etc)
  function isSafetyPart(partName) {
    if (!partName) return false;
    const lower = partName.toLowerCase().trim();
    return lower.includes('airbag') || lower.includes('seatbelt') ||
           lower.includes('pretension') || lower.includes('impact_sensor');
  }

  // Filter damages
  const originalDamageCount = (result.damages || []).length;
  result.damages = (result.damages || []).filter(d => {
    // Safety parts always pass through anti-hallucination filter
    if (isSafetyPart(d.part_name)) {
      console.log(`  [Stage2 FILTER] Kept safety-critical part: "${d.part_name}" (${d.damage_type}) — bypassed visibility check`);
      return true;
    }
    if (isPartVisible(d.part_name)) return true;
    console.log(`  [Stage2 FILTER] Removed hallucinated damage: "${d.part_name}" (${d.damage_type}) — not in visible areas`);
    return false;
  });

  // Filter needs_check_parts
  const originalNeedsCheckCount = (result.needs_check_parts || []).length;
  result.needs_check_parts = (result.needs_check_parts || []).filter(d => {
    // Safety parts always pass through anti-hallucination filter
    if (isSafetyPart(d.part_name)) {
      console.log(`  [Stage2 FILTER] Kept safety-critical needs_check: "${d.part_name}" — bypassed visibility check`);
      return true;
    }
    if (isPartVisible(d.part_name)) return true;
    console.log(`  [Stage2 FILTER] Removed hallucinated needs_check: "${d.part_name}" — not in visible areas`);
    return false;
  });

  const removedCount = (originalDamageCount - result.damages.length) +
    (originalNeedsCheckCount - result.needs_check_parts.length);
  if (removedCount > 0) {
    console.log(`  [Stage2 FILTER] Removed ${removedCount} hallucinated items total`);
    appendLog(`  [Stage2 FILTER] Removed ${removedCount} hallucinated items`);
  }

  // --- Trim part damage type correction ---
  // Trims are clip-on plastic/chrome pieces. When damaged they are broken/cracked/missing,
  // NOT "misaligned". Reclassify misalignment on trim parts to "Broken".
  function isTrimPart(partName) {
    if (!partName) return false;
    const lower = partName.toLowerCase();
    return lower.includes('trim') || lower.includes('fogtrim') || lower.includes('molding');
  }
  function correctTrimDamageType(item) {
    if (isTrimPart(item.part_name)) {
      const lowerType = (item.damage_type || '').toLowerCase();
      if (lowerType === 'misaligned' || lowerType === 'misalignment') {
        console.log(`  [Stage2 TRIM FIX] Reclassified "${item.part_name}" from "${item.damage_type}" → "Broken"`);
        item.damage_type = 'Broken';
      }
    }
    return item;
  }
  result.damages = (result.damages || []).map(correctTrimDamageType);
  result.needs_check_parts = (result.needs_check_parts || []).map(correctTrimDamageType);

  console.log(`  Confirmed damages: ${result.damages.length}`);
  console.log(`  Needs check: ${(result.needs_check_parts || []).length}`);
  console.log(`  Safety flags: ${JSON.stringify(result.safety_flags || {})}`);

  appendLog('STAGE 2 - Visible Damage Detection');
  appendLog(`  Confirmed damages: ${result.damages.length}`);
  appendLog(`  Needs check: ${(result.needs_check_parts || []).length}`);
  appendLogJSON('Stage 2 Result', result);

  return result;
}

async function runStage3(stage1Result, stage2Result) {
  console.log('\n' + '='.repeat(60));
  console.log('--- STAGE 3: Structural Assessment (text-only) ---');
  console.log('='.repeat(60));

  try {
    const prompt = buildStage3Prompt(stage1Result, stage2Result);
    const content = await callGeminiTextOnly(prompt);
    const result = parseStageJSON(content, 'Stage 3');

    const structural = result.structuralDamage || { detected: false, concerns: [] };
    console.log(`  Structural damage detected: ${structural.detected}`);
    console.log(`  Concerns: ${(structural.concerns || []).length}`);

    appendLog('STAGE 3 - Structural Assessment');
    appendLogJSON('Stage 3 Result', structural);

    return structural;
  } catch (error) {
    console.error(`  Stage 3 FAILED (non-fatal): ${error.message}`);
    console.log('  Using safe defaults: no structural damage');
    return { detected: false, concerns: [] };
  }
}

// Split a part-name string that the model combined into one field.
// "radiator and ac condenser" → ["radiator", "ac condenser"]
// "radiator / condenser, intercooler" → ["radiator", "condenser", "intercooler"]
// Returns the original as a single-element array if no splitter is found.
function splitCombinedPartName(raw) {
  if (!raw || typeof raw !== 'string') return [raw];
  const cleaned = raw
    .replace(/\b(?:and|&|\+|\/|,| plus )\b/gi, '|')
    .replace(/[\/&+,]/g, '|');
  const parts = cleaned
    .split('|')
    .map(s => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [raw];
}

async function runStage4(stage1Result, stage2Result) {
  console.log('\n' + '='.repeat(60));
  console.log('--- STAGE 4: Hidden Damage Inference (text-only) ---');
  console.log('='.repeat(60));

  try {
    const prompt = buildStage4Prompt(stage1Result, stage2Result);
    const content = await callGeminiTextOnly(prompt);
    const result = parseStageJSON(content, 'Stage 4');

    // Fan out combined part names ("radiator and ac condenser") into separate items
    // so each part maps cleanly to the taxonomy downstream.
    const rawHidden = result.hiddenDamageAssessment || [];
    const expandedHidden = [];
    rawHidden.forEach(item => {
      const parts = splitCombinedPartName(item.suspected_hidden_part);
      if (parts.length > 1) {
        console.log(`  [Stage4 SPLIT] "${item.suspected_hidden_part}" → [${parts.join(', ')}]`);
      }
      parts.forEach(p => expandedHidden.push({ ...item, suspected_hidden_part: p }));
    });

    // Auto-cap confidence at 60% for all hidden damage items
    const hiddenDamage = expandedHidden.map(item => ({
      ...item,
      confidence: Math.min(item.confidence || 0, 0.6),
      requires_inspection: true
    }));

    // Auto-cap engine assessment confidence
    const engine = result.engineAssessment || { engine_status: 'NOT_VISIBLE', concerns: [], confidence: 0 };
    engine.confidence = Math.min(engine.confidence || 0, 0.6);

    console.log(`  Hidden damage items: ${hiddenDamage.length}`);
    console.log(`  Engine status: ${engine.engine_status}`);

    appendLog('STAGE 4 - Hidden Damage Inference');
    appendLogJSON('Stage 4 Result', { hiddenDamageAssessment: hiddenDamage, engineAssessment: engine });

    return { hiddenDamageAssessment: hiddenDamage, engineAssessment: engine };
  } catch (error) {
    console.error(`  Stage 4 FAILED (non-fatal): ${error.message}`);
    console.log('  Using safe defaults: no hidden damage, engine NOT_VISIBLE');
    return {
      hiddenDamageAssessment: [],
      engineAssessment: { engine_status: 'NOT_VISIBLE', concerns: [], confidence: 0 }
    };
  }
}

// --- Pipeline Orchestrator ---

function combineStageResults(stage1, stage2, stage3, stage4) {
  const confirmedDamages = stage2.damages || [];
  const needsCheckParts = stage2.needs_check_parts || [];
  const safetyFlags = stage2.safety_flags || {};
  const vehicleDetails = stage1.vehicleDetails || {};

  // Convert safety_flags object to array
  const safetyConcerns = [];
  if (safetyFlags.headlamp_broken) safetyConcerns.push('Headlamp broken');
  if (safetyFlags.windshield_cracked) safetyConcerns.push('Windshield cracked');
  if (safetyFlags.electrical_exposure) safetyConcerns.push('Electrical exposure');
  if (safetyFlags.airbag_deployment) safetyConcerns.push('Airbag deployment');
  if (safetyFlags.engine_bay_intrusion) safetyConcerns.push('Engine bay intrusion');

  // Convert confirmed damages to unified format (confidence 0-1 → 0-100)
  let damages = confirmedDamages.map(part => ({
    partName: part.part_name,
    damageType: part.damage_type,
    description: part.description || part.damage_type,
    indicators: part.description ? [part.description] : [],
    severityLevel: 'moderate',
    severityDescription: '',
    confidence: Math.round((part.confidence || 0.85) * 100),
    location: 'detected',
    visualEvidence: part.description || '',
    recommendedDecision: 'repair',
    safetyFlags: [],
    evidenceImages: [],
    crossReferenceNotes: '',
    hiddenDamageIndicators: []
  }));

  // Add needs_check_parts as damages with lower confidence
  const needsCheckDamages = needsCheckParts.map(part => ({
    partName: part.part_name,
    damageType: part.damage_type,
    description: part.description || part.damage_type,
    indicators: part.description ? [part.description] : [],
    severityLevel: 'minor',
    severityDescription: part.reason_for_uncertainty || '',
    confidence: Math.round((part.confidence || 0.5) * 100),
    location: 'detected',
    visualEvidence: part.description || '',
    recommendedDecision: 'inspect',
    safetyFlags: [],
    evidenceImages: [],
    crossReferenceNotes: part.reason_for_uncertainty || '',
    hiddenDamageIndicators: []
  }));

  damages = [...damages, ...needsCheckDamages];

  // Safety flags conversion - always add airbag deployments as damages
  if (safetyFlags.airbag_deployment) {
    console.log('🎯 Converting airbag_deployment safety flag to damage item');
    damages.push({
      partName: 'airbag_module', damageType: 'deployed',
      description: 'Airbag deployment detected from safety assessment',
      indicators: ['Airbag system deployed'], severityLevel: 'high',
      confidence: 90, location: 'interior', visualEvidence: 'Airbag deployment flag'
    });
  }

  // Safety flags vs damages validation (same logic as legacy parseAIResponse)
  if (safetyConcerns.length > 0 && damages.length === 0) {
    console.warn('⚠️ INCONSISTENCY: Safety flags exist but no damages listed!');
    if (safetyFlags.headlamp_broken) {
      damages.push({
        partName: 'front_right_headlight', damageType: 'broken',
        description: 'Headlight damage detected from safety assessment',
        indicators: ['Headlight damage detected'], severityLevel: 'moderate',
        confidence: 85, location: 'front', visualEvidence: 'Headlamp broken flag'
      });
    }
    if (safetyFlags.windshield_cracked) {
      damages.push({
        partName: 'front_windshield', damageType: 'crack',
        description: 'Windshield crack detected from safety assessment',
        indicators: ['Windshield crack detected'], severityLevel: 'high-moderate',
        confidence: 85, location: 'front', visualEvidence: 'Windshield cracked flag'
      });
    }
    if (damages.length > 0) {
      console.log(`  Reconstructed ${damages.length} damages from safety flags`);
    }
  }

  // Convert structural concerns into proper damage items so they flow through
  // enrichDamageData() and get nameEn/nameAr + severityDecision like all other parts
  const structuralRaw = stage3 || { detected: false, concerns: [] };
  if (structuralRaw.detected && structuralRaw.concerns?.length > 0) {
    const structuralDamages = structuralRaw.concerns.map(c => {
      const component = c.component || c.description || '';
      const location = c.location || c.area || '';
      const indicator = c.indicator || c.description || 'Structural concern';
      const riskLevel = c.riskLevel || c.severity || 'moderate';

      // Resolve component to a PARTS_DATABASE key using location context
      const partKey = resolveStructuralPartKey(component, location);
      // Extract damage type from indicator text for severity decision mapping
      const damageType = extractStructuralDamageType(indicator, riskLevel);

      return {
        partName: partKey || component,
        damageType: damageType,
        description: `Structural: ${indicator}`,
        indicators: [indicator],
        severityLevel: riskLevel === 'severe' ? 'severe' : 'moderate',
        confidence: 90,
        location: location || 'detected',
        visualEvidence: indicator,
        isStructuralConcern: true,
        hiddenDamageIndicators: []
      };
    });
    damages = [...damages, ...structuralDamages];
    console.log(`  Converted ${structuralDamages.length} structural concerns to damage items`);
  }

  // Structural concerns are now part of the damages array — clear to avoid duplicate display
  const structuralDamage = { detected: false, concerns: [] };

  // Map hidden damage to frontend HiddenDamageItem interface
  // Frontend expects: { visible_damage_part, suspected_hidden_part, hidden_indicator, confidence, requires_inspection, nameEn, nameAr }
  const hiddenDamageAssessment = (stage4.hiddenDamageAssessment || []).map(item => {
    const suspected = item.suspected_hidden_part || item.part_name || '';
    const partKey = normalizePartName(suspected);
    const partInfo = PARTS_DATABASE[partKey];
    return {
      visible_damage_part: item.visible_damage_part || item.reasoning || item.part_name || '',
      suspected_hidden_part: suspected,
      hidden_indicator: item.hidden_indicator || item.description || '',
      confidence: Math.round((item.confidence || 0) * 100),
      requires_inspection: true,
      nameEn: partInfo?.nameEn || suspected.replace(/_/g, ' '),
      nameAr: partInfo?.nameAr || ''
    };
  });

  const overallConfidence = stage2.overall_confidence_score
    ? Math.round(stage2.overall_confidence_score * 100)
    : 75;

  return {
    photoQuality: stage1.photoQuality === 'Retake needed' ? 'poor' : 'good',
    imagesAnalyzed: stage1.imageCount || 1,
    imageDescriptions: [],
    damages: damages,
    safetyConcerns: safetyConcerns,
    engineAssessment: stage4.engineAssessment || {},
    regionInspection: [],
    coverageAssessment: {},
    hiddenDamageAssessment: hiddenDamageAssessment,
    structuralDamage: structuralDamage,
    overallConfidence: overallConfidence,
    vehicleDetails: vehicleDetails,
    summary: stage2.summary || ''
  };
}

// ============================================================================
// IMAGE DEDUPLICATION
// ============================================================================
function deduplicateImages(images, imageViews, imageAngles) {
  if (!images || images.length === 0) {
    return { images: [], imageViews: [], imageAngles: [] };
  }

  // Step 1: Deduplicate by content hash (first + last 500 chars of base64)
  const seenHashes = new Set();
  const afterContentDedup = [];
  const afterContentDedupViews = [];
  const afterContentDedupAngles = [];

  images.forEach((img, idx) => {
    const base64 = img.includes(',') ? img.split(',')[1] : img;
    // Fast fingerprint: first + last 500 chars
    const fingerprint = base64.length > 1000
      ? base64.substring(0, 500) + base64.slice(-500)
      : base64;
    const hash = crypto.createHash('sha256').update(fingerprint).digest('hex');

    if (!seenHashes.has(hash)) {
      seenHashes.add(hash);
      afterContentDedup.push(img);
      afterContentDedupViews.push(imageViews?.[idx] || null);
      afterContentDedupAngles.push(imageAngles?.[idx] || null);
    } else {
      console.log(`   🔄 Duplicate removed (same content hash)`);
    }
  });

  // Step 2: Deduplicate by view - keep max 2 per view, keep most recent
  const viewCounts = {};
  const viewIndices = {};
  const afterViewDedup = [];
  const afterViewDedupViews = [];
  const afterViewDedupAngles = [];

  afterContentDedup.forEach((img, idx) => {
    const view = afterContentDedupViews[idx];
    if (!view) {
      // No view specified, always keep it
      afterViewDedup.push(img);
      afterViewDedupViews.push(view);
      afterViewDedupAngles.push(afterContentDedupAngles[idx]);
    } else {
      if (!viewCounts[view]) {
        viewCounts[view] = 0;
        viewIndices[view] = [];
      }
      viewIndices[view].push(idx);
      viewCounts[view]++;

      // Keep only the 2 most recent (last 2 indices)
      if (viewCounts[view] <= 2) {
        afterViewDedup.push(img);
        afterViewDedupViews.push(view);
        afterViewDedupAngles.push(afterContentDedupAngles[idx]);
      } else {
        console.log(`   🔄 Duplicate view removed (${view} - keeping only 2 per view)`);
      }
    }
  });

  const duplicatesRemoved = images.length - afterViewDedup.length;
  if (duplicatesRemoved > 0) {
    console.log(`\n✂️  IMAGE DEDUPLICATION COMPLETE:`);
    console.log(`   Original: ${images.length} images`);
    console.log(`   After dedup: ${afterViewDedup.length} images`);
    console.log(`   Removed: ${duplicatesRemoved} duplicates\n`);
  }

  return {
    images: afterViewDedup,
    imageViews: afterViewDedupViews,
    imageAngles: afterViewDedupAngles
  };
}

async function runAnalysisPipeline(images, vehicleInfo, imageViews, imageAngles) {
  console.log('\n' + '='.repeat(80));
  console.log('🔄 STARTING 4-STAGE ANALYSIS PIPELINE');
  console.log('='.repeat(80));
  if (Array.isArray(imageViews) && imageViews.length === images.length) {
    console.log(`🏷  View labels: ${imageViews.map((v, i) => `${i + 1}=${v}`).join(', ')}`);
    appendLog(`Image view labels: ${imageViews.map((v, i) => `${i + 1}=${v}`).join(', ')}`);
  }
  if (Array.isArray(imageAngles) && imageAngles.length === images.length) {
    console.log(`🔍 Image angles: ${imageAngles.map((a, i) => `${i + 1}=${a}`).join(', ')}`);
    appendLog(`Image angles: ${imageAngles.map((a, i) => `${i + 1}=${a}`).join(', ')}`);
  }

  // Compress images before analysis
  let imagesToAnalyze = images;
  try {
    const compressedImages = await compressImages(images, 75, 1920);
    imagesToAnalyze = compressedImages;
    appendLog('Images compressed before analysis');
  } catch (error) {
    console.log(`⚠️  Image compression error: ${error.message}, using original images`);
    appendLog(`Compression failed, using original images`);
  }

  // Stage 1: Image Quality + Vehicle ID (FATAL on failure)
  const stage1Result = await runStage1(imagesToAnalyze, vehicleInfo, imageViews, imageAngles);

  // Stage 2: Visible Damage Detection (FATAL on failure)
  const stage2Result = await runStage2(imagesToAnalyze, vehicleInfo, stage1Result, imageViews, imageAngles);

  // Short-circuit: if Stage 2 found NO damage at all, skip Stages 3 & 4
  // This prevents phantom structural/hidden damage on clean vehicles
  const hasDamage = (stage2Result.damages && stage2Result.damages.length > 0) ||
                    (stage2Result.needs_check_parts && stage2Result.needs_check_parts.length > 0);

  let stage3Result, stage4Result;
  if (!hasDamage) {
    console.log('\n  ✅ No damage detected in Stage 2 — skipping Stages 3 & 4');
    stage3Result = { detected: false, concerns: [] };
    stage4Result = {
      hiddenDamageAssessment: [],
      engineAssessment: { engine_status: 'NOT_VISIBLE', concerns: [], confidence: 0 }
    };
  } else {
    // Stages 3 & 4: Run in parallel (NON-FATAL — each has its own try/catch)
    [stage3Result, stage4Result] = await Promise.all([
      runStage3(stage1Result, stage2Result),
      runStage4(stage1Result, stage2Result)
    ]);
  }

  // Combine all stage results into rawAnalysis format
  const rawAnalysis = combineStageResults(stage1Result, stage2Result, stage3Result, stage4Result);

  console.log('\n' + '='.repeat(60));
  console.log('✅ PIPELINE COMPLETE');
  console.log(`  Damages: ${rawAnalysis.damages.length}`);
  console.log(`  Safety concerns: ${rawAnalysis.safetyConcerns.length}`);
  console.log(`  Structural: ${rawAnalysis.structuralDamage.detected}`);
  console.log(`  Hidden damage items: ${rawAnalysis.hiddenDamageAssessment.length}`);
  console.log(`  Engine: ${rawAnalysis.engineAssessment.engine_status || 'N/A'}`);
  console.log('='.repeat(60));

  return rawAnalysis;
}

// ============================================================================
// UTILITIES
// ============================================================================
function validateImageInput(images) {
  if (!images || !Array.isArray(images)) {
    throw new Error('Images must be provided as an array. Send { "images": [...] } in request body.');
  }
  
  if (images.length < 1) {
    throw new Error('At least 1 image is required');
  }
  
  if (images.length === 1) {
    console.log('⚠️  WARNING: Only 1 image provided. For best results, upload 2-15 images from different angles.');
  }
  
  if (images.length > CONFIG.MAX_IMAGES) {
    throw new Error(`Maximum ${CONFIG.MAX_IMAGES} images allowed. Provided: ${images.length}`);
  }
  
  // Validate each image
  images.forEach((img, index) => {
    if (!img) {
      throw new Error(`Image ${index + 1} is empty or invalid`);
    }

    // Accept multiple base64 formats:
    // - data:image/... (data URL)
    // - /9j/... (JPEG marker in base64)
    // - iVBORw0KGgo... (PNG marker in base64)
    // - /8w= (WebP marker in base64)
    const isDataUrl = img.startsWith('data:image/');
    const isJpegBase64 = img.startsWith('/9j/');
    const isPngBase64 = img.startsWith('iVBORw0KGgo');
    const isWebpBase64 = img.startsWith('/8w');

    if (!isDataUrl && !isJpegBase64 && !isPngBase64 && !isWebpBase64) {
      // Try to validate as generic base64 (allow if it decodes without error)
      try {
        Buffer.from(img, 'base64');
      } catch (e) {
        throw new Error(`Image ${index + 1} has invalid format. Must be base64-encoded image.`);
      }
    }
  });
  
  return true;
}

function parseImageData(imageBase64) {
  let imageData = imageBase64;
  let mimeType = 'image/jpeg';

  if (imageBase64.startsWith('data:')) {
    const matches = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
    if (matches) {
      mimeType = matches[1];
      imageData = matches[2];
    }
  }

  return { mimeType, imageData };
}

async function compressImage(imageBase64, quality = 75, maxWidth = 1920) {
  try {
    const { mimeType, imageData } = parseImageData(imageBase64);
    const buffer = Buffer.from(imageData, 'base64');

    let compressed = sharp(buffer);

    // Resize if width > maxWidth
    const metadata = await compressed.metadata();
    if (metadata.width > maxWidth) {
      compressed = compressed.resize(maxWidth, null, { withoutEnlargement: true });
    }

    // Compress based on format
    if (mimeType.includes('png')) {
      compressed = compressed.png({ compressionLevel: 9, progressive: true });
    } else {
      compressed = compressed.jpeg({ quality, progressive: true });
    }

    const compressedBuffer = await compressed.toBuffer();
    const compressedBase64 = compressedBuffer.toString('base64');

    return imageBase64.startsWith('data:')
      ? `data:${mimeType};base64,${compressedBase64}`
      : compressedBase64;
  } catch (error) {
    console.log(`  ⚠️  Image compression failed: ${error.message}, using original`);
    return imageBase64;
  }
}

async function compressImages(images, quality = 75, maxWidth = 1920) {
  const originalSize = images.reduce((sum, img) => sum + img.length, 0);

  const compressed = await Promise.all(
    images.map(img => compressImage(img, quality, maxWidth))
  );

  const compressedSize = compressed.reduce((sum, img) => sum + img.length, 0);
  const reduction = Math.round(((originalSize - compressedSize) / originalSize) * 100);

  console.log(`\n📦 IMAGE COMPRESSION COMPLETE:`);
  console.log(`   Original size: ${(originalSize / 1024 / 1024).toFixed(2)}MB`);
  console.log(`   Compressed size: ${(compressedSize / 1024 / 1024).toFixed(2)}MB`);
  console.log(`   Reduction: ${reduction}%\n`);

  return compressed;
}

// Old-to-new key alias map for backward compatibility with legacy Gemini outputs
const PART_NAME_ALIASES = {
  // Old headlight naming → new taxonomy
  'headlight_left': 'front_left_headlight',
  'headlight_right': 'front_right_headlight',
  'fr_right_headlight': 'front_right_headlight',
  'fr_left_headlight': 'front_left_headlight',
  // Windshield
  'windshield': 'front_windshield',
  // Bumpers
  'front_bumper': 'upper_bumper',
  'upper_bumper_front': 'upper_bumper',
  'lower_bumper_front': 'lower_bumper',
  'rear_bumper': 'rear_bumper_upper',
  'rear_lower_bumper': 'rear_bumper_lower',
  // Fenders (word order swap)
  'front_fender_left': 'front_left_fender',
  'front_fender_right': 'front_right_fender',
  'fl_fender': 'front_left_fender',
  'fr_fender': 'front_right_fender',
  // Doors (word order swap)
  'front_door_left': 'front_left_door',
  'front_door_right': 'front_right_door',
  'rear_door_left': 'rear_left_door',
  'rear_door_right': 'rear_right_door',
  'fl_door': 'front_left_door',
  'fr_door': 'front_right_door',
  'rl_door': 'rear_left_door',
  'rr_door': 'rear_right_door',
  // Mirrors
  'side_mirror_left': 'left_mirror',
  'side_mirror_right': 'right_mirror',
  'left_side_mirror': 'left_mirror',
  'right_side_mirror': 'right_mirror',
  // Taillights → rear headlights
  'taillight_left': 'rear_left_headlight_outer',
  'taillight_right': 'rear_right_headlight_outer',
  'rl_headlight_inner': 'rear_left_headlight_inner',
  'rr_headlight_inner': 'rear_right_headlight_inner',
  'rl_headlight_outer': 'rear_left_headlight_outer',
  'rr_headlight_outer': 'rear_right_headlight_outer',
  // Trunk
  'trunk': 'trunk_door',
  'trunk_lid': 'trunk_door',
  // Quarter panels
  'quarter_panel_left': 'left_quarter_panel',
  'quarter_panel_right': 'rear_right_quarter_panel',
  'left_quarterpanel': 'left_quarter_panel',
  'rear_right_quarterpanel': 'rear_right_quarter_panel',
  'right_quarter_panel': 'rear_right_quarter_panel',
  // Rocker panels
  'rocker_panel_left': 'left_rocker_panel',
  'rocker_panel_right': 'right_rocker_panel',
  'left_rockerpanel': 'left_rocker_panel',
  'right_rockerpanel': 'right_rocker_panel',
  'l_rockerpanel': 'left_rocker_panel',
  'r_rockerpanel': 'right_rocker_panel',
  // Pillars
  'a_pillar_left': 'a_pillars',
  'a_pillar_right': 'a_pillars',
  'a-pillars': 'a_pillars',
  'b_pillar_left': 'b_pillar',
  'b_pillar_right': 'b_pillar',
  'left_b_pillar': 'b_pillar',
  'right_b_pillar': 'b_pillar',
  'c_pillar_left': 'c_pillar',
  'c_pillar_right': 'c_pillar',
  'c-pillar': 'c_pillar',
  // Tires
  'fl_tire': 'front_left_tire',
  'fr_tire': 'front_right_tire',
  'rr_tire': 'rear_right_tire',
  'rl_tire': 'rear_left_tire',
  // Wheels
  'fl_wheel': 'front_left_wheel',
  'fr_wheel': 'front_right_wheel',
  'rr_wheel': 'rear_right_wheel',
  'rl_wheel': 'rear_left_wheel',
  // Fog lights
  'foglight_right': 'front_right_foglight',
  'foglight_left': 'front_left_foglight',
  'fr_right_foglight': 'front_right_foglight',
  'fr_left_foglight': 'front_left_foglight',
  'fog_trim_left': 'front_left_fog_trim',
  'fog_trim_right': 'front_right_fog_trim',
  'fr_left_fogtrim': 'front_left_fog_trim',
  'fr_right_fogtrim': 'front_right_fog_trim',
  // Legacy v1 fog trim names
  'front_left_fogtrim': 'front_left_fog_trim',
  'front_right_fogtrim': 'front_right_fog_trim',
  // Chassis / structural
  'fr_carrier': 'front_carrier',
  'front_carrier': 'front_carrier',
  'radiator_support': 'radiator_support',
  'bumper_crash_foam': 'rear_bumper_crash_foam',
  'fr_cross_member': 'front_right_cross_member',
  'fl_cross_member': 'front_left_cross_member',
  'rr_cross_member': 'rear_right_cross_member',
  'rl_cross_member': 'rear_left_cross_member',
  'fr_rail': 'front_right_rail',
  'fl_rail': 'front_left_rail',
  'fl_inner_quarterpanel_fender': 'front_left_pan_panel',
  'fr_inner_quarterpanel': 'front_right_pan_panel',
  'fr_fender_sidemember': 'front_right_rail',
  'fl_fender_sidemember': 'front_left_rail',
  'rr_inner_quarterpanel': 'rear_right_pan_panel',
  'rl_inner_quarterpanel': 'rear_left_pan_panel',
  // Inner pillars
  'fr_inner_pillar': 'front_right_inner_pillar',
  'fl_inner_pillar': 'front_left_inner_pillar',
  'rr_inner_pillar': 'rear_right_inner_pillar',
  'rl_inner_pillar': 'rear_left_inner_pillar',
  // Door hinges
  'fr_door_hinge': 'front_right_door_hinge',
  'fl_door_hinge': 'front_left_door_hinge',
  'rr_door_hinge': 'rear_right_door_hinge',
  'rl_door_hinge': 'rear_left_door_hinge',
  // Door windows
  'fl_door_window': 'front_left_door_window',
  'rl_door_window': 'rear_left_door_window',
  'fr_door_window': 'front_right_door_window',
  'rr_door_window': 'rear_right_door_window',
  // Door trims
  'fl_door_trim': 'front_left_door_trim',
  'rl_door_trim': 'rear_left_door_trim',
  'fr_door_trim': 'front_right_door_trim',
  'rr_door_trim': 'rear_right_door_trim',
  // Door handles
  'fl_door_handle': 'front_left_door_handle',
  'rl_door_handle': 'rear_left_door_handle',
  'fr_door_handle': 'front_right_door_handle',
  'rr_door_handle': 'rear_right_door_handle',
  // Suspension
  'fr_shock_absorber': 'front_right_shock_absorber',
  'fl_shock_absorber': 'front_left_shock_absorber',
  'rl_shock_absorber': 'rear_left_shock_absorber',
  'rr_shock_absorber': 'rear_right_shock_absorber',
  'fr_control_arm': 'front_right_control_arm',
  'fl_control_arm': 'front_left_control_arm',
  'rr_control_arm': 'rear_right_control_arm',
  'rl_control_arm': 'rear_left_control_arm',
  'fr_steering_knuckle': 'front_right_steering_knuckle',
  'fl_steering_knuckle': 'front_left_steering_knuckle',
  'rr_steering_knuckle': 'rear_right_steering_knuckle',
  'rl_steering_knuckle': 'rear_left_steering_knuckle',
  'fr_coil_spring': 'front_right_shock_absorber',
  'fl_coil_spring': 'front_left_shock_absorber',
  'rr_coil_spring': 'rear_right_shock_absorber',
  'rl_coil_spring': 'rear_left_shock_absorber',
  // Logos
  'front_car_logo': 'front_car_logo',
  'fr_car_logo': 'front_car_logo',
  'rear_car_logo': 'rear_car_logo',
  // Fan
  'fan_shroud': 'radiator_fan',
  // Condenser (old → new)
  'condenser': 'ac_condenser',
  // Additional / Repair Parts aliases (re-pointed for v3.1 canonicals)
  'front_impact_bar': 'front_bumper_chassis_bar',
  'front_bumper_reinforcement_bar': 'front_bumper_chassis_bar',
  'core_support': 'radiator_support',
  'hood_lock': 'hood_latch',
  'hood_lock_assembly': 'hood_latch',
  'hood_latch_assembly': 'hood_latch',
  'front_wiring_harness_and_sensors': 'front_harness',
  'wheel_arch_liner': 'front_left_fender_liner',
  'dashboard_internal_structure': 'dashboard_internal_structure',
  'front_left_chassis_rail': 'front_left_rail',
  'rear_impact_bar': 'rear_impact_bar',
  'rear_impact_reinforcement_bar': 'rear_impact_bar',
  'rear_body_panel': 'rear_panel',
  'rear_end_panel': 'rear_panel',
  'rear_parking_sensor_harness': 'rear_parking_sensor_harness',
  // Structural component names (Stage 3 Gemini output normalization)
  'a_pillar': 'a_pillars',
  'subframe': 'underbody_chassis',
  'unibody': 'underbody_chassis',
  'crumple_zone': 'front_bumper_chassis_bar',
  // "Frame Rail" variants → DB keys are front_left_rail / front_right_rail
  'frame_rail': 'front_right_rail',
  'front_frame_rail': 'front_right_rail',
  'front_right_frame_rail': 'front_right_rail',
  'front_left_frame_rail': 'front_left_rail',
  'rear_frame_rail': 'rear_frame_rail_right',
  'rear_frame_rail_left': 'rear_frame_rail_left',
  'rear_frame_rail_right': 'rear_frame_rail_right',
  // "Bumper Bar" → chassis bar
  'bumper_bar': 'front_bumper_chassis_bar',
  'front_bumper_bar': 'front_bumper_chassis_bar',
  'rear_bumper_bar': 'rear_bumper_chassis_bar',
  // Legacy generic airbags → default to airbag_module (v3.1 canonical)
  'airbags': 'airbag_module',
  'airbag': 'airbag_module',
  // v3.1 has no positional front/rear airbag entries; route legacy keys to nearest canonical
  'front_left_airbag': 'steering_wheel_driver_airbag',
  'front_right_airbag': 'airbag_module',
  'rear_left_airbag': 'left_side_curtain_airbags',
  'rear_right_airbag': 'right_side_curtain_airbags',
  // Legacy generic seatbelts → default to front_left_seatbelt
  'seatbelts': 'front_left_seatbelt',
  'seatbelt': 'front_left_seatbelt',
  // Legacy generic pretensioner → default to front_left_seatbelt_pretensioner
  'seatbelt_pretensioner': 'front_left_seatbelt_pretensioner',
  // Part Taxonomy v3 aliases
  'right_chassis_rail_tip': 'front_right_cross_member',
  'left_chassis_rail_tip': 'front_left_cross_member',
  'hood_latch_and_striker': 'hood_latch',
  'hood_latch_and_release_cable': 'hood_latch',
  'door_hinge_pillars': 'front_right_door_hinge',
  'dashboard_cross_car_beam': 'tableau',
  // 'radiator_core_support' is folded into 'radiator_support' (PT_0187) via aliases.
  'radiator_core_support': 'radiator_support',
  'parking_sensor_wiring_harness': 'front_harness',
  'parking_sensor_harness': 'front_parking_sensors',
  'left_front_wheel_arch_liner': 'front_left_fender_liner',
  'right_front_wheel_arch_liner': 'front_right_fender_liner',
  'rear_left_wheel_arch_liner': 'rear_left_fender_liner',
  'rear_right_wheel_arch_liner': 'rear_right_fender_liner',
  'front_left_suspension_strut_and_control_arm': 'front_left_suspension_assembly',
  'front_right_suspension_strut_and_control_arm': 'front_right_suspension_assembly',
  'rear_left_suspension_strut_and_control_arm': 'rear_left_suspension_assembly',
  'rear_right_suspension_strut_and_control_arm': 'rear_right_suspension_assembly',
  'rear_floor_pan': 'spare_tire_pan',
  'rear_floor_pan_and_spare_tire_well': 'spare_tire_pan',
  'trunk_floor': 'spare_tire_pan',
  // Bare "floor pan" / cabin floor — v3.1 has no dedicated cabin floor entry,
  // so route to underbody_chassis (covers the full underbody panel).
  'floor': 'underbody_chassis',
  'floor_pan': 'underbody_chassis',
  'front_floor_pan': 'underbody_chassis',
  'cabin_floor_pan': 'underbody_chassis',
  'center_floor_pan': 'underbody_chassis',
  'floor_pan_section': 'underbody_chassis',
  'front_left_apron_and_wheel_house': 'front_left_apron',
  'rear_bumper_mounting_brackets': 'rear_bumper_brackets',
  'windshield_washer_reservoir': 'washer_fluid_reservoir',
  'side_curtain_airbag': 'side_curtain_airbag_system',
  'curtain_airbag': 'side_curtain_airbag_system',
  'airbag_impact_sensor': 'airbag_impact_sensors',
  'impact_sensor': 'airbag_impact_sensors',
  'cooling_fan': 'cooling_fan_assembly',
  'front_right_apron': 'front_right_apron',
  'front_left_apron': 'front_left_apron',
  'front_apron': 'front_right_apron',
  'inner_wheel_well_liner': 'front_left_fender_liner',
  // Hidden-damage shorthand variants emitted by Stage-4 inference
  'front_left_suspension': 'front_left_suspension_assembly',
  'front_right_suspension': 'front_right_suspension_assembly',
  'rear_left_suspension': 'rear_left_suspension_assembly',
  'rear_right_suspension': 'rear_right_suspension_assembly',
  'front_left_strut': 'front_left_suspension_assembly',
  'front_right_strut': 'front_right_suspension_assembly',
  'rear_left_strut': 'rear_left_suspension_assembly',
  'rear_right_strut': 'rear_right_suspension_assembly',
  'front_left_strut_assembly': 'front_left_suspension_assembly',
  'front_right_strut_assembly': 'front_right_suspension_assembly',
  'rear_left_strut_assembly': 'rear_left_suspension_assembly',
  'rear_right_strut_assembly': 'rear_right_suspension_assembly',
  'strut': 'front_left_suspension_assembly',
  'front_strut': 'front_left_suspension_assembly',
  'rear_strut': 'rear_left_suspension_assembly',
  'front_chassis_rail': 'front_left_rail',
  'front_left_frame_rail': 'front_left_rail',
  'front_right_frame_rail': 'front_right_rail',
  'rear_chassis_rail': 'rear_frame_rail_left',
  'front_bumper_reinforcement': 'front_bumper_chassis_bar',
  'rear_bumper_reinforcement': 'rear_impact_bar',
  'dashboard': 'tableau',
  // Slash-compound shorthands the AI sometimes emits (covered by normalizePartName
  // fallback, but listed here so the resolution is explicit & auditable)
  'front_rail_apron': 'front_left_rail',
  'rear_rail_apron': 'rear_frame_rail_left',
  'roof_panel_header_rail': 'roof',
  'roof_header_rail': 'roof',
  'header_rail': 'roof',
  // v3.1 taxonomy additions
  'left_front_door_hinges': 'front_left_door_hinge',
  'right_front_door_hinges': 'front_right_door_hinge',
  'front_impact_sensor': 'airbag_impact_sensors',
  'airbag_control_module': 'airbag_module',
  'steering_wheel_airbag': 'steering_wheel_driver_airbag',
  'driver_airbag': 'steering_wheel_driver_airbag',
  'radiator_and_cooling_fan_assembly': 'cooling_fan_assembly',
  'trunk_latch': 'trunk_latch_and_striker',
  'bulkhead': 'front_bulkhead',
};

// ============================================================================
// PART TAXONOMY v3.1 — Canonical part_id + alias map sourced from
// public/Part_Taxonomy_v3_1.xlsx (202 rows → 187 canonical parts after merging
// near-duplicate IDs into aliases). The model can return either the canonical
// English name OR any alias; both resolve via PARTS_DATABASE + PART_NAME_ALIASES.
// ============================================================================
const PART_TAXONOMY_V3 = [
  { partId: 'PT_0001', key: 'hood', aliases: [] },
  { partId: 'PT_0002', key: 'front_windshield', aliases: [] },
  { partId: 'PT_0003', key: 'front_wipers', aliases: [] },
  { partId: 'PT_0004', key: 'a_pillars', aliases: [] },
  { partId: 'PT_0005', key: 'roof', aliases: [] },
  { partId: 'PT_0006', key: 'grille', aliases: [] },
  { partId: 'PT_0007', key: 'front_right_headlight', aliases: [] },
  { partId: 'PT_0008', key: 'front_left_headlight', aliases: [] },
  { partId: 'PT_0009', key: 'upper_bumper', aliases: [] },
  { partId: 'PT_0010', key: 'front_car_logo', aliases: [] },
  { partId: 'PT_0011', key: 'trim_nickel_grille', aliases: [] },
  { partId: 'PT_0012', key: 'lower_grille', aliases: [] },
  { partId: 'PT_0013', key: 'front_right_foglight', aliases: [] },
  { partId: 'PT_0014', key: 'front_left_foglight', aliases: [] },
  { partId: 'PT_0015', key: 'lower_bumper', aliases: [] },
  { partId: 'PT_0016', key: 'front_left_fog_trim', aliases: [] },
  { partId: 'PT_0017', key: 'front_right_fog_trim', aliases: [] },
  { partId: 'PT_0018', key: 'front_left_fender', aliases: [] },
  { partId: 'PT_0019', key: 'left_rocker_panel', aliases: [] },
  { partId: 'PT_0020', key: 'front_left_door', aliases: [] },
  { partId: 'PT_0021', key: 'rear_left_door', aliases: [] },
  { partId: 'PT_0022', key: 'left_quarter_panel', aliases: [] },
  { partId: 'PT_0023', key: 'left_mirror', aliases: [] },
  { partId: 'PT_0024', key: 'front_left_door_window', aliases: [] },
  { partId: 'PT_0025', key: 'rear_left_door_window', aliases: [] },
  { partId: 'PT_0026', key: 'front_left_door_handle', aliases: [] },
  { partId: 'PT_0027', key: 'rear_left_door_handle', aliases: [] },
  { partId: 'PT_0028', key: 'front_right_fender', aliases: [] },
  { partId: 'PT_0029', key: 'right_rocker_panel', aliases: [] },
  { partId: 'PT_0030', key: 'front_right_door', aliases: [] },
  { partId: 'PT_0031', key: 'rear_right_door', aliases: [] },
  { partId: 'PT_0032', key: 'rear_right_quarter_panel', aliases: [] },
  { partId: 'PT_0033', key: 'b_pillar', aliases: [] },
  { partId: 'PT_0034', key: 'right_mirror', aliases: [] },
  { partId: 'PT_0035', key: 'front_right_door_window', aliases: [] },
  { partId: 'PT_0036', key: 'rear_right_door_window', aliases: [] },
  { partId: 'PT_0037', key: 'front_right_door_trim', aliases: [] },
  { partId: 'PT_0038', key: 'rear_right_door_trim', aliases: [] },
  { partId: 'PT_0039', key: 'front_right_door_handle', aliases: [] },
  { partId: 'PT_0040', key: 'rear_right_door_handle', aliases: [] },
  { partId: 'PT_0041', key: 'rear_bumper_upper', aliases: [] },
  { partId: 'PT_0042', key: 'rear_bumper_lower', aliases: [] },
  { partId: 'PT_0043', key: 'rear_wiper', aliases: [] },
  { partId: 'PT_0044', key: 'c_pillar', aliases: [] },
  { partId: 'PT_0045', key: 'rear_windshield', aliases: [] },
  { partId: 'PT_0046', key: 'rear_left_headlight_inner', aliases: [] },
  { partId: 'PT_0047', key: 'rear_right_headlight_inner', aliases: [] },
  { partId: 'PT_0048', key: 'rear_left_headlight_outer', aliases: [] },
  { partId: 'PT_0049', key: 'rear_right_headlight_outer', aliases: [] },
  { partId: 'PT_0050', key: 'trunk_door', aliases: [] },
  { partId: 'PT_0051', key: 'rear_car_logo', aliases: [] },
  { partId: 'PT_0052', key: 'front_left_tire', aliases: [] },
  { partId: 'PT_0053', key: 'front_right_tire', aliases: [] },
  { partId: 'PT_0054', key: 'rear_right_tire', aliases: [] },
  { partId: 'PT_0055', key: 'rear_left_tire', aliases: [] },
  { partId: 'PT_0056', key: 'front_left_wheel', aliases: [] },
  { partId: 'PT_0057', key: 'front_right_wheel', aliases: [] },
  { partId: 'PT_0058', key: 'rear_right_wheel', aliases: [] },
  { partId: 'PT_0059', key: 'rear_left_wheel', aliases: [] },
  { partId: 'PT_0060', key: 'roof_window', aliases: [] },
  { partId: 'PT_0061', key: 'roof_trims', aliases: [] },
  { partId: 'PT_0062', key: 'aerial', aliases: [] },
  { partId: 'PT_0063', key: 'front_left_fender_liner', aliases: ['left_front_wheel_arch_liner'] },
  { partId: 'PT_0064', key: 'front_right_fender_liner', aliases: ['right_front_wheel_arch_liner'] },
  { partId: 'PT_0065', key: 'rear_left_fender_liner', aliases: ['rear_left_wheel_arch_liner'] },
  { partId: 'PT_0066', key: 'rear_right_fender_liner', aliases: ['rear_right_wheel_arch_liner'] },
  { partId: 'PT_0067', key: 'tableau', aliases: ['dashboard_cross_car_beam'] },
  { partId: 'PT_0068', key: 'dashboard_internal_structure', aliases: [] },
  { partId: 'PT_0069', key: 'washer_fluid_reservoir', aliases: ['windshield_washer_reservoir'] },
  { partId: 'PT_0070', key: 'front_left_seatbelt', aliases: [] },
  { partId: 'PT_0071', key: 'front_right_seatbelt', aliases: [] },
  { partId: 'PT_0072', key: 'rear_left_seatbelt', aliases: [] },
  { partId: 'PT_0073', key: 'rear_right_seatbelt', aliases: [] },
  { partId: 'PT_0074', key: 'front_left_seatbelt_pretensioner', aliases: [] },
  { partId: 'PT_0075', key: 'front_right_seatbelt_pretensioner', aliases: [] },
  { partId: 'PT_0076', key: 'rear_left_seatbelt_pretensioner', aliases: [] },
  { partId: 'PT_0077', key: 'rear_right_seatbelt_pretensioner', aliases: [] },
  { partId: 'PT_0078', key: 'airbag_module', aliases: ['airbag_control_module'] },
  { partId: 'PT_0080', key: 'side_curtain_airbag_system', aliases: [] },
  { partId: 'PT_0081', key: 'left_side_curtain_airbags', aliases: [] },
  { partId: 'PT_0082', key: 'right_side_curtain_airbags', aliases: [] },
  { partId: 'PT_0083', key: 'steering_wheel_driver_airbag', aliases: ['steering_wheel_airbag'] },
  { partId: 'PT_0085', key: 'driver_knee_airbag', aliases: [] },
  { partId: 'PT_0086', key: 'airbag_impact_sensors', aliases: ['front_impact_sensor'] },
  { partId: 'PT_0088', key: 'bcm_module', aliases: [] },
  { partId: 'PT_0089', key: 'ecm_module', aliases: [] },
  { partId: 'PT_0090', key: 'tcm_module', aliases: [] },
  { partId: 'PT_0091', key: 'adas_module', aliases: [] },
  { partId: 'PT_0092', key: 'front_parking_sensors', aliases: ['parking_sensor_harness'] },
  { partId: 'PT_0093', key: 'rear_parking_sensors', aliases: ['parking_sensor_harness'] },
  { partId: 'PT_0094', key: 'front_camera', aliases: [] },
  { partId: 'PT_0095', key: 'rear_camera', aliases: [] },
  { partId: 'PT_0096', key: 'front_harness', aliases: ['front_wiring_harness_and_sensors', 'parking_sensor_wiring_harness'] },
  { partId: 'PT_0097', key: 'rear_harness', aliases: [] },
  { partId: 'PT_0099', key: 'rear_parking_sensor_harness', aliases: [] },
  { partId: 'PT_0100', key: 'battery', aliases: [] },
  { partId: 'PT_0101', key: 'exhaust_manifold', aliases: [] },
  { partId: 'PT_0102', key: 'exhaust_front_pipe', aliases: [] },
  { partId: 'PT_0103', key: 'exhaust_middle_pipe', aliases: [] },
  { partId: 'PT_0104', key: 'exhaust_rear_pipe', aliases: [] },
  { partId: 'PT_0105', key: 'brake_hoses', aliases: [] },
  { partId: 'PT_0106', key: 'gas_hoses', aliases: [] },
  { partId: 'PT_0107', key: 'fuel_tank', aliases: [] },
  { partId: 'PT_0108', key: 'engine_block', aliases: [] },
  { partId: 'PT_0109', key: 'engine_oil_pan', aliases: [] },
  { partId: 'PT_0110', key: 'transmission_housing', aliases: [] },
  { partId: 'PT_0111', key: 'transmission_oil_pan', aliases: [] },
  { partId: 'PT_0112', key: 'engine_mounts', aliases: [] },
  { partId: 'PT_0113', key: 'transmission_mounts', aliases: [] },
  { partId: 'PT_0114', key: 'driveshaft', aliases: [] },
  { partId: 'PT_0115', key: 'front_differential', aliases: [] },
  { partId: 'PT_0116', key: 'rear_differential', aliases: [] },
  { partId: 'PT_0117', key: 'radiator', aliases: [] },
  { partId: 'PT_0118', key: 'ac_condenser', aliases: [] },
  { partId: 'PT_0119', key: 'intercooler_turbo', aliases: [] },
  { partId: 'PT_0120', key: 'radiator_cap', aliases: [] },
  { partId: 'PT_0121', key: 'transmission_cooler', aliases: [] },
  { partId: 'PT_0122', key: 'coolant_pump', aliases: [] },
  { partId: 'PT_0123', key: 'radiator_hoses', aliases: [] },
  { partId: 'PT_0124', key: 'turbo_coolant_hoses', aliases: [] },
  { partId: 'PT_0125', key: 'radiator_fan', aliases: [] },
  { partId: 'PT_0126', key: 'fan_motor', aliases: [] },
  { partId: 'PT_0127', key: 'front_right_shock_absorber', aliases: [] },
  { partId: 'PT_0128', key: 'front_left_shock_absorber', aliases: [] },
  { partId: 'PT_0129', key: 'rear_left_shock_absorber', aliases: [] },
  { partId: 'PT_0130', key: 'rear_right_shock_absorber', aliases: [] },
  { partId: 'PT_0131', key: 'front_right_control_arm', aliases: [] },
  { partId: 'PT_0132', key: 'front_left_control_arm', aliases: [] },
  { partId: 'PT_0133', key: 'rear_right_control_arm', aliases: [] },
  { partId: 'PT_0134', key: 'rear_left_control_arm', aliases: [] },
  { partId: 'PT_0135', key: 'front_right_steering_knuckle', aliases: [] },
  { partId: 'PT_0136', key: 'front_left_steering_knuckle', aliases: [] },
  { partId: 'PT_0137', key: 'rear_right_steering_knuckle', aliases: [] },
  { partId: 'PT_0138', key: 'rear_left_steering_knuckle', aliases: [] },
  { partId: 'PT_0139', key: 'steering_rack', aliases: [] },
  { partId: 'PT_0140', key: 'steering_column', aliases: [] },
  { partId: 'PT_0141', key: 'inner_tie_rod', aliases: [] },
  { partId: 'PT_0142', key: 'outer_tie_rod', aliases: [] },
  { partId: 'PT_0143', key: 'suspension_control_arms', aliases: [] },
  { partId: 'PT_0144', key: 'tie_rods', aliases: [] },
  { partId: 'PT_0145', key: 'front_left_suspension_assembly', aliases: [] },
  { partId: 'PT_0146', key: 'front_right_suspension_assembly', aliases: [] },
  { partId: 'PT_0147', key: 'rear_left_suspension_assembly', aliases: [] },
  { partId: 'PT_0148', key: 'rear_right_suspension_assembly', aliases: [] },
  { partId: 'PT_0149', key: 'cooling_system', aliases: [] },
  { partId: 'PT_0150', key: 'cooling_fan_assembly', aliases: ['radiator_and_cooling_fan_assembly'] },
  { partId: 'PT_0152', key: 'radiator_and_condenser', aliases: [] },
  { partId: 'PT_0153', key: 'underbody_chassis', aliases: [] },
  { partId: 'PT_0154', key: 'engine_shield', aliases: [] },
  { partId: 'PT_0155', key: 'rear_shield', aliases: [] },
  { partId: 'PT_0156', key: 'front_shield', aliases: [] },
  { partId: 'PT_0157', key: 'front_bumper_chassis_bar', aliases: ['front_impact_bar', 'front_bumper_reinforcement_bar'] },
  { partId: 'PT_0158', key: 'front_carrier', aliases: [] },
  { partId: 'PT_0159', key: 'rear_bumper_chassis_bar', aliases: [] },
  { partId: 'PT_0160', key: 'rear_bumper_crash_foam', aliases: [] },
  { partId: 'PT_0161', key: 'front_right_cross_member', aliases: ['right_chassis_rail_tip'] },
  { partId: 'PT_0162', key: 'front_left_cross_member', aliases: ['left_chassis_rail_tip'] },
  { partId: 'PT_0163', key: 'hood_latch', aliases: ['hood_latch_assembly', 'hood_lock_hood_lock_assembly'] },
  { partId: 'PT_0165', key: 'front_right_rail', aliases: [] },
  { partId: 'PT_0166', key: 'front_left_rail', aliases: ['front_left_chassis_rail'] },
  { partId: 'PT_0167', key: 'front_left_pan_panel', aliases: [] },
  { partId: 'PT_0168', key: 'front_right_pan_panel', aliases: [] },
  { partId: 'PT_0169', key: 'rear_right_cross_member', aliases: [] },
  { partId: 'PT_0170', key: 'rear_left_cross_member', aliases: [] },
  { partId: 'PT_0171', key: 'spare_tire_pan', aliases: ['rear_floor_pan_and_spare_tire_well', 'rear_floor_pan', 'trunk_floor'] },
  { partId: 'PT_0172', key: 'rear_right_pan_panel', aliases: [] },
  { partId: 'PT_0173', key: 'rear_left_pan_panel', aliases: [] },
  { partId: 'PT_0174', key: 'rear_right_inner_pillar', aliases: [] },
  { partId: 'PT_0175', key: 'rear_left_inner_pillar', aliases: [] },
  { partId: 'PT_0176', key: 'front_right_inner_pillar', aliases: [] },
  { partId: 'PT_0177', key: 'front_left_inner_pillar', aliases: [] },
  { partId: 'PT_0178', key: 'front_right_door_hinge', aliases: ['door_hinge_pillars'] },
  { partId: 'PT_0179', key: 'front_left_door_hinge', aliases: ['door_hinge_pillars', 'left_front_door_hinges'] },
  { partId: 'PT_0180', key: 'rear_right_door_hinge', aliases: ['door_hinge_pillars'] },
  { partId: 'PT_0181', key: 'rear_left_door_hinge', aliases: ['door_hinge_pillars'] },
  { partId: 'PT_0183', key: 'rear_panel', aliases: ['rear_body_panel', 'rear_end_panel'] },
  { partId: 'PT_0186', key: 'rear_impact_bar', aliases: ['rear_impact_reinforcement_bar'] },
  { partId: 'PT_0187', key: 'radiator_support', aliases: ['radiator_support_core_support', 'radiator_core_support'] },
  { partId: 'PT_0190', key: 'headlight_mounting_brackets', aliases: [] },
  { partId: 'PT_0191', key: 'trunk_latch_and_striker', aliases: ['trunk_latch'] },
  { partId: 'PT_0193', key: 'liftgate_struts', aliases: [] },
  { partId: 'PT_0194', key: 'rear_bumper_brackets', aliases: ['rear_bumper_mounting_brackets'] },
  { partId: 'PT_0195', key: 'front_right_apron', aliases: [] },
  { partId: 'PT_0196', key: 'front_left_apron', aliases: [] },
  { partId: 'PT_0199', key: 'rear_frame_rail_left', aliases: [] },
  { partId: 'PT_0200', key: 'rear_frame_rail_right', aliases: [] },
  { partId: 'PT_0202', key: 'front_bulkhead', aliases: [] },
];

// Enrich PARTS_DATABASE with partId + aliases, and extend PART_NAME_ALIASES.
// An alias only joins PART_NAME_ALIASES when (a) it isn't itself a canonical
// key, and (b) it isn't already mapped — preserving hand-tuned mappings.
(function applyTaxonomyV3() {
  for (const { partId, key, aliases } of PART_TAXONOMY_V3) {
    const entry = PARTS_DATABASE[key];
    if (!entry) {
      console.warn(`[taxonomy-v3] missing PARTS_DATABASE entry for ${partId} (${key})`);
      continue;
    }
    entry.partId = partId;
    entry.aliases = aliases;
    for (const alias of aliases) {
      if (PARTS_DATABASE[alias]) continue;          // alias collides with another canonical
      if (PART_NAME_ALIASES[alias]) continue;       // hand-tuned mapping wins
      PART_NAME_ALIASES[alias] = key;
    }
  }
})();

function normalizePartName(rawName) {
  if (!rawName) return '';
  // Strip punctuation FIRST so that slashes/parens don't leave double underscores
  // when whitespace is later collapsed (e.g. "Radiator Support / Core Support"
  // → "radiator support  core support" → "radiator_support_core_support",
  // not "radiator_support__core_support").
  let key = rawName
    .toLowerCase()
    .trim()
    .replace(/[()\/\\,;:]/g, ' ')   // punctuation → space (slashes, commas, etc.)
    .replace(/[-]/g, '_')            // hyphens → underscore (e.g. A-Pillar → a_pillar)
    .replace(/\s+/g, '_')            // collapse whitespace → underscore
    .replace(/_+/g, '_')             // collapse runs of underscores
    .replace(/^_+|_+$/g, '');        // trim leading/trailing underscores

  // Direct alias hit
  if (PART_NAME_ALIASES[key]) return PART_NAME_ALIASES[key];
  if (PARTS_DATABASE[key]) return key;

  // Slash-compound fallback: the AI sometimes returns "Front Rail / Apron" or
  // "Roof Panel / Header Rail". Try each side of the slash as a separate part
  // and return the first that resolves to a canonical key. Prefer the chassis
  // side when both resolve (callers usually want the structural pick).
  if (/\//.test(rawName)) {
    const parts = rawName.split(/\//).map(s => s.trim()).filter(Boolean);
    let firstHit = null;
    let chassisHit = null;
    for (const piece of parts) {
      const k = piece
        .toLowerCase()
        .replace(/[-]/g, '_')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
      const resolved = PART_NAME_ALIASES[k] || (PARTS_DATABASE[k] ? k : null);
      if (!resolved) continue;
      if (!firstHit) firstHit = resolved;
      const cat = PARTS_DATABASE[resolved]?.category;
      if (cat === 'chassis_structure' && !chassisHit) chassisHit = resolved;
    }
    if (chassisHit || firstHit) return chassisHit || firstHit;
  }

  return key;
}

/**
 * Resolve a structural component name (from Stage 3) to a PARTS_DATABASE key.
 * Uses location context (e.g. "front-left") to pick the correct left/right variant.
 * Falls back to normalized name if no match found (will be flagged as unmapped).
 */
function resolveStructuralPartKey(component, location) {
  if (!component) return '';

  // Try direct normalization
  const normalized = normalizePartName(component);
  if (PARTS_DATABASE[normalized]) return normalized;

  // Parse location AND component name for position hints
  // (component itself may contain "Front Right", "Left", etc.)
  const loc = `${(location || '')} ${(component || '')}`.toLowerCase();
  const isLeft = loc.includes('left');
  const isRight = loc.includes('right');
  const isFront = loc.includes('front');
  const isRear = loc.includes('rear');

  // Extract base name by stripping ALL front/rear/left/right prefixes/suffixes
  // e.g. "front_right_frame_rail" → "frame_rail", "right_a_pillar" → "a_pillar"
  const base = normalized
    .replace(/^(?:front_|rear_|left_|right_)+/, '')
    .replace(/(?:_front|_rear|_left|_right)+$/, '');

  const side = isLeft ? 'left' : (isRight ? 'right' : '');
  const position = isFront ? 'front' : (isRear ? 'rear' : '');

  // Build candidates from most specific to least specific
  const candidates = [];
  if (position && side) candidates.push(`${position}_${side}_${base}`);
  if (position) {
    candidates.push(`${position}_${base}`);
    if (!side) {
      candidates.push(`${position}_right_${base}`, `${position}_left_${base}`);
    }
  }
  if (side) candidates.push(`${side}_${base}`);
  candidates.push(`front_right_${base}`, `front_left_${base}`);
  candidates.push(`rear_right_${base}`, `rear_left_${base}`);
  candidates.push(base);

  for (const candidate of candidates) {
    if (PARTS_DATABASE[candidate]) return candidate;
    const aliased = PART_NAME_ALIASES[candidate];
    if (aliased && PARTS_DATABASE[aliased]) return aliased;
  }

  // Fallback: return normalized (will get isUnmapped flag in enrichDamageData)
  return normalized;
}

/**
 * Extract the most appropriate damage type from a structural concern indicator text.
 * Falls back to riskLevel-based mapping.
 */
function extractStructuralDamageType(indicator, riskLevel) {
  if (!indicator) return 'structural deformation';
  const text = indicator.toLowerCase();

  // Check known damage types from DAMAGE_TYPE_INDEX
  for (const knownType of Object.keys(DAMAGE_TYPE_INDEX)) {
    if (text.includes(knownType)) return knownType;
  }

  // Map riskLevel to structural damage types
  if (riskLevel === 'severe' || riskLevel === 'critical') return 'structural deformation'; // index 5 → Replace
  if (riskLevel === 'moderate') return 'deformation'; // index 3 → Repair
  return 'misaligned'; // index 1 → Repair
}

function getSeverityLevel(score) {
  if (score <= CONFIG.SEVERITY.MINOR_MAX) return 'minor';
  if (score <= CONFIG.SEVERITY.MODERATE_MAX) return 'moderate';
  return 'severe';
}

function getRepairRecommendation(severityLevel) {
  switch (severityLevel) {
    case 'severe': return 'replace';
    case 'moderate': return 'advanced_repair';
    default: return 'repair';
  }
}

function calculateCosts(partType, severityLevel) {
  const partInfo = PARTS_DATABASE[partType];
  const basePrice = partInfo?.price || 3000;
  
  let repairCost = null;
  let laborCost = { min: 500, max: 1500 };
  let replacementCost = { min: basePrice, max: Math.round(basePrice * 1.3) };
  
  if (severityLevel === 'minor') {
    repairCost = { min: Math.round(basePrice * 0.2), max: Math.round(basePrice * 0.4) };
    laborCost = { min: 500, max: 1500 };
  } else if (severityLevel === 'moderate') {
    repairCost = { min: Math.round(basePrice * 0.5), max: Math.round(basePrice * 0.8) };
    laborCost = { min: 1500, max: 3500 };
  } else {
    laborCost = { min: 1000, max: 3000 };
  }
  
  const totalCost = repairCost
    ? { min: repairCost.min + laborCost.min, max: repairCost.max + laborCost.max }
    : { min: replacementCost.min + laborCost.min, max: replacementCost.max + laborCost.max };
  
  return { repairCost, replacementCost, laborCost, totalCost };
}

// ============================================================================
// [LEGACY] GEMINI API INTEGRATION - MULTI-IMAGE
// ============================================================================
async function callGeminiAPI(images, vehicleInfo) {
  const prompt = buildAnalysisPrompt(vehicleInfo, images.length);
  
  // Build parts array with prompt and all images
  const parts = [{ text: prompt }];
  
  // Add all images
  images.forEach((imageBase64, index) => {
    const { mimeType, imageData } = parseImageData(imageBase64);
    parts.push({
      inline_data: {
        mime_type: mimeType,
        data: imageData
      }
    });
  });
  
  const requestBody = {
    contents: [
      {
        parts: parts
      }
    ],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 8192,
      topP: 1.0,
      seed: 42
    }
  };
  
  console.log(`\n🤖 Calling Gemini API with ${images.length} images...`);
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONFIG.AI_TIMEOUT);
  
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      }
    );
    
    clearTimeout(timeout);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Gemini API Error:', response.status, errorText);
      
      if (response.status === 401) {
        throw new Error('Invalid API key. Please check your GEMINI_API_KEY.');
      }
      if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }
      
      throw new Error(`Gemini API error: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('📦 Gemini raw data keys:', Object.keys(data));

    if (data.error) {
      console.error('❌ Gemini returned error:', JSON.stringify(data.error, null, 2));
      throw new Error(`Gemini error: ${data.error.message || JSON.stringify(data.error)}`);
    }

    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      console.error('❌ No content in response. Full data:', JSON.stringify(data, null, 2).substring(0, 1000));
      throw new Error('No response from Gemini API. Check server console for details.');
    }

    console.log('✅ Gemini response received, length:', content.length);
    return content;
    
  } catch (error) {
    clearTimeout(timeout);
    
    if (error.name === 'AbortError') {
      throw new Error('AI analysis timeout. Please try with fewer or smaller images.');
    }
    
    throw error;
  }
}

// Repair truncated JSON by adding missing closing brackets
function repairTruncatedJSON(jsonStr) {
  let repaired = jsonStr.trim();

  // Remove trailing incomplete string (if cut mid-string)
  // Look for unclosed string at the end
  const lastQuoteIndex = repaired.lastIndexOf('"');
  if (lastQuoteIndex > 0) {
    const afterLastQuote = repaired.substring(lastQuoteIndex + 1);
    // If there's no proper closure after the last quote, it might be truncated
    if (!/^\s*[,}\]:]/.test(afterLastQuote) && afterLastQuote.length < 50) {
      // Truncated mid-string, close it
      repaired = repaired.substring(0, lastQuoteIndex + 1);
    }
  }

  // Count brackets and braces
  let openBraces = 0;
  let openBrackets = 0;
  let inString = false;
  let escape = false;

  for (let i = 0; i < repaired.length; i++) {
    const char = repaired[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (char === '\\' && inString) {
      escape = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{') openBraces++;
      else if (char === '}') openBraces--;
      else if (char === '[') openBrackets++;
      else if (char === ']') openBrackets--;
    }
  }

  // If we're still in a string, close it
  if (inString) {
    repaired += '"';
  }

  // Remove any trailing comma before closing
  repaired = repaired.replace(/,\s*$/, '');

  // Add missing closing brackets and braces
  while (openBrackets > 0) {
    repaired += ']';
    openBrackets--;
  }
  while (openBraces > 0) {
    repaired += '}';
    openBraces--;
  }

  console.log(`🔧 JSON repair: added ${repaired.length - jsonStr.trim().length} closing chars`);
  return repaired;
}

// [LEGACY] parseAIResponse — replaced by pipeline's combineStageResults()
function parseAIResponse(content) {
  console.log('\n📝 Parsing AI response...');
  console.log('📄 Raw response length:', content?.length || 0);
  console.log('📄 First 300 chars:', content?.substring(0, 300));

  if (!content || content.trim().length === 0) {
    console.error('❌ Empty response from AI');
    throw new Error('AI returned empty response');
  }

  // Try multiple extraction strategies
  const jsonMatch =
    content.match(/```json\s*([\s\S]*?)\s*```/) ||
    content.match(/```\s*([\s\S]*?)\s*```/) ||
    content.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    console.error('❌ No JSON found in response');
    console.error('📄 Full response:', content);
    throw new Error('AI response did not contain valid JSON. Response: ' + content.substring(0, 200));
  }

  let jsonString = jsonMatch[1] || jsonMatch[0];
  console.log('📄 Extracted JSON length:', jsonString?.length || 0);

  // First try parsing as-is, then try repairing if needed
  let parsed;
  try {
    parsed = JSON.parse(jsonString.trim());
  } catch (firstError) {
    console.log('⚠️ Initial parse failed, attempting JSON repair...');
    try {
      const repairedJson = repairTruncatedJSON(jsonString);
      parsed = JSON.parse(repairedJson);
      console.log('✅ JSON repair successful!');
    } catch (repairError) {
      console.error('❌ JSON Parse Error:', firstError.message);
      console.error('   First 500 chars of JSON:', jsonString.substring(0, 500));
      console.error('   Last 200 chars of JSON:', jsonString.substring(jsonString.length - 200));
      throw new Error(`Failed to parse AI response: ${firstError.message}. Check server console for details.`);
    }
  }

  try {
    // NEW SCHEMA: Parse damages and needs_check_parts
    const confirmedDamages = parsed.damages || [];
    const needsCheckParts = parsed.needs_check_parts || [];
    const safetyFlags = parsed.safety_flags || {};
    const vehicleDetails = parsed.vehicle_details_confirmed || {};
    const summary = parsed.summary || '';

    // Convert safety_flags object to array for backwards compatibility
    const overallSafetyFlags = [];
    if (safetyFlags.headlamp_broken) overallSafetyFlags.push('Headlamp broken');
    if (safetyFlags.windshield_cracked) overallSafetyFlags.push('Windshield cracked');
    if (safetyFlags.electrical_exposure) overallSafetyFlags.push('Electrical exposure');
    if (safetyFlags.airbag_deployment) overallSafetyFlags.push('Airbag deployment');
    if (safetyFlags.engine_bay_intrusion) overallSafetyFlags.push('Engine bay intrusion');

    console.log(`📋 Photo Quality: ${parsed.photo_quality_status}`);
    console.log(`📋 Vehicle: ${vehicleDetails.year} ${vehicleDetails.make} ${vehicleDetails.model} (${vehicleDetails.color})`);
    console.log(`✅ Confirmed Damages: ${confirmedDamages.length}`);
    console.log(`⚠️ Needs Check Parts: ${needsCheckParts.length}`);
    console.log(`🚨 Safety Flags: ${overallSafetyFlags.length > 0 ? overallSafetyFlags.join(', ') : 'None'}`);

    // Convert confirmed damages to unified format
    // Confidence comes as 0.0-1.0, convert to 0-100
    let damages = confirmedDamages.map(part => ({
      partName: part.part_name,
      damageType: part.damage_type,
      description: part.description || part.damage_type,
      indicators: part.description ? [part.description] : [],
      severityLevel: 'moderate',
      severityDescription: '',
      confidence: Math.round((part.confidence || 0.85) * 100), // Convert 0-1 to 0-100
      location: 'detected',
      visualEvidence: part.description || '',
      recommendedDecision: 'repair',
      safetyFlags: [],
      evidenceImages: [],
      crossReferenceNotes: '',
      hiddenDamageIndicators: []
    }));

    // Add needs_check_parts as damages with lower confidence
    const needsCheckDamages = needsCheckParts.map(part => ({
      partName: part.part_name,
      damageType: part.damage_type,
      description: part.description || part.damage_type,
      indicators: part.description ? [part.description] : [],
      severityLevel: 'minor',
      severityDescription: part.reason_for_uncertainty || '',
      confidence: Math.round((part.confidence || 0.5) * 100), // Convert 0-1 to 0-100
      location: 'detected',
      visualEvidence: part.description || '',
      recommendedDecision: 'inspect',
      safetyFlags: [],
      evidenceImages: [],
      crossReferenceNotes: part.reason_for_uncertainty || '',
      hiddenDamageIndicators: []
    }));

    // Combine all damages
    damages = [...damages, ...needsCheckDamages];

    // VALIDATION: Safety flags vs damages
    if (overallSafetyFlags.length > 0 && damages.length === 0) {
      console.warn('⚠️ INCONSISTENCY: Safety flags exist but no damages listed!');
      console.warn(`   Safety flags: ${overallSafetyFlags.join(', ')}`);

      if (safetyFlags.headlamp_broken) {
        damages.push({
          partName: 'front_right_headlight',
          damageType: 'broken',
          description: 'Headlight damage detected from safety assessment',
          indicators: ['Headlight damage detected'],
          severityLevel: 'moderate',
          confidence: 85,
          location: 'front',
          visualEvidence: 'Headlamp broken flag'
        });
      }

      if (safetyFlags.windshield_cracked) {
        damages.push({
          partName: 'front_windshield',
          damageType: 'crack',
          description: 'Windshield crack detected from safety assessment',
          indicators: ['Windshield crack detected'],
          severityLevel: 'high-moderate',
          confidence: 85,
          location: 'front',
          visualEvidence: 'Windshield cracked flag'
        });
      }

      if (damages.length > 0) {
        console.log(`✅ Reconstructed ${damages.length} damages from safety flags`);
      }
    }

    // Overall confidence: convert from 0-1 to 0-100
    const overallConfidence = parsed.overall_confidence_score
      ? Math.round(parsed.overall_confidence_score * 100)
      : 75;

    console.log(`✅ Final parsed result: ${damages.length} total damages, ${overallSafetyFlags.length} safety concerns`);
    console.log(`📊 Overall Confidence: ${overallConfidence}%`);
    console.log(`📝 Summary: ${summary}`);

    return {
      photoQuality: parsed.photo_quality_status === 'Retake needed' ? 'poor' : 'good',
      imagesAnalyzed: 1,
      imageDescriptions: [],
      damages: damages,
      safetyConcerns: overallSafetyFlags,
      engineAssessment: {},
      regionInspection: [],
      coverageAssessment: {},
      hiddenDamageAssessment: [],
      structuralDamage: { detected: false, concerns: [] },
      overallConfidence: overallConfidence,
      vehicleDetails: vehicleDetails,
      summary: summary
    };

  } catch (processingError) {
    console.error('❌ Processing Error:', processingError.message);
    throw new Error(`Failed to process AI response: ${processingError.message}`);
  }
}

// ============================================================================
// ANALYSIS PROCESSING
// ============================================================================

// Convert snake_case to Title Case (e.g., "upper_bumper_front" → "Upper Bumper Front")
function formatPartName(snakeCaseName) {
  if (!snakeCaseName) return '';
  return snakeCaseName
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function enrichDamageData(rawAnalysis, vehicleInfo) {
  const damages = (rawAnalysis.damages || []).map(damage => {
    const partType = normalizePartName(damage.partName);
    const partInfo = PARTS_DATABASE[partType] || {};
    const isUnmapped = !PARTS_DATABASE[partType]; // Part not in our taxonomy DB

    const severityLevel = damage.severityLevel || 'moderate';
    const recommendation = getRepairRecommendation(severityLevel);
    
    const costs = calculateCosts(partType, severityLevel);
    
    // Format official name - use database names or format snake_case dynamically
    const formattedNameEn = partInfo.nameEn || formatPartName(partType) || formatPartName(damage.partName);
    const officialName = partInfo.nameEn && partInfo.nameAr
      ? `${partInfo.nameEn} / ${partInfo.nameAr}`
      : formattedNameEn;
    
    // Get severity description from DAMAGE_DESCRIPTIONS if available
    const partDescriptions = DAMAGE_DESCRIPTIONS[partType] || DAMAGE_DESCRIPTIONS[DAMAGE_DESCRIPTION_ALIASES[partType]];
    let severityDesc = damage.severityDescription || '';
    if (!severityDesc && partDescriptions?.severity_descriptions) {
      severityDesc = partDescriptions.severity_descriptions[severityLevel] || '';
    }

    // Get proper names from PARTS_DATABASE, or format snake_case dynamically
    const nameEn = partInfo.nameEn || formatPartName(partType) || formatPartName(damage.partName);
    const nameAr = partInfo.nameAr || '';

    // Parse indicators from description or use existing indicators array
    let indicators = damage.indicators || [];
    if (indicators.length === 0 && damage.description) {
      // Split description into individual indicators if not already provided
      indicators = damage.description.split(/,\s*|;\s*/).filter(i => i.trim());
    }

    // =========================================================================
    // SEVERITY DECISION (Repair/Replace) — Simple index-based rule
    // Use ONLY the AI-detected damage type, no description-based upgrades.
    // index < 4 → Repair, index >= 4 → Replace. Unknown types → Replace.
    // ALL damages get a label regardless of confidence.
    // =========================================================================
    const damageTypeForDecision = damage.damageType || 'unknown';
    const severityDecisionResult = getSeverityDecision(damageTypeForDecision);

    // Category-based overrides:
    // - 'mechanical' → ALWAYS Replace
    // - 'chassis_structure' → ALWAYS Repair (override all other rules, including buckled)
    // - All other categories follow the damage-index rule, EXCEPT buckled
    //   body panels which are always Repair via bodywork
    const partCategory = (partInfo.category || '').toLowerCase();
    const damageStrLower = (damageTypeForDecision || '').toLowerCase();
    const isBuckledDamage = damageStrLower.includes('buckl');

    // DEBUG: Log category override check for chassis_structure parts
    if (partCategory === 'chassis_structure') {
      console.log(`🔍 DEBUG: "${nameEn}" category="${partCategory}" should ALWAYS REPAIR`);
    }

    // Category-based overrides:
    // ALWAYS REPLACE: airbags_safety, interior, mechanical, suspension
    // ALWAYS REPAIR: structural, chassis
    const alwaysReplaceCategories = ['airbags_safety', 'interior', 'mechanical', 'suspension'];
    const alwaysRepairCategories = ['structural', 'chassis', 'chassis_structure'];

    if (alwaysReplaceCategories.includes(partCategory)) {
      severityDecisionResult.decision = 'Replace';
      severityDecisionResult.categoryOverride = true;
    } else if (alwaysRepairCategories.includes(partCategory)) {
      // Structural/chassis parts (pillars, rails, frames) ALWAYS Repair, override all rules including buckled
      severityDecisionResult.decision = 'Repair';
      severityDecisionResult.categoryOverride = true;
    } else if (isBuckledDamage) {
      // Buckled body panels (hood, fender, door, trunk) → Repair via bodywork
      severityDecisionResult.decision = 'Repair';
      severityDecisionResult.categoryOverride = true;
    }

    // =========================================================================
    // LEFT/RIGHT SIDE CORRECTION
    // If the description clearly mentions one side but the resolved part key
    // contains the opposite side, swap it — only when the corrected key exists
    // in PARTS_DATABASE (never creates a new key, never removes a valid one).
    // =========================================================================
    let resolvedPartType = partType;
    const descLower = (damage.description || damage.visualEvidence || '').toLowerCase();
    const descHasRight = /\bright\b/.test(descLower);
    const descHasLeft  = /\bleft\b/.test(descLower);
    const keyHasRight  = partType.includes('_right_') || partType.endsWith('_right');
    const keyHasLeft   = partType.includes('_left_')  || partType.endsWith('_left');

    if (descHasRight && !descHasLeft && keyHasLeft) {
      const candidate = partType.replace(/_left_/g, '_right_').replace(/_left$/, '_right');
      if (PARTS_DATABASE[candidate]) {
        resolvedPartType = candidate;
        console.log(`↔️  Side corrected: "${partType}" → "${resolvedPartType}" (desc says right)`);
      }
    } else if (descHasLeft && !descHasRight && keyHasRight) {
      const candidate = partType.replace(/_right_/g, '_left_').replace(/_right$/, '_left');
      if (PARTS_DATABASE[candidate]) {
        resolvedPartType = candidate;
        console.log(`↔️  Side corrected: "${partType}" → "${resolvedPartType}" (desc says left)`);
      }
    }

    const resolvedPartInfo = PARTS_DATABASE[resolvedPartType] || partInfo;
    const resolvedNameEn   = resolvedPartInfo.nameEn || nameEn;
    const resolvedNameAr   = resolvedPartInfo.nameAr || nameAr;

    if (isUnmapped) {
      console.log(`⚠️ UNMAPPED Part: "${nameEn}" (key: "${partType}") — will be excluded from report`);
    }
    console.log(`📋 Part: ${nameEn}, Damage: "${damageTypeForDecision}", Index: ${severityDecisionResult.index}, Decision: ${severityDecisionResult.decision}, Known: ${severityDecisionResult.isKnownType}${severityDecisionResult.categoryOverride ? `, Category Override: ${partCategory}` : ''}${damage.isStructuralConcern ? ', Structural: true' : ''}`);

    // For needs_check items (recommendedDecision: 'inspect'), hide ALL recommendations
    // Don't show Repair or Replace - just show as "needs inspection"
    let finalRecommendation = recommendation;
    if (damage.recommendedDecision === 'inspect') {
      finalRecommendation = 'inspect'; // Only show "inspect", no repair/replace
      console.log(`[Needs Check] "${nameEn}": Recommendation hidden (needs inspection only)`);
    }

    return {
      part: officialName,
      partType: partType,
      nameEn: nameEn,
      nameAr: nameAr,
      damageType: damage.damageType || 'unknown',
      damageTypes: [damage.damageType || 'unknown'],
      description: damage.description || damage.visualEvidence || 'Damage detected',
      indicators: indicators,
      location: damage.location || 'unknown',
      confidence: damage.confidence || 70,
      recommendation: finalRecommendation,
      // Severity Decision (index < 4 → Repair, index >= 4 → Replace)
      severityDecision: severityDecisionResult.decision, // "Repair" or "Replace"
      severityIndex: severityDecisionResult.index,
      isKnownDamageType: severityDecisionResult.isKnownType,
      isSafetyPart: partInfo.isSafety || false,
      isUnmapped: isUnmapped,
      isStructuralConcern: damage.isStructuralConcern || false,
      visualEvidence: damage.visualEvidence || damage.description,
      evidenceImages: damage.evidenceImages || [],
      crossReferenceNotes: damage.crossReferenceNotes || '',
      hiddenDamageIndicators: damage.hiddenDamageIndicators || [],
      ...costs,
      // Store internally for aggregation (not exposed to frontend)
      __internal: { severityLevel, isNeedsCheck: damage.recommendedDecision === 'inspect' }
    };
  });
  
  // Calculate totals
  let totalMinCost = 0;
  let totalMaxCost = 0;
  let repairCount = 0;
  let replaceCount = 0;
  let advancedRepairCount = 0;
  let safetyPartsAffected = 0;

  // Index-based decision counts
  let indexBasedRepairCount = 0;
  let indexBasedReplaceCount = 0;
  let unknownDamageTypeCount = 0;

  // Count severity levels
  const severityCounts = { minor: 0, moderate: 0, severe: 0 };

  damages.forEach(d => {
    totalMinCost += d.totalCost.min;
    totalMaxCost += d.totalCost.max;

    // Count by severity level (internal)
    const level = d.__internal?.severityLevel || 'moderate';
    if (level === 'minor' || level === 'low-moderate') severityCounts.minor++;
    else if (level === 'moderate' || level === 'high-moderate') severityCounts.moderate++;
    else severityCounts.severe++;

    if (d.recommendation === 'repair') repairCount++;
    else if (d.recommendation === 'advanced_repair') advancedRepairCount++;
    else replaceCount++;

    // Count by index-based severity decision
    if (d.severityDecision === 'Repair') indexBasedRepairCount++;
    else if (d.severityDecision === 'Replace') indexBasedReplaceCount++;

    if (!d.isKnownDamageType) unknownDamageTypeCount++;
    if (d.isSafetyPart) safetyPartsAffected++;
  });

  // Log summary of severity decisions
  console.log(`\n📊 Severity Decision Summary:`);
  console.log(`   Repair (index < 4): ${indexBasedRepairCount}`);
  console.log(`   Replace (index >= 4): ${indexBasedReplaceCount}`);
  console.log(`   Unknown Damage Types (defaulted to Replace): ${unknownDamageTypeCount}`);

  // Determine overall severity level based on counts (for internal tracking only)
  let overallSeverityLevel = 'minor';
  if (severityCounts.severe > 0) overallSeverityLevel = 'severe';
  else if (severityCounts.moderate > 0) overallSeverityLevel = 'moderate';
  else if (severityCounts.minor > 0) overallSeverityLevel = 'minor';

  // Determine urgency - ONLY based on safety parts affected, NOT severity level
  // This prevents false CRITICAL alerts for non-safety severe damage
  let urgencyLevel = 'low';
  if (safetyPartsAffected >= 2) {
    urgencyLevel = 'critical';
  } else if (safetyPartsAffected >= 1) {
    urgencyLevel = 'high';
  }
  // NOTE: Severity level does NOT trigger HIGH/MEDIUM urgency anymore
  // Only safety parts trigger urgency escalation

  // Clean internal fields before returning
  const cleanedDamages = damages.map(({ __internal, ...rest }) => rest);

  return {
    vehicle: normalizeVehicleInfo(vehicleInfo) || normalizeVehicleInfo(rawAnalysis?.vehicleDetails),
    damages: cleanedDamages,
    photoQuality: {
      status: rawAnalysis.photoQuality === 'poor' ? 'fair' : rawAnalysis.photoQuality || 'good',
      issues: rawAnalysis.photoQuality === 'poor' ? ['Poor photo quality detected'] : []
    },
    imagesAnalyzed: rawAnalysis.imagesAnalyzed || 1,
    imageDescriptions: rawAnalysis.imageDescriptions || [],
    safetyConcerns: rawAnalysis.safetyConcerns || [],
    engineAssessment: rawAnalysis.engineAssessment || {},
    coverageAssessment: rawAnalysis.coverageAssessment || {},
    hiddenDamageAssessment: rawAnalysis.hiddenDamageAssessment || [],
    structuralDamage: rawAnalysis.structuralDamage || { detected: false, concerns: [] },
    damageSummary: {
      totalComponentsAffected: damages.length,
      repairCount: repairCount,
      replaceCount: replaceCount,
      advancedRepairCount: advancedRepairCount,
      // NEW: Index-based severity decision counts
      indexBasedRepairCount: indexBasedRepairCount,  // Parts with index < 4
      indexBasedReplaceCount: indexBasedReplaceCount, // Parts with index >= 4 or unknown damage type
      unknownDamageTypeCount: unknownDamageTypeCount, // Parts with damage types not in our index
      safetyComponentsAffected: safetyPartsAffected,
      overallPriceRange: {
        min: totalMinCost,
        max: totalMaxCost
      },
      urgencyLevel: urgencyLevel,
      summaryText: damages.length > 0
        ? `Analysis identified ${damages.length} damaged component(s) across ${rawAnalysis.imagesAnalyzed} images. Estimated repair cost: ${totalMinCost.toLocaleString('en-EG')} - ${totalMaxCost.toLocaleString('en-EG')} EGP.`
        : `No visible damage detected in the ${rawAnalysis.imagesAnalyzed} provided images.`
    },
    overallConfidence: rawAnalysis.overallConfidence || 75,
    summary: damages.length > 0
      ? `Detected ${damages.length} damaged parts across ${rawAnalysis.imagesAnalyzed} images`
      : `No visible damage detected in ${rawAnalysis.imagesAnalyzed} images`
  };
}

// ============================================================================
// ASYNC ANALYSIS JOB TRACKING
// ============================================================================
const analysisJobs = new Map(); // analysisId → { status, result, error, startTime }

function createAnalysisJob(sessionId, vehicleInfo, imagesCount) {
  const analysisId = `${sessionId}-${Date.now()}`;
  analysisJobs.set(analysisId, {
    status: 'processing',
    sessionId,
    vehicleInfo,
    imagesCount,
    startTime: Date.now(),
    result: null,
    error: null,
  });

  // Clean up old jobs (older than 24 hours)
  const cutoff = Date.now() - (24 * 60 * 60 * 1000);
  for (const [id, job] of analysisJobs.entries()) {
    if (job.startTime < cutoff) {
      analysisJobs.delete(id);
    }
  }

  return analysisId;
}

function updateJobStatus(analysisId, status, data) {
  const job = analysisJobs.get(analysisId);
  if (job) {
    job.status = status;
    if (status === 'completed') {
      job.result = data;
    } else if (status === 'failed') {
      job.error = data;
    }
  }
}

// ============================================================================
// EXPRESS APP SETUP
// ============================================================================
const app = express();

app.use(cors());
// Parse multipart/form-data BEFORE JSON to handle file uploads
app.use((req, res, next) => {
  if (!req.is('multipart/form-data')) {
    return next();
  }

  let rawBody = Buffer.alloc(0);
  req.on('data', (chunk) => {
    rawBody = Buffer.concat([rawBody, chunk]);
  });

  req.on('end', async () => {
    try {
      const contentType = req.get('content-type');
      const boundaryMatch = contentType.match(/boundary=([^\s;]+)/);
      if (!boundaryMatch) {
        return res.status(400).json({ error: 'Invalid multipart/form-data' });
      }

      const boundary = boundaryMatch[1];
      const boundaryBuffer = Buffer.from(`--${boundary}`);
      const crlfBuffer = Buffer.from('\r\n');
      const doubleCrlfBuffer = Buffer.from('\r\n\r\n');

      const formData = {};
      const images = [];

      // Split by boundary while preserving binary data
      const parts = [];
      let currentPos = 0;
      while (currentPos < rawBody.length) {
        const boundaryPos = rawBody.indexOf(boundaryBuffer, currentPos);
        if (boundaryPos === -1) break;

        if (boundaryPos > currentPos) {
          parts.push(rawBody.slice(currentPos, boundaryPos));
        }
        currentPos = boundaryPos + boundaryBuffer.length;
      }

      for (const part of parts) {
        if (part.length === 0) continue;

        // Find header/body separator
        const doubleCrlfPos = part.indexOf(doubleCrlfBuffer);
        if (doubleCrlfPos === -1) continue;

        const headers = part.slice(0, doubleCrlfPos).toString('utf-8');
        let body = part.slice(doubleCrlfPos + 4);

        // Remove trailing \r\n
        if (body.length > 0 && body[body.length - 1] === 10 && body[body.length - 2] === 13) {
          body = body.slice(0, -2);
        }

        const nameMatch = headers.match(/name="([^"]+)"/);
        const filenameMatch = headers.match(/filename="([^"]+)"/);

        if (!nameMatch) continue;

        const fieldName = nameMatch[1];

        if (filenameMatch) {
          // File upload - convert binary data to base64
          const base64 = body.toString('base64');
          images.push(base64);
        } else {
          // Regular form field - convert to string
          formData[fieldName] = body.toString('utf-8');
        }
      }

      // Parse JSON fields
      if (formData.imageViews) {
        try {
          formData.imageViews = JSON.parse(formData.imageViews);
        } catch (e) {
          // Keep as string if not valid JSON
        }
      }
      if (formData.imageAngles) {
        try {
          formData.imageAngles = JSON.parse(formData.imageAngles);
        } catch (e) {
          // Keep as string if not valid JSON
        }
      }
      if (formData.vehicleInfo) {
        try {
          formData.vehicleInfo = JSON.parse(formData.vehicleInfo);
        } catch (e) {
          // Keep as string if not valid JSON
        }
      }

      // Attach parsed data to request body
      if (images.length > 0) {
        formData.images = images;
      }

      req.body = formData;
      next();
    } catch (err) {
      res.status(400).json({ error: 'Failed to parse multipart form data', details: err.message });
    }
  });
});

// Then handle JSON for non-multipart requests
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'dist')));

registerDemoRequestRoutes(app, {
  log: console,
  middleware: [demoRequestRateLimit],
});

registerWorkshopFormRoutes(app, {
  log: console,
  formMiddleware: [workshopFormRateLimit],
  abandonmentMiddleware: [workshopAbandonmentRateLimit],
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Vehicle Damage Analysis API - Multi-Image',
    model: CONFIG.GEMINI_MODEL,
    imageSupport: `${CONFIG.MIN_IMAGES}-${CONFIG.MAX_IMAGES} images`,
    timestamp: new Date().toISOString()
  });
});

// Main analysis endpoint
app.post('/functions/v1/analyze-damage', analysisRateLimit, async (req, res) => {
  console.log('\n' + '='.repeat(80));
  console.log('🚗 NEW MULTI-IMAGE DAMAGE ANALYSIS REQUEST');
  console.log('='.repeat(80));

  try {
    let { images, imageBase64, imageViews, imageAngles, vehicleInfo, sessionId } = req.body;

    // Backward compatibility: convert single image to array
    if (!images && imageBase64) {
      images = [imageBase64];
      console.log('📌 Single image detected, converted to array format');
    }

    // Validate input (quick validation before async processing)
    validateImageInput(images);

    // Validate optional imageViews
    if (imageViews !== undefined && imageViews !== null) {
      if (!Array.isArray(imageViews)) {
        throw new Error('imageViews must be an array of view labels aligned to images.');
      }
      if (imageViews.length !== images.length) {
        throw new Error(`imageViews length (${imageViews.length}) must equal images length (${images.length}).`);
      }
      const invalid = imageViews.filter(v => !VEHICLE_VIEW_KEYS.includes(v));
      if (invalid.length > 0) {
        throw new Error(`Unknown view labels: ${invalid.join(', ')}. Allowed: ${VEHICLE_VIEW_KEYS.join(', ')}.`);
      }
    } else {
      imageViews = null;
    }

    // Validate optional imageAngles
    if (imageAngles !== undefined && imageAngles !== null) {
      if (!Array.isArray(imageAngles)) {
        throw new Error('imageAngles must be an array of angle labels aligned to images.');
      }
      if (imageAngles.length !== images.length) {
        throw new Error(`imageAngles length (${imageAngles.length}) must equal images length (${images.length}).`);
      }
      const invalidAngles = imageAngles.filter(a => !IMAGE_ANGLE_KEYS.includes(a));
      if (invalidAngles.length > 0) {
        throw new Error(`Unknown angle labels: ${invalidAngles.join(', ')}. Allowed: ${IMAGE_ANGLE_KEYS.join(', ')}.`);
      }
    } else {
      imageAngles = null;
    }

    // Create analysis job and return immediately
    const analysisId = createAnalysisJob(sessionId, vehicleInfo, images.length);
    console.log(`📊 Analysis Job Created: ${analysisId}`);
    console.log(`📋 Vehicle: ${describeVehicle(vehicleInfo) || 'Not provided'}`);
    console.log(`📸 Images Provided: ${images.length}`);
    console.log('='.repeat(80) + '\n');

    // Return immediately with analysisId (client can poll for results)
    res.json({
      success: true,
      analysisId,
      sessionId,
      message: 'Analysis started. Poll /functions/v1/analysis-result/{analysisId} for results.',
      estimatedDuration: '60-120 seconds',
    });

    // Process analysis asynchronously in background (non-blocking)
    (async () => {
      const startTime = Date.now();
      try {
        // Start file-based log for this analysis
        const logFile = startAnalysisLog(vehicleInfo);
        appendLog(`Analysis ID: ${analysisId}`);
        appendLog(`Images provided: ${(images || []).length}`);
        appendLog(`Vehicle: ${describeVehicle(vehicleInfo) || 'Not provided'}`);
        console.log(`📝 Log file: ${logFile}`);

        // Deduplicate images before analysis
        const deduped = deduplicateImages(images, imageViews, imageAngles);
        const dedupedImages = deduped.images;
        const dedupedViews = deduped.imageViews;
        const dedupedAngles = deduped.imageAngles;

        // Run 4-stage analysis pipeline
        const rawAnalysis = await runAnalysisPipeline(dedupedImages, vehicleInfo, dedupedViews, dedupedAngles);

        // Enrich with pricing and metadata
        const finalAnalysis = enrichDamageData(rawAnalysis, vehicleInfo);
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        console.log('\n📊 ANALYSIS COMPLETE:');
        console.log(`   ⏱️  Duration: ${duration}s`);
        console.log(`   📸 Images Analyzed: ${finalAnalysis.imagesAnalyzed}`);
        console.log(`   📷 Photo Quality: ${finalAnalysis.photoQuality.status}`);
        console.log(`   🔍 Damages Found: ${finalAnalysis.damages.length}`);
        console.log(`   ⚠️  Safety Concerns: ${finalAnalysis.safetyConcerns.length}`);
        if (finalAnalysis.hiddenDamageAssessment && finalAnalysis.hiddenDamageAssessment.length > 0) {
          console.log(`   🔎 Hidden Damage Indicators: ${finalAnalysis.hiddenDamageAssessment.length}`);
        }
        if (finalAnalysis.engineAssessment && finalAnalysis.engineAssessment.engine_status !== 'SAFE' && finalAnalysis.engineAssessment.engine_status !== 'NOT_VISIBLE') {
          console.log(`   🔧 Engine Status: ${finalAnalysis.engineAssessment.engine_status}`);
        }
        console.log(`   💰 Cost Range: ${finalAnalysis.damageSummary.overallPriceRange.min} - ${finalAnalysis.damageSummary.overallPriceRange.max} EGP`);
        console.log(`   🎯 Confidence: ${finalAnalysis.overallConfidence}%`);
        console.log(`   ⚡ Urgency: ${(finalAnalysis.damageSummary.urgencyLevel || 'unknown').toUpperCase()}`);

        if (finalAnalysis.regionInspection && finalAnalysis.regionInspection.length > 0) {
          const inspectedRegions = finalAnalysis.regionInspection.length;
          const damagedRegions = finalAnalysis.regionInspection.filter(r => r.detected_damage).length;
          console.log(`   🗺️  Regions Scanned: ${damagedRegions}/${inspectedRegions} with damage`);
        }
        console.log('='.repeat(80) + '\n');

        // Update job status to completed
        updateJobStatus(analysisId, 'completed', finalAnalysis);

        // Persist final analysis summary to log file
        appendLog(`\nANALYSIS COMPLETE - Duration: ${duration}s`);
        appendLog(`  Images Analyzed: ${finalAnalysis.imagesAnalyzed}`);
        appendLog(`  Damages Found: ${finalAnalysis.damages.length}`);
        appendLog(`  Cost Range: ${finalAnalysis.damageSummary.overallPriceRange.min} - ${finalAnalysis.damageSummary.overallPriceRange.max} EGP`);
        appendLog(`  Confidence: ${finalAnalysis.overallConfidence}%`);
        appendLog(`  Urgency: ${finalAnalysis.damageSummary.urgencyLevel}`);
        appendLogJSON('FINAL ANALYSIS', finalAnalysis);

        // Save analysis and record events (background, fire-and-forget)
        saveAnalysisRun({
          req,
          vehicleInfo,
          images: dedupedImages,
          finalAnalysis,
          success: true,
          durationMs: Date.now() - startTime,
        }, process.env, console).catch(err => {
          console.error('⚠️  Failed to save analysis run:', err.message);
          updateJobStatus(analysisId, 'failed', `Save error: ${err.message}`);
        });

        recordAnalysisEvent({
          req,
          vehicleInfo,
          images: dedupedImages,
          finalAnalysis,
          success: true,
          log: console,
        }).catch(err => {
          console.error('⚠️  Failed to record analysis event:', err.message);
        });
      } catch (bgError) {
        console.error('❌ BACKGROUND ERROR:', bgError.message);
        updateJobStatus(analysisId, 'failed', bgError.message);

        // Save error logs
        saveAnalysisRun({
          req,
          vehicleInfo,
          images,
          success: false,
          errorMessage: bgError.message,
          durationMs: Date.now() - startTime,
        }, process.env, console).catch(err => {
          console.error('⚠️  Failed to save error run:', err.message);
        });

        recordAnalysisEvent({
          req,
          vehicleInfo,
          images,
          success: false,
          errorMessage: bgError.message,
          log: console,
        }).catch(err => {
          console.error('⚠️  Failed to record error event:', err.message);
        });
      }
    })(); // Fire-and-forget async processing

  } catch (error) {
    console.error('❌ VALIDATION ERROR:', error.message);

    const statusCode = error.message.includes('Invalid API key') ? 401
                      : error.message.includes('Rate limit') ? 429
                      : error.message.includes('timeout') ? 408
                      : error.message.includes('too large') ? 413
                      : error.message.includes('Minimum')
                        || error.message.includes('Maximum')
                        || error.message.includes('required') ? 400
                      : 500;

    res.status(statusCode).json({
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Poll endpoint to check analysis results
app.get('/functions/v1/analysis-result/:analysisId', (req, res) => {
  const { analysisId } = req.params;
  const job = analysisJobs.get(analysisId);

  if (!job) {
    return res.status(404).json({
      error: 'Analysis not found',
      analysisId,
    });
  }

  if (job.status === 'processing') {
    return res.json({
      status: 'processing',
      analysisId,
      message: 'Analysis is still running...',
      elapsedSeconds: Math.round((Date.now() - job.startTime) / 1000),
    });
  }

  if (job.status === 'failed') {
    return res.status(400).json({
      status: 'failed',
      analysisId,
      error: job.error,
    });
  }

  if (job.status === 'completed') {
    return res.json({
      status: 'completed',
      analysisId,
      ...job.result,
    });
  }

  res.status(500).json({
    error: 'Unknown job status',
    status: job.status,
  });
});

// Serve the React app for client-side routes.
app.use((_req, res) => {
  res.sendFile(path.join(__dirname, 'dist/index.html'));
});

// ============================================================================
// START SERVER
// ============================================================================
app.listen(CONFIG.PORT, () => {
  console.log('\n' + '='.repeat(80));
  console.log('🚀 VEHICLE DAMAGE ANALYSIS SERVER - MULTI-IMAGE - READY');
  console.log('='.repeat(80));
  console.log(`📍 URL: http://localhost:${CONFIG.PORT}`);
  console.log(`🤖 AI Model: ${CONFIG.GEMINI_MODEL}`);
  console.log(`🔑 API Key: ${GEMINI_API_KEY.substring(0, 20)}...`);
  console.log(`📊 Image Support: ${CONFIG.MIN_IMAGES}-${CONFIG.MAX_IMAGES} images`);
  console.log(`📏 Max Image Size: ${CONFIG.MAX_IMAGE_SIZE / 1024 / 1024}MB per image`);
  console.log('\n📝 Endpoints:');
  console.log(`   GET  http://localhost:${CONFIG.PORT}/health`);
  console.log(`   POST http://localhost:${CONFIG.PORT}/api/demo-requests`);
  console.log(`   POST http://localhost:${CONFIG.PORT}/api/workshop-forms`);
  console.log(`   POST http://localhost:${CONFIG.PORT}/api/workshop-forms/abandoned`);
  console.log(`   POST http://localhost:${CONFIG.PORT}/functions/v1/analyze-damage`);
  console.log('\n✅ Server is ready to analyze vehicle damage with multiple images!');
  console.log('='.repeat(80) + '\n');
});

// ============================================================================
// EXPORTS FOR ANALYSIS-CORE MODULE
// Allow wreck-vision and workshop-app to import core analysis functions
// ============================================================================
module.exports = {
  // Constants
  DAMAGE_TYPE_INDEX,
  PARTS_DATABASE,
  DAMAGE_DESCRIPTIONS,
  VEHICLE_VIEW_KEYS,
  IMAGE_ANGLE_KEYS,

  // Core Analysis Functions
  getSeverityDecision,
  getMultipleDamageDecision,
  runAnalysisPipeline,
  enrichDamageData,

  // Helper Functions (if needed by other modules)
  parseStageJSON,
  normalizePartName,
  formatPartName,
  calculateCosts,

  // For testing/debugging
  callGeminiRaw,
  callGeminiWithImages,
  callGeminiTextOnly,
  compressImages,

  // Part name alias map — used by workshop app and any consumer to normalize Gemini output
  PART_NAME_ALIASES,
};
