import { GoogleGenerativeAI } from '@google/generative-ai';

// ============================================================================
// DAMAGE TYPE SEVERITY INDEX - Rule-Based Decision System
// index < 4 → Repair, index >= 4 → Replace
// Unknown damage types ALWAYS default to "Replace"
// ============================================================================
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
  'split': 4,
};

// ============================================================================
// PARTS DATABASE - Part Taxonomy v3.1
// ============================================================================
const PARTS_DATABASE = {
  hood: { partId: 'PT_0001', price: 2800, nameEn: 'Hood', nameAr: 'كبوت', category: 'exterior_body', isSafety: false },
  front_windshield: { partId: 'PT_0002', price: 2100, nameEn: 'Front Windshield', nameAr: 'زجاج أمامي', category: 'exterior_body', isSafety: true },
  front_left_headlight: { partId: 'PT_0008', price: 5600, nameEn: 'Front Left Headlight', nameAr: 'فانوس أمامي شمال', category: 'exterior_body', isSafety: true },
  front_right_headlight: { partId: 'PT_0007', price: 5600, nameEn: 'Front Right Headlight', nameAr: 'فانوس أمامي يمين', category: 'exterior_body', isSafety: true },
  upper_bumper: { partId: 'PT_0009', price: 1610, nameEn: 'Upper Bumper', nameAr: 'اكصدام أمامي علوي', category: 'exterior_body', isSafety: false },
  front_left_fender: { partId: 'PT_0018', price: 2000, nameEn: 'Front Left Fender', nameAr: 'رفرف أمامي شمال', category: 'exterior_body', isSafety: false },
  front_right_fender: { partId: 'PT_0028', price: 2000, nameEn: 'Front Right Fender', nameAr: 'رفرف أمامي يمين', category: 'exterior_body', isSafety: false },
  front_left_door: { partId: 'PT_0020', price: 4200, nameEn: 'Front Left Door', nameAr: 'باب أمامي شمال', category: 'exterior_body', isSafety: true },
  front_right_door: { partId: 'PT_0030', price: 4200, nameEn: 'Front Right Door', nameAr: 'باب أمامي يمين', category: 'exterior_body', isSafety: true },
  rear_left_door: { partId: 'PT_0021', price: 3800, nameEn: 'Rear Left Door', nameAr: 'باب خلفي شمال', category: 'exterior_body', isSafety: false },
  rear_right_door: { partId: 'PT_0031', price: 3800, nameEn: 'Rear Right Door', nameAr: 'باب خلفي يمين', category: 'exterior_body', isSafety: false },
  left_mirror: { partId: 'PT_0023', price: 800, nameEn: 'Left Mirror', nameAr: 'مراية شمال', category: 'exterior_body', isSafety: true },
  right_mirror: { partId: 'PT_0034', price: 800, nameEn: 'Right Mirror', nameAr: 'مراية يمين', category: 'exterior_body', isSafety: true },
  roof: { partId: 'PT_0005', price: 5000, nameEn: 'Roof', nameAr: 'سقف', category: 'exterior_body', isSafety: false },
  trunk_door: { partId: 'PT_0050', price: 3500, nameEn: 'Trunk Door', nameAr: 'باب الشنطة', category: 'exterior_body', isSafety: false },
  rear_bumper_upper: { partId: 'PT_0041', price: 2030, nameEn: 'Rear Bumper Upper', nameAr: 'اكصدام خلفي علوي', category: 'exterior_body', isSafety: false },
  grille: { partId: 'PT_0006', price: 1050, nameEn: 'Grille', nameAr: 'شبكة أمامية', category: 'exterior_body', isSafety: false },
};

const PART_NAME_ALIASES = {
  'front bumper': 'upper_bumper',
  'rear bumper': 'rear_bumper_upper',
  'left door': 'front_left_door',
  'right door': 'front_right_door',
  'left fender': 'front_left_fender',
  'right fender': 'front_right_fender',
  'windshield': 'front_windshield',
  'bonnet': 'hood',
  'boot': 'trunk_door',
  'tailgate': 'trunk_door',
};

/**
 * Get severity decision (Repair/Replace) based on damage type index
 */
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

/**
 * Find best matching part from database using fuzzy matching
 */
