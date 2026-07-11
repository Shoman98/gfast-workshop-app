# Shared Analysis Module Architecture

## The Problem You Identified

Why are we duplicating the same analysis logic in both wreck-vision and workshop app?

- Same `buildStage2BPrompt()` function
- Same confidence splitting rules (≥70% damages, <70% needs_check)
- Same PARTS_DATABASE (200+ parts)
- Same damage taxonomy
- Same severity index
- Same enrichment logic

**Answer:** We shouldn't! This should be ONE shared module.

---

## Current State

### Workshop App (CURRENT - Duplicated Code)
```
server/analysis-4stage-full.js  ← Duplicated 4-stage pipeline
server/gemini-analysis.js       ← Duplicated PARTS_DATABASE, severity logic
```

### Wreck-Vision (SHARED MODULE - Already Exists)
```
packages/analysis-core/         ← @gfast/analysis-core package
└── index.js                    ← Exports all analysis functions
```

**Analysis-core exports:**
- `runAnalysisPipeline()` - Full 4-stage Gemini analysis
- `enrichDamageData()` - Enrich with part names, prices, severity
- `PARTS_DATABASE` - 200+ vehicle parts (EN/AR)
- `DAMAGE_TYPE_INDEX` - Damage type → severity mapping
- `getSeverityDecision()` - Single damage severity
- `getMultipleDamageDecision()` - Multiple damages' max severity
- Plus compression, Gemini API calls, JSON parsing helpers

---

## The Solution

### Step 1: Convert `@gfast/analysis-core` to ESM

**Current state:** CommonJS (`module.exports`)
**Needed state:** ES6 modules (`export`)

In `/Users/User/Documents/wreck-vision/packages/analysis-core/`:
```javascript
// index.js: Change from CommonJS to ESM

// FROM:
module.exports = { runAnalysisPipeline, enrichDamageData, ... };

// TO:
export { runAnalysisPipeline, enrichDamageData, ... };
export { PARTS_DATABASE, DAMAGE_TYPE_INDEX, ... };
```

Also update `package.json`:
```json
{
  "type": "module",  // Change from "commonjs"
  "main": "index.js",
  "exports": { ".": "./index.js" }
}
```

### Step 2: Replace Workshop App Code

In `/Users/User/Documents/gfast-workshop-app/server/index.js`:

```javascript
// BEFORE (current - duplicated):
import { compressImages, callGeminiWithImages, enrichDamageData } from './gemini-analysis.js';
import { analyzeVehicleDamage } from './analysis-4stage-full.js';

// AFTER (shared module):
import { runAnalysisPipeline, enrichDamageData } from '@gfast/analysis-core';
```

Replace the analysis endpoint:
```javascript
app.post('/api/analysis', async (req, res) => {
  const { images, vehicleInfo } = req.body;
  
  // Use shared module - SAME as wreck-vision تحليل المركبه
  const analysisData = await runAnalysisPipeline(
    images,
    vehicleInfo,
    undefined,  // auto-detect views
    undefined   // auto-detect angles
  );
  
  // Enrich with part data
  const enriched = enrichDamageData(analysisData, vehicleInfo);
  
  return res.json({ success: true, analysis: enriched });
});
```

### Step 3: Delete Duplicated Code

```bash
rm server/analysis-4stage-full.js      # No longer needed
rm server/analysis-mock.js              # No longer needed
rm server/analysis-stage2b-wreck-vision.js  # No longer needed

# Keep: server/gemini-analysis.js       # Still used for enrichDamageData locally
# (or also move enrichDamageData to analysis-core)
```

---

## Benefits

✅ **100% Consistency**
- Same damage detection algorithm in both apps
- Same confidence rules
- Same part database
- Same severity decisions

✅ **Single Source of Truth**
- Fix a bug once → fixed everywhere
- Update confidence rules once → applies to both apps
- Add a part once → available in both apps

✅ **Reduced Maintenance**
- ~500 lines of duplicated code eliminated
- One team to review analysis changes
- Easier to add new features (stages 3-4 for structural/hidden damage)

✅ **Better Architecture**
- Workshop app is thin frontend that uses shared core
- Wreck-vision is also just a consumer of analysis-core
- Both apps guaranteed to have identical analysis

---

## Implementation Timeline

1. **Convert analysis-core to ESM** (1-2 hours)
   - Change `module.exports` → `export`
   - Update package.json `"type": "module"`
   - Test that wreck-vision still works

2. **Update workshop app** (30 mins)
   - Import from @gfast/analysis-core
   - Remove duplicated server files
   - Test with real images

3. **Test alignment** (1 hour)
   - Run same images through both apps
   - Verify identical analysis results
   - Confirm needs_check_parts behavior

---

## Current Blockers

❌ **Blocker 1: Module Format**
- analysis-core is CommonJS
- workshop app is ESM
- Node refuses to import CommonJS default exports into ESM
- **Solution:** Convert analysis-core to ESM (see step 1 above)

---

## Code References

**Wreck-vision analysis-core:**
- Location: `/Users/User/Documents/wreck-vision/packages/analysis-core/`
- Exports: 6 main functions + 6 constants
- Source data: `/Users/User/Documents/wreck-vision/local-server.cjs` (re-exported)

**Workshop app current code:**
- Location: `/Users/User/Documents/gfast-workshop-app/server/`
- Duplicated from: wreck-vision's `local-server.cjs`
- Files: `analysis-4stage-full.js`, `gemini-analysis.js`

**Key functions to consolidate:**
- `buildStage2BPrompt()` - Identical in both
- `mapDamageRecord()` - Identical confidence splitting logic
- `enrichDamageData()` - Identical enrichment
- PARTS_DATABASE - Identical 200+ parts list

---

## FAQ

**Q: Will this break wreck-vision?**
A: No. We're only refactoring how analysis-core is packaged (ESM instead of CommonJS). The logic stays identical.

**Q: What about future stages (3-4)?**
A: Already exported from analysis-core! Workshop app can use them once analysis-core is ESM.

**Q: What if Gemini model changes?**
A: Update in analysis-core once → both apps automatically use the new model.

**Q: Can we do this incrementally?**
A: Yes. Keep duplicated code, add analysis-core import in parallel, then switch over.
