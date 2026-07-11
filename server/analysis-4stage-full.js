import { GoogleGenerativeAI } from '@google/generative-ai';
import { PARTS_DATABASE, DAMAGE_TYPE_INDEX, getSeverityDecision as getServerSeverityDecision, PART_NAME_ALIASES } from './gemini-analysis.js';

// ============================================================================
// 4-STAGE ANALYSIS WITH FULL PROMPT STRUCTURE (from gfast-b2c-v2)
// Includes: 17-Slot Image Protocol, View Labels, Angle Labels,
//           Damage Descriptions, Area-to-Parts Mapping
// ============================================================================

// ============================================================================
// IMAGE PROTOCOL & VIEW/ANGLE LABELS
// ============================================================================

const VEHICLE_VIEW_LABELS = {
  front: 'FRONT (front-facing exterior — hood, grille, front bumper, headlights, windshield)',
  back: 'BACK / REAR (rear-facing exterior — trunk, rear bumper, taillights, rear windshield)',
  left: 'LEFT SIDE (driver-side exterior, full-length — left fender, left doors, left rocker, left quarter panel, left mirror)',
  right: 'RIGHT SIDE (passenger-side exterior, full-length — right fender, right doors, right rocker, right quarter panel, right mirror)',
  top: 'TOP / ROOF (overhead view — roof panel, sunroof/roof window, roof trims, antenna)',
  interior: 'INTERIOR (cabin shot with ENGINE OFF — dashboard/steering wheel, deployed/undeployed airbags, seatbelts)',
  front_right: 'FRONT-RIGHT CORNER (close-up of front-right corner — right headlight, right end of front bumper, right edge of hood, right front fender)',
  front_left: 'FRONT-LEFT CORNER (close-up of front-left corner — left headlight, left end of front bumper, left edge of hood, left front fender)',
  rear_right: 'REAR-RIGHT CORNER (close-up of rear-right corner — right taillight, right end of rear bumper, right edge of trunk, right rear quarter panel)',
  rear_left: 'REAR-LEFT CORNER (close-up of rear-left corner — left taillight, left end of rear bumper, left edge of trunk, left rear quarter panel)',
  front_chassis_rails: 'FRONT CHASSIS RAILS (structural shot of front chassis rails / front frame rails / front cross members)',
  rear_chassis: 'REAR CHASSIS (structural shot of rear chassis / rear frame rails / rear cross members)',
  engine_bay: 'ENGINE BAY (open hood — engine block, mounts, radiator/AC condenser, cooling fan, radiator core support, wiring harness)',
  fluid_leaks: 'FLUID LEAKS (under-car shot looking for oil/coolant/fuel/brake-fluid puddles or drips — undercarriage staining)',
  dashboard_running: 'DASHBOARD WITH ENGINE RUNNING (instrument cluster while the engine is ON — check for active warning lights: check engine, ABS, airbag, oil pressure, battery, coolant temp)',
};

const IMAGE_ANGLE_LABELS = {
  wide: 'WIDE ANGLE (full-section overview)',
  close: 'CLOSE-UP ANGLE (zoomed-in detail of a specific damage on this section)',
};

// ============================================================================
// DAMAGE DESCRIPTIONS DATABASE
// ============================================================================

