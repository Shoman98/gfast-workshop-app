import { GoogleGenerativeAI } from '@google/generative-ai';

// ============================================================================
// 4-STAGE ANALYSIS SYSTEM (ported from gfast-b2c-v2)
// Stage 1: Image Quality + Vehicle ID
// Stage 2A: Damage Pre-Check (unbiased)
// Stage 2A-Verify: Counter-check (verify real vs false positives)
// Stage 2B: Full Detailed Damage Detection
// ============================================================================

// Damage type severity index
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
  'front bumper': 'upper_bumper', 'rear bumper': 'rear_bumper_upper', 'left door': 'front_left_door',
  'right door': 'front_right_door', 'left fender': 'front_left_fender', 'right fender': 'front_right_fender',
  'windshield': 'front_windshield', 'bonnet': 'hood', 'boot': 'trunk_door', 'tailgate': 'trunk_door',
};

function getSeverityDecision(damageType) {
  if (!damageType) return { decision: 'Replace', index: null, isKnownType: false };
  const normalizedType = damageType.toLowerCase().trim();
  let index = null, isKnownType = false;
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
  if (!isKnownType) return { decision: 'Replace', index: null, isKnownType: false };
  const decision = index < 4 ? 'Repair' : 'Replace';
  return { decision, index, isKnownType: true };
}

function findBestMatchPart(detectedPartName) {
  if (!detectedPartName) return null;
  const normalized = detectedPartName.toLowerCase().trim();
  if (PARTS_DATABASE.hasOwnProperty(normalized)) return PARTS_DATABASE[normalized];
  if (PART_NAME_ALIASES.hasOwnProperty(normalized)) {
    const aliasKey = PART_NAME_ALIASES[normalized];
    if (PARTS_DATABASE.hasOwnProperty(aliasKey)) return PARTS_DATABASE[aliasKey];
  }
  for (const [key, part] of Object.entries(PARTS_DATABASE)) {
    if (normalized.includes(key) || key.includes(normalized)) return part;
    if (normalized.includes(part.nameEn.toLowerCase()) || part.nameEn.toLowerCase().includes(normalized)) return part;
  }
  return null;
}

async function callGemini(prompt, images, model) {
  const imageParts = images.map(base64Image => ({
    inlineData: { mimeType: 'image/jpeg', data: base64Image },
  }));
  const response = await model.generateContent([...imageParts, { text: prompt }]);
  return response.response.text();
}

function parseJSON(content, stageName) {
  const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) ||
                    content.match(/```\s*([\s\S]*?)\s*```/) ||
                    content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`${stageName}: No JSON found`);
  try {
    return JSON.parse(jsonMatch[1] || jsonMatch[0]);
  } catch (err) {
    throw new Error(`${stageName}: JSON parse failed: ${err.message}`);
  }
}

// ============================================================================
// STAGE PROMPTS
// ============================================================================

function buildStage1Prompt(imageCount) {
  return `You are a vehicle image triage system. Analyze these ${imageCount} image(s) and return ONLY a JSON object.

YOUR TASKS:
1. Is this a vehicle? If not, set "isVehicle": false and return immediately.
2. Assess overall image quality (resolution, lighting, blur, obstruction).
3. List which regions of the vehicle are visible.

VISIBLE AREA KEYS — use ONLY these exact strings:
front_upper, front_middle, front_lower, left_side, right_side, rear_upper, rear_middle, rear_lower, tires, wheels, top_view

RULES:
- Only list an area as visible if you can clearly see parts belonging to that region.
- Do NOT detect or mention any damage.

Return this exact JSON:
\`\`\`json
{
  "isVehicle": true,
  "photoQuality": "Good",
  "visibleAreas": ["front_middle", "front_lower"],
  "notes": "brief coverage notes"
}
\`\`\``;
}

