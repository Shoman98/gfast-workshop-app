# G-Fast Workshop App

Vehicle damage estimation platform for auto repair workshops. Built on top of the G-Fast shared analysis engine (`@gfast/analysis-core`).

---

## Architecture Overview

```
Browser (React + Vite)          Backend (Express)              Shared Module
      :3006                           :3333                   @gfast/analysis-core
         │                               │                            │
         │── POST /api/auth/login ───────►│                            │
         │── POST /api/analysis ──────────►── runAnalysisPipeline() ──►│
         │                               │◄── damages + hiddenDamage ──│
         │                               │── enrichAnalysisWithParts()  │
         │◄── damages + needs_check ─────│                            │
         │── POST /api/estimates ─────────►── Supabase DB              │
         │── GET  /api/estimates/:id ─────►── Supabase DB              │
```

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, TypeScript |
| Backend | Node.js, Express |
| Database | Supabase (PostgreSQL) |
| AI Analysis | Gemini Vision API via `@gfast/analysis-core` |
| Auth | JWT (8h expiry, auto-refresh) |

---

## Analysis Pipeline

Calls `runAnalysisPipeline()` from `@gfast/analysis-core` (wreck-vision shared module). This runs a **4-stage Gemini Vision analysis**:

| Stage | What it does |
|---|---|
| Stage 1 | Vehicle ID, photo quality, visible areas detection |
| Stage 2A | Damage pre-check (unbiased screener) |
| Stage 2B | Full damage scan — outputs `damages` + `needs_check_parts` |
| Stage 3 | Structural damage assessment (text-only) |
| Stage 4 | Hidden damage inference (AC condenser, radiator, etc.) |

**Cost:** ~5 Gemini requests per analysis × image token cost (~$0.003 per analysis).

---

## enrichAnalysisWithParts() — Core Enrichment Logic

Located in `server/index.js`. Transforms raw pipeline output into workshop-ready format.

### Input Sources

```
runAnalysisPipeline() returns:
  ├── damages[]                 — all parts (confirmed + needs_check merged as recommendedDecision:'inspect')
  ├── needs_check_parts[]       — explicit needs_check (if any)
  └── hiddenDamageAssessment[]  — Stage 4 hidden parts (radiator, AC condenser, etc.)
```

### Split Logic

```
allParts = analysisData.damages
  ├── confirmedDamages     = allParts WHERE recommendedDecision !== 'inspect'
  └── needsCheckFromShared = allParts WHERE recommendedDecision === 'inspect'

hiddenDamageParts = hiddenDamageAssessment → mapped to needs_check format

allNeedsCheck = needsCheckFromShared + explicitNeedsCheck + hiddenDamageParts
```

### Part Name Resolution

1. Normalize: `lowercase → trim → replace special chars → snake_case`
2. Look up in `PART_NAME_ALIASES` (190+ aliases from `@gfast/analysis-core`) — e.g. `front_bumper → upper_bumper`
3. Look up resolved key in `PARTS_DATABASE` (187 parts with EN/AR names, partId, category)

### Severity Engine (aligned with wreck-vision)

```
Base rule:    DAMAGE_TYPE_INDEX[damageType] < 4  → Repair
              DAMAGE_TYPE_INDEX[damageType] >= 4 → Replace

Category overrides (highest priority):
  airbags_safety, interior, mechanical, suspension  → Always Replace
  structural, chassis, chassis_structure            → Always Repair
  Any buckled damage                                → Always Repair
```

### Filtering Rules

- **Damages:** Drop if `isUnmapped` OR `part_name_ar` is null / `قطعة غير معروفة`
- **Needs Check:** Same filter — only parts found in PARTS_DATABASE are shown
- **Deduplication:** Keep highest-confidence instance when same part appears multiple times
- **Cross-array:** Parts already in damages are removed from needs_check

### Output

```json
{
  "damages": [/* confirmed parts, mapped, enriched */],
  "needs_check_parts": [/* uncertain + hidden parts, mapped, enriched */],
  "vehicleInfo": { "year": 2020, "make": "Toyota", "model": "Camry" },
  "timestamp": "2026-07-14T...",
  "analysisSource": "@gfast/analysis-core (shared module)"
}
```

---

## Authentication

- **Login:** `POST /api/auth/login` with `workshop_id` + `pin`
- **PIN storage:** bcrypt hashed in Supabase `workshops` table
- **Token:** JWT, 8h expiry
- **Auto-refresh:** Frontend checks every 30 min, refreshes if < 2h remaining
- **Rate limit:** 5 login attempts per 15 minutes per IP