function generateDamageDescriptionsReference() {
  return `
DAMAGE TYPE DESCRIPTIONS (Visual Indicators):

1. DENT — Localized deformation of sheet metal without paint loss
   Visual: Inward depression, smooth surface, metallic sheen preserved
   Parts: Fenders, doors, hood, trunk, roof, rocker panels, quarter panels

2. SCRATCH — Linear surface abrasion to paint or clear coat
   Visual: Line marks, no depth, paint texture visible, may see primer if deep
   Parts: All painted surfaces, glass, mirrors

3. CRACK — Fracture in material running in linear/branching pattern
   Visual: Sharp lines, often radiating, may show white stress lines
   Parts: Windshield, lights, plastic trim, bumpers, composite panels

4. BROKEN — Complete fracture or severing of component
   Visual: Part missing or hanging, sharp edges, interior exposed
   Parts: Lights, mirrors, trim pieces, bumper sections, door handles

5. MISSING — Part or section completely absent
   Visual: Gap where component should be, may see mounting hardware
   Parts: Trim, mirrors, caps, bumper sections, grille pieces

6. DEFORMATION — Large-scale shape change without fracture
   Visual: Warped contour, unnatural curves, structural misalignment
   Parts: Hood, doors, roof, frame components

7. MISALIGNMENT — Component offset from intended position
   Visual: Uneven gaps, doors not flush, panels not aligned
   Parts: Doors, hood, trunk, bumper, body panels

8. RUST — Oxidation of bare metal surface
   Visual: Orange/brown discoloration, bubbling paint, surface pitting
   Parts: Undercarriage, chassis, rocker panels, door edges

9. BUCKLED — Inward folding or collapsing of material
   Visual: Multiple crease lines, structural compromise, inward buckling
   Parts: Chassis rails, frame members, door frames

10. PAINT DAMAGE — Loss or discoloration of paint layer
    Visual: Bare substrate visible, color mismatch, peeling
    Parts: All painted surfaces

11. CREASE — Sharp fold line in sheet metal
    Visual: Defined linear depression with defined edges
    Parts: Fenders, hood, doors, roof

12. ELECTRICAL EXPOSURE — Bare wiring or electrical components visible
    Visual: Copper/colored wires, connectors, modules exposed
    Parts: Harness, sensors, control modules

13. STRUCTURAL INTEGRITY — Compromise of load-bearing components
    Visual: Frame bending, pillar damage, chassis misalignment
    Parts: A/B/C pillars, frame rails, subframe

14. AIRBAG DEPLOYMENT — Airbag system activation
    Visual: Torn steering wheel cover, deployed airbag visible, interior disturbance
    Parts: Steering wheel, seat cushions, interior panels
`;
}

// ============================================================================
// AREA-TO-PARTS MAPPING
// ============================================================================

function buildAreaToPartsMap() {
  return {
    front_upper: ['hood', 'grille', 'front_car_logo', 'a_pillars', 'roof'],
    front_middle: ['upper_bumper', 'front_left_headlight', 'front_right_headlight', 'front_left_fender', 'front_right_fender'],
    front_lower: ['lower_bumper', 'lower_grille', 'front_left_fog_trim', 'front_right_fog_trim'],
    left_side: ['left_mirror', 'left_rocker_panel', 'front_left_door', 'rear_left_door', 'left_quarter_panel', 'front_left_door_window', 'rear_left_door_window'],
    right_side: ['right_mirror', 'right_rocker_panel', 'front_right_door', 'rear_right_door', 'rear_right_quarter_panel', 'front_right_door_window', 'rear_right_door_window'],
    rear_upper: ['c_pillar', 'roof'],
    rear_middle: ['rear_left_headlight_inner', 'rear_left_headlight_outer', 'rear_right_headlight_inner', 'rear_right_headlight_outer'],
    rear_lower: ['rear_bumper_upper', 'rear_bumper_lower', 'trunk_door'],
    tires: ['front_left_tire', 'front_right_tire', 'rear_left_tire', 'rear_right_tire'],
    wheels: ['front_left_wheel', 'front_right_wheel', 'rear_left_wheel', 'rear_right_wheel'],
    top_view: ['roof', 'roof_window', 'roof_trims', 'aerial', 'a_pillars', 'b_pillar', 'c_pillar'],
  };
}

// PARTS_DATABASE and DAMAGE_TYPE_INDEX imported from gemini-analysis.js

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

// ============================================================================
// VIEW LABELS HEADER BUILDER (with 17-Slot Protocol Info)
// ============================================================================