function findBestMatchPart(detectedPartName) {
  if (!detectedPartName) return null;

  const normalized = detectedPartName.toLowerCase().trim();

  // Direct key match
  if (PARTS_DATABASE.hasOwnProperty(normalized)) {
    return PARTS_DATABASE[normalized];
  }

  // Check aliases
  if (PART_NAME_ALIASES.hasOwnProperty(normalized)) {
    const aliasKey = PART_NAME_ALIASES[normalized];
    if (PARTS_DATABASE.hasOwnProperty(aliasKey)) {
      return PARTS_DATABASE[aliasKey];
    }
  }

  // Fuzzy match - check containment
  for (const [key, part] of Object.entries(PARTS_DATABASE)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return part;
    }
    if (normalized.includes(part.nameEn.toLowerCase()) || part.nameEn.toLowerCase().includes(normalized)) {
      return part;
    }
  }

  return null;
}

/**
 * Analyze vehicle damage using Gemini API
 */
export async function analyzeVehicleDamage(images, vehicleInfo, geminiApiKey) {
  try {
    console.log('🤖 جاري بدء تحليل Gemini...');

    const client = new GoogleGenerativeAI(geminiApiKey);
    const model = client.getGenerativeModel({ model: 'gemini-3-flash-preview' });

    const prompt = `أنت متخصص في تقييم أضرار المركبات. قم بتحليل الصور المرفقة لمركبة ${vehicleInfo.year} ${vehicleInfo.make} ${vehicleInfo.model} وحدد جميع الأضرار المرئية.

لكل جزء معطوب، قم بإرجاع استجابة JSON بالصيغة الدقيقة التالية:
{
  "damages": [
    {
      "part_name": "اسم الجزء بالإنجليزية",
      "damage_type": "نوع الضرر",
      "confidence": 0.95,
      "location": "موقع الضرر"
    }
  ],
  "summary": "ملخص الأضرار المكتشفة"
}

التعليمات:
- قم بفحص شامل لجميع أجزاء المركبة المرئية
- حدد كل ضرر بوضوح (خدوش،凹دات، كسور، إلخ)
- توفير درجة ثقة من 0 إلى 1
- إرجاع JSON فقط بدون نصوص أخرى`;

    const imageParts = images.map(base64Image => ({
      inlineData: {
        mimeType: 'image/jpeg',
        data: base64Image,
      },
    }));

    console.log('📸 عدد الصور:', images.length);
    console.log('🔄 جاري إرسال الصور إلى Gemini...');

    let response;
    try {
      // Set a timeout for the Gemini API call (120 seconds)
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Gemini API timeout (120s)')), 120000)
      );

      response = await Promise.race([
        model.generateContent([
          ...imageParts,
          { text: prompt },
        ]),
        timeoutPromise,
      ]);
    } catch (apiErr) {
      console.error('❌ خطأ في استدعاء Gemini:', apiErr.message);
      throw new Error(`Gemini API error: ${apiErr.message}`);
    }

    console.log('📖 تم استقبال الاستجابة من Gemini');

    const responseText = response.response.text();
    console.log('📝 نص الاستجابة (أول 200 حرف):', responseText.substring(0, 200));

    // Parse Gemini response
    let damages = [];
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const detectedDamages = parsed.damages || [];

        console.log('✅ تم تحليل JSON - الأضرار المكتشفة:', detectedDamages.length);

        damages = detectedDamages
          .map(damage => {
            const matchedPart = findBestMatchPart(damage.part_name);
            const severityDecision = getSeverityDecision(damage.damage_type);

            if (matchedPart) {
              return {
                part_name_en: matchedPart.nameEn,
                part_name_ar: matchedPart.nameAr,
                damage_type: damage.damage_type || 'Unknown',
                confidence: damage.confidence || 0.8,
                severity_label: severityDecision.decision,
                price: matchedPart.price || 1000,
                is_ai_detected: true,
                partId: matchedPart.partId,
                category: matchedPart.category,
                isSafety: matchedPart.isSafety,
              };
            }
            return null; // Filter out unknown parts
          })
          .filter(d => d !== null); // Remove null entries
      } else {
        console.log('⚠️ لم يتم العثور على JSON في الاستجابة');
      }
    } catch (parseErr) {
      console.error('⚠️ فشل تحليل JSON:', parseErr.message);
      console.error('   النص الكامل:', responseText);
    }

    console.log('✨ تم إكمال التحليل - الأضرار:', damages.length);

    return {
      damages,
      vehicleInfo,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    console.error('❌ خطأ في analyzeVehicleDamage:', err.message);
    throw err;
  }
}