function buildStage2APrompt(visibleAreas) {
  return `You are a SKEPTICAL vehicle damage screener. Your goal is to AVOID FALSE POSITIVES.

DEFAULT ASSUMPTION: This vehicle has NO damage. You must PROVE damage exists beyond reasonable doubt.

THE FOLLOWING ARE **NOT** DAMAGE:
- Reflections on paint, shadows, factory body lines, trim seams
- Paint color variation, normal wear, dirt, water droplets
- Camera lens distortion, JPEG compression artifacts
- Any variation explainable by lighting or reflections

REAL DAMAGE requires:
- Clearly displaced metal/plastic with sharp edges
- Visible paint transfer (different color paint on surface)
- Cracked, shattered, or broken components
- Missing parts, exposed bare metal, or creases
- Parts hanging loose or severely misaligned

If you are LESS than 95% certain, classify as NOT damage.

Visible areas in images: ${JSON.stringify(visibleAreas)}

Answer with ONLY this JSON:
\`\`\`json
{
  "has_damage": true or false,
  "confidence": 0.0 to 1.0,
  "reasoning": "brief explanation"
}
\`\`\``;
}

function buildStage2AVerifyPrompt(stage2AClaims, visibleAreas) {
  return `You are a SECOND OPINION damage verifier. A previous AI analysis claimed to find this damage:

"${stage2AClaims}"

CHALLENGE these claims by looking at the SAME images:
1. Can I see a clear physical deformation breaking the factory contour?
2. Could this be reflection, shadow, lighting, or camera artifact?
3. Is there paint transfer, bare metal, cracked plastic, or missing piece?

If even ONE claimed damage could be a visual artifact, mark has_damage as false.

Visible areas: ${JSON.stringify(visibleAreas)}

Answer with ONLY this JSON:
\`\`\`json
{
  "has_damage": true or false,
  "confidence": 0.0 to 1.0,
  "reasoning": "detailed analysis"
}
\`\`\``;
}

function buildStage2BPrompt(visibleAreas) {
  return `You are a vehicle damage detection system.

CRITICAL: You may ONLY report damage on parts visible in these areas:
${JSON.stringify(visibleAreas)}

FALSE POSITIVE PREVENTION:
- Many vehicles are in PERFECT condition with NO damage.
- If the vehicle appears undamaged, return EMPTY "damages" array.
- Do NOT confuse reflections, shadows, panel gaps, trim seams, or normal wear with damage.
- NEVER combine two parts with "/" or "and" — emit SEPARATE entries per part.
- For paired parts (headlights, mirrors, doors), report only the SPECIFIC damaged side.

DETECTION RULES:
1. Report ONLY damage you can SEE — never guess.
2. Use exact part names from our taxonomy (snake_case).
3. If no damage is visible, return empty arrays — this is CORRECT for undamaged vehicles.
4. Confidence >= 0.70 goes in "damages", < 0.70 goes in "needs_check_parts".

Part Taxonomy (snake_case keys):
hood, front_windshield, front_left_headlight, front_right_headlight, upper_bumper,
front_left_fender, front_right_fender, front_left_door, front_right_door,
rear_left_door, rear_right_door, left_mirror, right_mirror, roof, trunk_door,
rear_bumper_upper, grille

Return this exact JSON:
\`\`\`json
{
  "damages": [
    {
      "part_name": "exact part name from taxonomy",
      "damage_type": "Dent|Scratch|Crack|Broken|Missing|Deformation|Misalignment|Rust|Buckled|Puncture",
      "description": "specific visual evidence",
      "confidence": 0.85
    }
  ],
  "needs_check_parts": [],
  "overall_confidence_score": 0.90,
  "summary": "brief summary or 'No damage detected'"
}
\`\`\``;
}

// ============================================================================
// 4-STAGE ANALYSIS ENGINE
// ============================================================================