function buildViewLabelsHeader(imageViews = [], imageAngles = []) {
  if (!Array.isArray(imageViews) || imageViews.length === 0) return '';

  const lines = imageViews
    .map((v, i) => {
      const labelText = VEHICLE_VIEW_LABELS[v] || v.toUpperCase();
      const a = (Array.isArray(imageAngles) && imageAngles[i]) || 'wide';
      const angleText = IMAGE_ANGLE_LABELS[a] || a.toUpperCase();
      return `  • IMAGE ${i + 1} OF ${imageViews.length} → VIEW: ${labelText} | ANGLE: ${angleText}`;
    })
    .join('\n');

  return `\n--- IMAGE VIEW LABELS (17-SLOT PROTOCOL) ---
The user follows a standardized image protocol with optional slots. Each image slot is clearly labeled with its VIEW and ANGLE.

SECTION A — PERIMETER (general context, WIDE angle):
  1. front (wide)        2. back (wide)         3. right (full length, wide)
  4. left  (full length, wide)                  5. top / roof (wide, from above)
  6. interior (dashboard / steering wheel, ENGINE OFF — detect deployed airbags)

SECTION B — ZONE-SPECIFIC DEEP DIVES (CLOSE-UP angle):
  7. front (close)       8. front_right (corner close)    9. front_left (corner close)
 10. back  (close)      11. rear_right  (corner close)   12. rear_left  (corner close)

SECTION C — STRUCTURAL & CHASSIS (WIDE, optional — only present after disassembly):
 13. front_chassis_rails    14. rear_chassis

SECTION D — MECHANICAL (WIDE):
 15. engine_bay     16. fluid_leaks (under-car staining)     17. dashboard_running (ENGINE ON — warning lights)

VIEW vs ANGLE:
  • WIDE = full overview (primary evidence for damage)
  • CLOSE-UP = zoomed detail used to CONFIRM or refine damage already visible in WIDE shot

CRITICAL RULES:
- When multiple images share same view → they are alternate angles of SAME area (cross-reference to confirm/rule out damage)
- CLOSE-UPs without matching WIDE shots are valid but lower confidence
- interior (engine OFF) vs dashboard_running (engine ON) serve different purposes
- Section C/D damage requires explicit image evidence — do NOT infer from exterior photos alone

PER-IMAGE ORDER:
${lines}
--- END VIEW LABELS ---\n`;
}

// ============================================================================
// GEMINI API CALLS WITH ANNOTATIONS
// ============================================================================

async function callGeminiWithImages(prompt, images, imageViews, imageAngles, model) {
  const viewHeader = buildViewLabelsHeader(imageViews, imageAngles);
  const fullPrompt = viewHeader ? `${viewHeader}\n${prompt}` : prompt;
  const parts = [{ text: fullPrompt }];

  images.forEach((imageBase64, idx) => {
    const view = Array.isArray(imageViews) ? imageViews[idx] : null;
    const angle = (Array.isArray(imageAngles) && imageAngles[idx]) || 'wide';
    if (view) {
      const labelText = VEHICLE_VIEW_LABELS[view] || view.toUpperCase();
      const angleText = IMAGE_ANGLE_LABELS[angle] || angle.toUpperCase();
      const annotation = `\n[IMAGE ${idx + 1} OF ${images.length} — VIEW: ${labelText} — ANGLE: ${angleText}]`;
      parts.push({ text: annotation });
    }
    parts.push({ inline_data: { mime_type: 'image/jpeg', data: imageBase64 } });
  });

  const response = await model.generateContent({
    contents: [{ parts }],
    generationConfig: { temperature: 0, maxOutputTokens: 8192, topP: 1.0, seed: 42 }
  });

  return response.response.text();
}

async function callGeminiTextOnly(prompt, model) {
  const response = await model.generateContent({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 4096, topP: 1.0, seed: 42 }
  });
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
// STAGE PROMPTS (WITH FULL STRUCTURE)
// ============================================================================

function buildStage1Prompt(imageCount) {
  return `You are a vehicle image triage system. Analyze these ${imageCount} image(s) and return ONLY a JSON object.

YOUR TASKS:
1. Is this a vehicle? If not, set "isVehicle": false and return immediately.
2. Assess overall image quality (resolution, lighting, blur, obstruction).
3. List which regions of the vehicle are visible.

VISIBLE AREA KEYS (use EXACT strings):
front_upper, front_middle, front_lower, left_side, right_side, rear_upper, rear_middle, rear_lower, tires, wheels, top_view, undercarriage, chassis, interiors, mechanicals

RULES:
- Only list an area as visible if you can clearly see parts in that region.
- Do NOT detect or mention any damage — that is handled in Stage 2.
- Lower overall confidence proportionally if major views are missing.

Return this exact JSON:
\`\`\`json
{
  "isVehicle": true,
  "photoQuality": "Good",
  "qualityIssues": [],
  "visibleAreas": ["front_middle", "front_lower"],
  "imageCount": ${imageCount},
  "notes": "brief coverage notes"
}
\`\`\``;
}

