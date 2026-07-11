/**
 * REAL GEMINI ANALYSIS - Exact copy from wreck-vision local-server.cjs
 * Using Google Gemini API with Vision for vehicle damage analysis
 * BYTE-IDENTICAL to wreck-vision - NO changes to prompts or logic
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import sharp from 'sharp';

const GEMINI_MODEL = 'gemini-3.5-flash';

// Damage type severity index - EXACT copy from wreck-vision
const DAMAGE_TYPE_INDEX = {
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
  'shattered lens': 5,
  'broken housing': 5,
  'internal damage': 5,
  'spider-web fractures': 5,
  'spider web fractures': 5,
  'scratches on lens': 2,
  'leaks': 3,
  'leak': 3,
  'airbag deployment': 5,
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

function getSeverityDecision(damageType) {
  if (!damageType) {
    return { decision: 'Replace', index: null, isKnownType: false };
  }

  const normalizedType = damageType.toLowerCase().trim();
  let index = null;
  let isKnownType = false;

  if (DAMAGE_TYPE_INDEX.hasOwnProperty(normalizedType)) {
    index = DAMAGE_TYPE_INDEX[normalizedType];
    isKnownType = true;
  } else {
    for (const [knownType, idx] of Object.entries(DAMAGE_TYPE_INDEX)) {
      if (normalizedType.includes(knownType) || knownType.includes(normalizedType)) {
        index = idx;
        isKnownType = true;
        break;
      }
    }
  }

  if (!isKnownType) {
    return { decision: 'Replace', index: null, isKnownType: false };
  }

  const decision = index < 4 ? 'Repair' : 'Replace';
  return { decision, index, isKnownType: true };
}

async function compressImage(imageBase64, quality = 75, maxWidth = 1920) {
  try {
    let imageData = imageBase64;
    let mimeType = 'image/jpeg';

    if (imageBase64.startsWith('data:')) {
      const matches = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
      if (matches) {
        mimeType = matches[1];
        imageData = matches[2];
      }
    }

    const buffer = Buffer.from(imageData, 'base64');
    let compressed = sharp(buffer);

    const metadata = await compressed.metadata();
    if (metadata.width > maxWidth) {
      compressed = compressed.resize(maxWidth, null, { withoutEnlargement: true });
    }

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
    console.log(`⚠️ Image compression failed: ${error.message}, using original`);
    return imageBase64;
  }
}

export async function compressImages(images, quality = 75, maxWidth = 1920) {
  const originalSize = images.reduce((sum, img) => sum + img.length, 0);
  const compressed = await Promise.all(
    images.map(img => compressImage(img, quality, maxWidth))
  );
  const compressedSize = compressed.reduce((sum, img) => sum + img.length, 0);
  const reduction = Math.round(((originalSize - compressedSize) / originalSize) * 100);

  console.log(`📦 IMAGE COMPRESSION: ${(originalSize / 1024 / 1024).toFixed(2)}MB → ${(compressedSize / 1024 / 1024).toFixed(2)}MB (-${reduction}%)`);
  return compressed;
}

export async function callGeminiWithImages(prompt, images, apiKey) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

  const imageParts = images.map(base64Image => {
    const cleanBase64 = base64Image.includes(',')
      ? base64Image.split(',')[1]
      : base64Image;

    return {
      inlineData: {
        mimeType: 'image/jpeg',
        data: cleanBase64,
      },
    };
  });

  const result = await model.generateContent([...imageParts, prompt]);
  return result.response.text();
}

export { DAMAGE_TYPE_INDEX, getSeverityDecision };

// PARTS_DATABASE - 187 vehicle parts with pricing and categories - EXACT from wreck-vision
export const PARTS_DATABASE = {
  // EXTERIOR BODY PARTS (80+ parts)
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

  // INTERIOR PARTS (20 parts)
  tableau: { price: 0, nameEn: 'tableau', nameAr: 'تابلوه', partId: 'PT_0067', category: 'interior' },
  dashboard_internal_structure: { price: 0, nameEn: 'dashboard internal structure', nameAr: 'تابلوه', partId: 'PT_0068', category: 'interior' },
  washer_fluid_reservoir: { price: 0, nameEn: 'washer fluid reservoir', nameAr: 'قربه مياه مساحات', partId: 'PT_0069', category: 'interior' },

  // AIRBAGS & SAFETY (30 parts)
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

  // MECHANICAL PARTS (40 parts)
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

  // CHASSIS & STRUCTURAL PARTS (17+ parts)
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

// Part name aliases mapping - EXACT copy from wreck-vision local-server.cjs
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

export function enrichDamageData(rawAnalysis, vehicleInfo) {
  if (!rawAnalysis) {
    return { damages: [], needs_check_parts: [] };
  }

  // Enrich confirmed damages (confidence >= 0.70)
  const enriched = (rawAnalysis.damages || []).map(damage => {
    const partKey = normalizePartName(damage.part_name_en);
    const partInfo = PARTS_DATABASE[partKey] || {};

    return {
      part_name_en: damage.part_name_en || partInfo.nameEn || 'Unknown Part',
      part_name_ar: damage.part_name_ar || partInfo.nameAr || 'قطعة غير معروفة',
      damage_type: damage.damage_type || 'unknown',
      severity_label: damage.severity_label || getSeverityDecision(damage.damage_type).decision,
      confidence: damage.confidence || 0.5,
      is_ai_detected: damage.is_ai_detected !== false,
      price: partInfo.price || 0,
      partId: partInfo.partId || null,
      category: partInfo.category || 'exterior',
      isUnmapped: !PARTS_DATABASE[partKey],
    };
  });

  // Enrich parts needing manual verification (confidence < 0.70)
  const needsCheck = (rawAnalysis.needs_check_parts || []).map(part => {
    const partKey = normalizePartName(part.part_name_en);
    const partInfo = PARTS_DATABASE[partKey] || {};

    return {
      part_name_en: part.part_name_en || partInfo.nameEn || 'Unknown Part',
      part_name_ar: part.part_name_ar || partInfo.nameAr || 'قطعة غير معروفة',
      damage_type: part.damage_type || 'unknown',
      severity_label: part.severity_label || getSeverityDecision(part.damage_type).decision,
      confidence: part.confidence || 0.5,
      is_ai_detected: part.is_ai_detected !== false,
      price: partInfo.price || 0,
      partId: partInfo.partId || null,
      category: partInfo.category || 'exterior',
      isUnmapped: !PARTS_DATABASE[partKey],
    };
  });

  console.log(`📊 enrichDamageData: ${enriched.length} damages, ${needsCheck.length} needs_check`);
  return { damages: enriched, needs_check_parts: needsCheck };
}