### Onboarding a New Workshop (Manual)

1. Generate PIN hash:
   ```bash
   node -e "import('bcrypt').then(b => b.default.hash('YOUR_PIN', 10).then(h => console.log(h)))"
   ```
2. Insert into Supabase SQL editor:
   ```sql
   INSERT INTO public.workshops (workshop_id, workshop_name, pin_hash, city, phone)
   VALUES ('WS-001', 'اسم الورشة', '$2b$10$...hash...', 'المدينة', '05xxxxxxxx');
   ```
3. Share credentials with workshop owner: Workshop ID + PIN only

---

## Database Schema (Supabase — public schema)

```
workshops
  ├── workshop_id       TEXT PRIMARY KEY
  ├── workshop_name     TEXT
  ├── pin_hash          TEXT  (bcrypt)
  ├── city              TEXT
  ├── phone             TEXT
  └── is_active         BOOLEAN

estimates
  ├── estimate_id       UUID PRIMARY KEY
  ├── workshop_id       TEXT → workshops
  ├── vehicle_year / make / model
  ├── status            TEXT  (draft | confirmed)
  ├── labors            JSONB
  └── confirmed_at      TIMESTAMPTZ

estimate_parts
  ├── estimate_part_id  UUID PRIMARY KEY
  ├── estimate_id       UUID → estimates
  ├── part_name_en/ar   TEXT
  ├── damage_type       TEXT
  ├── confidence        NUMERIC
  ├── severity_label    TEXT  (Repair | Replace)
  └── price             NUMERIC

estimate_audit_logs
  ├── log_id            UUID PRIMARY KEY
  ├── estimate_id       UUID → estimates
  ├── action_type       TEXT
  ├── action_description_ar TEXT
  ├── field / old_value / new_value TEXT
  └── created_at        TIMESTAMPTZ
```

---

## Estimate Page — User Audit Workflow

1. **Damages section:** Confirmed parts ≥ 70% confidence. User can:
   - Edit price (entered manually per part)
   - Toggle Repair / Replace
   - Remove part (confirmation popup required)

2. **Needs Check section:** Parts < 70% confidence OR hidden damage from Stage 4. User can:
   - ✅ Approve → moves part to damages
   - ❌ Reject → removes from estimate

3. **Labor section:** 5 fixed labor types (ميكانيكا, سمكره, دهان, ايرباج, فك وتركيب) with price inputs. Repair-labeled damage parts auto-appear below as additional labor rows.

4. **Total:** `إجمالي التكلفة` = Replace parts cost + fixed labors + Repair parts cost

5. **Add part manually:** Arabic name + Repair/Replace + price

---

## Report Page

- **قطع الغيار:** Replace parts in 3-column grid with prices
- **وصف الأعمال:** Fixed labors + Repair parts below a divider
- **Grand total:** Spare parts + labor + repair parts
- **Shareable link:** `/report/:estimateId?public=true`
- **Watermark:** "Powered by G-Fast" under total cost

---

## Environment Variables (.env.local)

```env
# Supabase
SUPABASE_URL=https://alyezrwvuzprmcaoirsb.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...        # Service role key — bypasses RLS, backend only

# Gemini API
WORKSHOP_GEMINI_API_KEY=...        # Overrides GEMINI_API_KEY used by shared module

# Auth
JWT_SECRET=...
PORT=3333
NODE_ENV=production
```

---

## Running Locally

```bash
# Install dependencies
npm install

# Start backend (port 3333)
npm run server

# Start frontend (port 3006)
npm run dev
```

**Important:** To restart the backend without killing the frontend:
```bash
pkill -f "node server/index.js" && npm run server
```
Never use `pkill -9 node` — it kills Vite too.

---

## Key Design Decisions

| Decision | Reason |
|---|---|
| `@gfast/analysis-core` shared module | Single source of truth — same prompts, PARTS_DATABASE, confidence rules as wreck-vision |
| Filter unmapped parts | Only show parts with valid Arabic names — no `قطعة غير معروفة` |
| Include `hiddenDamageAssessment` in needs_check | Stage 4 hidden damage (radiator, AC condenser) was missing without this |
| Category-based severity overrides | Airbags/mechanical always Replace, structural always Repair — matches wreck-vision |
| Supabase service key (not anon key) | Bypasses RLS — used backend only, never exposed to browser |
| Manual workshop onboarding | Early adopter phase — admin inserts directly into Supabase |
| `PART_NAME_ALIASES` from shared module | 190+ aliases stay in sync with wreck-vision automatically |
| Prices always 0 from analysis | Workshop mechanic inputs real prices manually on estimate page |