function buildStage2APrompt(visibleAreas) {
  return `You are a SKEPTICAL damage screener. Goal: AVOID FALSE POSITIVES.

DEFAULT ASSUMPTION: This vehicle has NO damage. PROVE otherwise.

THE FOLLOWING ARE **NOT** DAMAGE:
- Reflections, shadows, factory body lines, trim seams, paint variation
- Normal wear, dirt, water droplets, camera artifacts, JPEG compression
- Dark areas from angles/lighting, matte vs glossy transitions

REAL DAMAGE requires ONE of:
- Clearly displaced metal/plastic breaking factory contour with sharp edges
- Visible paint transfer (different color paint on surface)
- Cracked, shattered, or broken components
- Missing parts, exposed bare metal/primer, sharp creases
- Parts hanging loose or severely misaligned

If LESS than 95% certain → classify as NOT damage.

Visible areas: ${JSON.stringify(visibleAreas)}

Answer with ONLY:
\`\`\`json
{
  "has_damage": true or false,
  "confidence": 0.0 to 1.0,
  "reasoning": "brief explanation"
}
\`\`\``;
}

function buildStage2AVerifyPrompt(stage2AClaims, visibleAreas) {
  return `You are a SECOND OPINION damage verifier. Previous analysis claimed:

"${stage2AClaims}"

CHALLENGE these claims:
1. Can I see clear physical deformation breaking factory contour?
2. Could this be reflection, shadow, lighting, or camera artifact?
3. Is there paint transfer, bare metal, cracked plastic, or missing piece?

If even ONE claimed damage could be a visual artifact → mark has_damage as false.

Visible areas: ${JSON.stringify(visibleAreas)}

Answer with ONLY:
\`\`\`json
{
  "has_damage": true or false,
  "confidence": 0.0 to 1.0,
  "reasoning": "detailed analysis of each claim"
}
\`\`\``;
}