export async function analyzeVehicleDamage(images, vehicleInfo, geminiApiKey) {
  console.log('\n🎬 Starting 4-Stage Analysis...');

  const client = new GoogleGenerativeAI(geminiApiKey);
  const model = client.getGenerativeModel({ model: 'gemini-3-flash-preview' });

  try {
    // ========== STAGE 1: Image Quality + Vehicle ID ==========
    console.log('\n📸 STAGE 1: Image Quality + Vehicle Identification');
    const stage1Prompt = buildStage1Prompt(images.length);
    const stage1Content = await callGemini(stage1Prompt, images, model);
    const stage1Result = parseJSON(stage1Content, 'Stage 1');

    console.log(`  ✓ Visible areas: [${(stage1Result.visibleAreas || []).join(', ')}]`);
    console.log(`  ✓ Photo quality: ${stage1Result.photoQuality}`);

    if (!stage1Result.isVehicle) {
      throw new Error('The provided images do not appear to show a vehicle.');
    }
    if (!stage1Result.visibleAreas || stage1Result.visibleAreas.length === 0) {
      throw new Error('Could not identify any visible vehicle areas.');
    }

    const visibleAreas = stage1Result.visibleAreas || [];

    // ========== STAGE 2A: Damage Pre-Check ==========
    console.log('\n🔍 STAGE 2A: Damage Pre-Check (Unbiased)');
    const stage2aPrompt = buildStage2APrompt(visibleAreas);
    const stage2aContent = await callGemini(stage2aPrompt, images, model);
    const stage2aResult = parseJSON(stage2aContent, 'Stage 2A');

    console.log(`  ✓ Has damage: ${stage2aResult.has_damage}`);
    console.log(`  ✓ Confidence: ${stage2aResult.confidence}`);

    // If no damage, return empty result
    if (!stage2aResult.has_damage) {
      console.log('  → No damage detected. Skipping full scan.\n');
      return {
        damages: [],
        vehicleInfo,
        timestamp: new Date().toISOString(),
        analysisMethod: '4-stage',
        stageResults: { stage1: stage1Result, stage2a: stage2aResult },
      };
    }

    // ========== STAGE 2A-VERIFY & 2B: Run in Parallel ==========
    console.log('\n✔️ STAGE 2A-Verify & 2B: Counter-Check + Full Scan (Parallel)');
    const stage2aVerifyPrompt = buildStage2AVerifyPrompt(stage2aResult.reasoning, visibleAreas);
    const stage2bPrompt = buildStage2BPrompt(visibleAreas);

    const [verifyContent, stage2bContent] = await Promise.all([
      callGemini(stage2aVerifyPrompt, images, model),
      callGemini(stage2bPrompt, images, model),
    ]);

    const verifyResult = parseJSON(verifyContent, 'Stage 2A-Verify');
    const stage2bResult = parseJSON(stage2bContent, 'Stage 2B');

    console.log(`  ✓ Verification has_damage: ${verifyResult.has_damage}`);
    console.log(`  ✓ Stage 2B damages found: ${(stage2bResult.damages || []).length}`);

    // If verification rejects damage, return empty result
    if (!verifyResult.has_damage) {
      console.log('  → Verification rejected pre-check. Treating as undamaged.\n');
      return {
        damages: [],
        vehicleInfo,
        timestamp: new Date().toISOString(),
        analysisMethod: '4-stage',
        stageResults: { stage1: stage1Result, stage2a: stage2aResult, stage2aVerify: verifyResult },
      };
    }

    // ========== MAP TO TAXONOMY & FILTER ==========
    console.log('\n🗂️ Mapping to Part Taxonomy');
    const detectedDamages = stage2bResult.damages || [];
    const mappedDamages = detectedDamages
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
        return null;
      })
      .filter(d => d !== null);

    console.log(`  ✓ Mapped ${mappedDamages.length} damages to taxonomy`);
    console.log(`  ✓ Filtered out unknown parts\n`);

    return {
      damages: mappedDamages,
      vehicleInfo,
      timestamp: new Date().toISOString(),
      analysisMethod: '4-stage',
      stageResults: {
        stage1: stage1Result,
        stage2a: stage2aResult,
        stage2aVerify: verifyResult,
        stage2b: stage2bResult,
      },
    };

  } catch (err) {
    console.error('❌ Analysis error:', err.message);
    throw err;
  }
}
