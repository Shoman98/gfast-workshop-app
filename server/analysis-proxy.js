/**
 * PROXY ANALYSIS - Calls gfast-b2c-v2 /functions/v1/analyze-damage endpoint
 * Uses the same Gemini API key with full 4-stage analysis + prompt structure
 * Maps results back to workshop part taxonomy for display
 */

// Part taxonomy mapping (workshop parts → gfast-b2c parts)
const WORKSHOP_TO_GFAST_PARTS = {
  hood: 'hood',
  front_windshield: 'front_windshield',
  front_left_headlight: 'front_left_headlight',
  front_right_headlight: 'front_right_headlight',
  upper_bumper: 'upper_bumper',
  front_left_fender: 'front_left_fender',
  front_right_fender: 'front_right_fender',
  front_left_door: 'front_left_door',
  front_right_door: 'front_right_door',
  rear_left_door: 'rear_left_door',
  rear_right_door: 'rear_right_door',
  left_mirror: 'left_mirror',
  right_mirror: 'right_mirror',
  roof: 'roof',
  trunk_door: 'trunk_door',
  rear_bumper_upper: 'rear_bumper_upper',
  grille: 'grille',
};

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

const DAMAGE_TYPE_INDEX = {
  'dent': 2, 'scratch': 1, 'scuff marks': 1, 'scuff': 1, 'buckled': 3, 'buckling': 3,
  'severe buckling': 4, 'broken': 5, 'crack': 5, 'cracked': 5, 'severe cracking': 5,
  'frame damage': 4, 'structural integrity': 5, 'deformation': 4, 'severe deformation': 4,
  'impact deformation': 3, 'structural deformation': 5, 'misaligned': 1, 'misalignment': 1,
  'bent': 1, 'missing': 5, 'detached': 5, 'scrape': 3, 'torn': 4, 'tear': 5,
  'pushed forward': 3, 'pushed back': 3, 'pushed inward': 3, 'rust': 3,
  'shattered lens': 5, 'broken housing': 5, 'internal damage': 5, 'spider-web fractures': 5,
  'scratches on lens': 2, 'leaks': 3, 'leak': 3, 'airbag deployment': 5,
  'creasing': 2, 'heat deformation': 5, 'melted': 5, 'surface oxidation': 3,
  'paint failure': 2, 'paint damage': 2, 'paint scorching': 5, 'soot accumulation': 5,
  'heavy soot': 5, 'total paint loss': 4, 'charred': 4, 'paint scraping': 3,
  'cracking': 5, 'scratched': 1, 'dented': 2, 'rusted': 3, 'corroded': 3, 'corrosion': 3,
  'chipped': 2, 'chip': 2, 'peeling': 2, 'faded': 1, 'discolored': 1, 'warped': 3,
  'punctured': 4, 'puncture': 4, 'shattered': 5, 'crushed': 5, 'collapsed': 5,
  'loose': 2, 'separated': 3, 'split': 4,
};

function getSeverityDecision(damageType) {
  if (!damageType) return { decision: 'Replace', index: null };
  const normalized = damageType.toLowerCase().trim();
  let index = DAMAGE_TYPE_INDEX[normalized];

  if (index === undefined) {
    for (const [knownType, idx] of Object.entries(DAMAGE_TYPE_INDEX)) {
      if (normalized.includes(knownType) || knownType.includes(normalized)) {
        index = idx;
        break;
      }
    }
  }

  if (index === undefined) return { decision: 'Replace', index: null };
  return { decision: index < 4 ? 'Repair' : 'Replace', index };
}

function normalizePartName(partName) {
  if (!partName) return null;
  const normalized = partName.toLowerCase().trim().replace(/\s+/g, '_');
  return WORKSHOP_TO_GFAST_PARTS[normalized] || normalized;
}

/**
 * Proxy analysis to gfast-b2c-v2 backend
 * Calls /functions/v1/analyze-damage and maps results
 */
export async function analyzeVehicleDamage(images, vehicleInfo, geminiApiKey) {
  console.log('\n🔗 Proxying to gfast-b2c-v2 analyze-damage endpoint...');

  const gfastUrl = process.env.GFAST_B2C_URL || 'http://localhost:3000';

  try {
    console.log(`📡 Target: ${gfastUrl}/functions/v1/analyze-damage`);
    console.log(`🚗 Vehicle: ${vehicleInfo.year} ${vehicleInfo.make} ${vehicleInfo.model}`);
    console.log(`📸 Images: ${images.length}`);

    const response = await fetch(`${gfastUrl}/functions/v1/analyze-damage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        images: images,
        vehicleInfo: vehicleInfo,
        // Use image views for better analysis (defaulting to simple views)
        imageViews: ['front', 'left', 'right', 'back'].slice(0, images.length),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`gfast-b2c API error: ${response.status} - ${errorText.substring(0, 200)}`);
    }

    const gfastResult = await response.json();
    console.log(`✅ gfast-b2c analysis complete`);
    console.log(`   Damages found: ${(gfastResult.damages || []).length}`);

    // ========== MAP RESULTS TO WORKSHOP FORMAT ==========
    const mappedDamages = (gfastResult.damages || [])
      .map(damage => {
        // Normalize part name to workshop taxonomy
        const normalizedPart = normalizePartName(damage.nameEn || damage.part_name || damage.partName);
        const workshopPart = PARTS_DATABASE[normalizedPart];

        if (!workshopPart) {
          console.log(`⚠️  Skipping unknown part: ${damage.nameEn || damage.part_name}`);
          return null;
        }

        // Get severity decision from damage type
        const damageType = damage.damage_type || damage.damageType || 'Unknown';
        const severityDecision = getSeverityDecision(damageType);

        // Map gfast-b2c result to workshop format
        return {
          part_name_en: workshopPart.nameEn,
          part_name_ar: workshopPart.nameAr,
          damage_type: damageType,
          confidence: damage.confidence || 0.8,
          severity_label: severityDecision.decision,
          price: workshopPart.price || 1000,
          is_ai_detected: true,
          partId: workshopPart.partId,
          category: workshopPart.category,
          isSafety: workshopPart.isSafety,
        };
      })
      .filter(d => d !== null);

    console.log(`✅ Mapped ${mappedDamages.length} damages to workshop taxonomy`);

    return {
      damages: mappedDamages,
      vehicleInfo,
      timestamp: new Date().toISOString(),
      analysisMethod: '4-stage-gfast-b2c-proxy',
      overallConfidence: gfastResult.overallConfidence || 75,
      gfastAnalysis: gfastResult, // Include full gfast result for debugging
    };

  } catch (err) {
    console.error('❌ Proxy analysis error:', err.message);
    throw err;
  }
}