function buildStage2BPrompt(visibleAreas, stage1Result) {
  return `You are a vehicle damage detection system analyzing images.

CRITICAL CONSTRAINT — READ CAREFULLY:
You may ONLY report damage on parts that belong to the following visible areas:
${JSON.stringify(visibleAreas)}

CONFIDENCE SCORING RULES (MANDATORY - FOLLOW EXACTLY):
- 0.80 to 1.00: OBVIOUS damage. Crystal clear, unmistakable. Visual evidence is unambiguous (deep dents, shattered glass, broken mirrors, clear cracks).
  Examples: 0.92, 0.95, 0.98 (NOT 1 or 100)
- 0.70 to 0.79: PROBABLE damage. Good visual evidence but slight uncertainty. Go to "damages" array.
  Examples: 0.72, 0.75, 0.78
- 0.40 to 0.69: POSSIBLE damage. Visual signs observed but could be artifact, reflection, shadow, or minor issue. ALWAYS report these in "needs_check_parts" for human inspection.
  Examples: 0.52, 0.60, 0.68, 0.42, 0.45
- Below 0.40: DO NOT REPORT. Too speculative.

CRITICAL INSTRUCTION - ALWAYS POPULATE NEEDS_CHECK:
- When in doubt about HIGH confidence (≥ 0.70), do NOT report it. But DO report MODERATE confidence (0.40-0.69) items in "needs_check_parts" for physical inspection.
- A confidence of 0.40-0.69 means it MIGHT be damage — report these in "needs_check_parts" even if you're unsure.
- The technician will physically inspect needs_check_parts to confirm or reject them.
- This is a FALSE POSITIVE PREVENTION strategy: Report uncertain findings for human verification rather than guessing wrong.

MUST SPLIT RESULTS INTO TWO ARRAYS:
1. "damages": Parts with confidence >= 0.70 (confirmed high-confidence findings)
   Example confidences: 0.75, 0.85, 0.92, 0.98
2. "needs_check_parts": Parts with 0.40-0.69 (possible findings, human inspection required)
   Example confidences: 0.52, 0.60, 0.68, 0.42, 0.45

CONFIDENCE SPLIT EXAMPLES (FOLLOW EXACTLY):
- Obvious deep dent with unambiguous edges → 0.92 confidence → "damages" (≥0.70)
- Clear scratch visible in multiple images → 0.85 confidence → "damages" (≥0.70)
- Slight crease that might be a dent or shadow → 0.65 confidence → "needs_check_parts" (0.40-0.69)
- Mirror that looks cracked but could be dust or reflection → 0.58 confidence → "needs_check_parts" (0.40-0.69)
- Area with some indicator of damage but very ambiguous → 0.45 confidence → "needs_check_parts" (0.40-0.69)
- Almost imperceptible observation with no clear evidence → DO NOT REPORT (< 0.40)

IMPORTANT — FALSE POSITIVE PREVENTION:
- Many vehicles are in PERFECT condition with NO damage. Do NOT hallucinate or invent damage.
- If the vehicle appears clean and undamaged, return EMPTY arrays for "damages" and "needs_check_parts".
- Do NOT confuse the following with actual damage:
  * Normal reflections, shadows, or lighting variations on paint
  * Factory panel gaps, body lines, or trim seams
  * Normal wear patterns (minor stone chips, road dust, dirt)
  * Camera artifacts, JPEG compression, or image noise
  * Dark areas caused by angles or lighting, not dents
  * Plastic trim texture or matte vs glossy surface transitions
- You MUST have clear, unambiguous visual evidence of ACTUAL physical damage before reporting.
- When uncertain, default to needs_check_parts (0.50-0.69 range) for human review rather than inventing high confidence.

DETECTION RULES:
1. Report ONLY damage you can SEE in the images — never guess or infer.
2. Parts with confidence >= 0.70 go in "damages" (report to customer).
3. Parts with confidence 0.50-0.69 go in "needs_check_parts" (requires human approval).
4. For paired parts (headlights, mirrors, doors), only report the SPECIFIC side that is damaged.
5. Cross-reference multiple images to confirm damage when possible.
6. If no damage is visible, return empty arrays — do NOT fabricate findings.

LEFT/RIGHT CRITICAL RULE:
- Always determine left/right from the DRIVER'S perspective sitting inside the car
- Driver left = viewer's right when looking at front of car
- Driver right = viewer's left when looking at front of car
- If you see damage on the right side of a front photo → that is front_left_fender or front_left_headlight (driver's left)
- Double-check every part name contains the correct _left or _right suffix before outputting

Return this exact JSON (confidence MUST be decimal between 0.0-1.0, e.g., 0.85, not 1 or 85):
\`\`\`json
{
  "damages": [
    {
      "part_name_en": "exact part name from valid parts",
      "part_name_ar": "الاسم بالعربية",
      "damage_type": "Dent|Scratch|Crack|Broken|Missing|Deformation",
      "description": "specific visual evidence observed",
      "confidence": 0.85
    }
  ],
  "needs_check_parts": [
    {
      "part_name_en": "exact part name",
      "part_name_ar": "الاسم بالعربية",
      "damage_type": "string",
      "description": "what you observed",
      "reason_for_uncertainty": "why confidence is low — e.g., 'Could be reflection', 'Might be shadow', 'Possible minor dent'",
      "confidence": 0.62
    }
  ]
}
\`\`\`

EXAMPLE OUTPUTS:
Vehicle with obvious damage:
\`\`\`json
{
  "damages": [
    {"part_name_en": "Hood", "part_name_ar": "كبوت", "damage_type": "Dent", "description": "Deep inward dent visible from multiple angles", "confidence": 0.92},
    {"part_name_en": "Front Left Headlight", "part_name_ar": "فانوس أمامي شمال", "damage_type": "Broken", "description": "Shattered glass with missing pieces", "confidence": 0.95}
  ],
  "needs_check_parts": [
    {"part_name_en": "Front Left Fender", "part_name_ar": "رفرف أمامي شمال", "damage_type": "Scratch", "description": "Thin line mark on fender", "reason_for_uncertainty": "Could be surface dust or very light scratch", "confidence": 0.58}
  ]
}
\`\`\`

Undamaged vehicle:
\`\`\`json
{
  "damages": [],
  "needs_check_parts": [],
  "summary": "No damage detected — vehicle appears to be in good condition"
}
\`\`\`

Return ONLY the JSON object. No markdown, no explanation.`;
}

// ============================================================================
// 4-STAGE ANALYSIS ENGINE
// ============================================================================

export async function analyzeVehicleDamage(images, vehicleInfo, geminiApiKey) {
  console.log('\n🎬 Starting 4-Stage Analysis with Full Prompt Structure...');

  const client = new GoogleGenerativeAI(geminiApiKey);
  const model = client.getGenerativeModel({ model: 'gemini-3-flash-preview' });

  // Simulate image views/angles (in real app, frontend would provide these)
  const imageViews = ['front', 'left', 'right', 'back'];
  const imageAngles = ['wide', 'wide', 'wide', 'wide'];

  try {
    // ========== STAGE 1 ==========
    console.log('\n📸 STAGE 1: Image Quality + Vehicle Identification');
    const stage1Prompt = buildStage1Prompt(images.length);
    const stage1Content = await callGeminiWithImages(stage1Prompt, images, imageViews, imageAngles, model);
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

    // ========== STAGE 2A ==========
    console.log('\n🔍 STAGE 2A: Damage Pre-Check (Unbiased)');
    const stage2aPrompt = buildStage2APrompt(visibleAreas);
    const stage2aContent = await callGeminiWithImages(stage2aPrompt, images, imageViews, imageAngles, model);
    const stage2aResult = parseJSON(stage2aContent, 'Stage 2A');

    console.log(`  ✓ Has damage: ${stage2aResult.has_damage}`);
    console.log(`  ✓ Confidence: ${stage2aResult.confidence}`);

    if (!stage2aResult.has_damage) {
      console.log('  → No damage detected. Skipping full scan.\n');
      return {
        damages: [],
        vehicleInfo,
        timestamp: new Date().toISOString(),
        analysisMethod: '4-stage-full-structure',
        stageResults: { stage1: stage1Result, stage2a: stage2aResult },
      };
    }

    // ========== STAGE 2A-VERIFY & 2B (Parallel) ==========
    console.log('\n✔️ STAGE 2A-Verify & 2B: Counter-Check + Full Scan (Parallel)');
    const stage2aVerifyPrompt = buildStage2AVerifyPrompt(stage2aResult.reasoning, visibleAreas);
    const stage2bPrompt = buildStage2BPrompt(visibleAreas, stage1Result);

    const [verifyContent, stage2bContent] = await Promise.all([
      callGeminiWithImages(stage2aVerifyPrompt, images, imageViews, imageAngles, model),
      callGeminiWithImages(stage2bPrompt, images, imageViews, imageAngles, model),
    ]);

    const verifyResult = parseJSON(verifyContent, 'Stage 2A-Verify');
    const stage2bResult = parseJSON(stage2bContent, 'Stage 2B');

    // Fix confidence values: if Gemini returned integer 1, convert to 0.95
    // (Gemini sometimes returns "confidence": 1 instead of 0.95)
    if (stage2bResult.damages) {
      stage2bResult.damages.forEach(d => {
        if (d.confidence === 1) d.confidence = 0.95;
        else if (d.confidence > 1) d.confidence = 0.95; // Safety: cap at 0.95
      });
    }
    if (stage2bResult.needs_check_parts) {
      stage2bResult.needs_check_parts.forEach(nc => {
        if (nc.confidence === 1) nc.confidence = 0.95;
        else if (nc.confidence > 1) nc.confidence = 0.95;
      });
    }

    console.log(`  ✓ Verification has_damage: ${verifyResult.has_damage}`);
    console.log(`  ✓ Stage 2B damages found: ${(stage2bResult.damages || []).length}`);
    console.log(`  ✓ Stage 2B needs_check found: ${(stage2bResult.needs_check_parts || []).length}`);

    // DEBUG: Log when needs_check is empty (for troubleshooting)
    if ((stage2bResult.needs_check_parts || []).length === 0 && (stage2bResult.damages || []).length > 0) {
      console.log('ℹ️  Stage 2B: All detected parts are high-confidence (no needs_check_parts) - this is normal for obvious damage');
    }

    if (!verifyResult.has_damage) {
      console.log('  → Verification rejected pre-check. Treating as undamaged.\n');
      return {
        damages: [],
        vehicleInfo,
        timestamp: new Date().toISOString(),
        analysisMethod: '4-stage-full-structure',
        stageResults: { stage1: stage1Result, stage2a: stage2aResult, stage2aVerify: verifyResult },
      };
    }

    // ========== MAP TO TAXONOMY & FILTER ==========
    console.log('\n🗂️ Mapping to Part Taxonomy & Filtering');
    // Normalize part names to match PARTS_DATABASE keys
    function normalizePartName(rawName) {
      if (!rawName) return '';
      const key = rawName
        .toLowerCase()
        .trim()
        .replace(/[()\/\\,;:]/g, ' ')
        .replace(/[-]/g, '_')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
      return key;
    }

    // Helper function to map and enrich a damage record
    function mapDamageRecord(damage, isNeedsCheck = false) {
      const partKey = normalizePartName(damage.part_name_en);
      // Try alias first, then direct match
      const aliasedKey = PART_NAME_ALIASES[partKey] || partKey;
      const matchedPart = PARTS_DATABASE[aliasedKey];

      const damageType = damage.damage_type || 'unknown';
      const damageIndex = DAMAGE_TYPE_INDEX[damageType.toLowerCase()] || null;
      const severityLabel = damageIndex !== null ? (damageIndex < 4 ? 'Repair' : 'Replace') : 'Replace';

      if (matchedPart) {
        let confidence = damage.confidence;
        if (!confidence || confidence < 0.01) {
          const description = `${damage.damage_type} ${damage.part_name_en}`.toLowerCase();
          if (description.includes('obvious') || description.includes('clear') || description.includes('unmistakable') || description.includes('definite')) {
            confidence = 0.85;
          } else if (description.includes('likely') || description.includes('suspected')) {
            confidence = 0.60;
          } else if (description.includes('possible') || description.includes('probable')) {
            confidence = 0.55;
          } else {
            confidence = 0.65;
          }
        }

        const mapped = {
          part_name_en: matchedPart.nameEn,
          part_name_ar: matchedPart.nameAr,
          damage_type: damageType,
          confidence: confidence,
          severity_label: severityLabel,
          price: matchedPart.price,
          partId: matchedPart.partId,
          category: matchedPart.category,
          is_ai_detected: true,
          isUnmapped: false,
        };

        // Preserve reason_for_uncertainty for needs_check parts
        if (isNeedsCheck && damage.reason_for_uncertainty) {
          mapped.reason_for_uncertainty = damage.reason_for_uncertainty;
        }

        return mapped;
      }
      return null;
    }

    // Map BOTH damages and needs_check_parts arrays from Gemini
    const detectedDamages = stage2bResult.damages || [];
    const mappedDamages = detectedDamages
      .map((damage, idx) => {
        const mapped = mapDamageRecord(damage, false);
        if (!mapped) {
          console.log(`    ⚠️  Damage ${idx+1} not in PARTS_DATABASE: "${damage.part_name_en}" (conf: ${damage.confidence})`);
        }
        return mapped;
      })
      .filter(d => d !== null);

    const geminiNeedsCheck = stage2bResult.needs_check_parts || [];
    const mappedNeedsCheck = geminiNeedsCheck
      .map((nc, idx) => {
        const mapped = mapDamageRecord(nc, true);
        if (!mapped) {
          console.log(`    ⚠️  Needs_check ${idx+1} not in PARTS_DATABASE: "${nc.part_name_en}" (conf: ${nc.confidence})`);
        }
        return mapped;
      })
      .filter(d => d !== null);

    console.log(`  ✓ Mapped ${mappedDamages.length}/${detectedDamages.length} damages to taxonomy`);
    console.log(`  ✓ Mapped ${mappedNeedsCheck.length}/${geminiNeedsCheck.length} needs_check from Gemini`);
    console.log(`  ✓ Filtered out unknown parts\n`);

    // Split damages by confidence (secondary split in case Gemini confidence was low in damages array)
    const confirmedDamages = mappedDamages.filter(d => d.confidence >= 0.70);
    const damagesNeedsCheck = mappedDamages.filter(d => d.confidence < 0.70);

    // Combine: needs_check_parts from Gemini PLUS any damages that fell below confidence threshold
    const needsCheckDamages = [...mappedNeedsCheck, ...damagesNeedsCheck];

    console.log(`  ✓ Confirmed damages (≥70%): ${confirmedDamages.length}`);
    if (confirmedDamages.length > 0) {
      confirmedDamages.slice(0, 3).forEach(d => {
        console.log(`    - ${d.part_name_ar} (${Math.round(d.confidence * 100)}%)`);
      });
    }
    console.log(`  ⚠️  Needs check (<70%): ${needsCheckDamages.length}`);
    if (needsCheckDamages.length > 0) {
      needsCheckDamages.slice(0, 3).forEach(d => {
        console.log(`    - ${d.part_name_ar} (${Math.round(d.confidence * 100)}%)`);
      });
    }
    console.log('');

    return {
      damages: confirmedDamages,
      needs_check_parts: needsCheckDamages,
      vehicleInfo,
      timestamp: new Date().toISOString(),
      analysisMethod: '4-stage-full-structure',
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
