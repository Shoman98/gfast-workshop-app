# G-FAST Workshop Portal

**Workshop estimate creation and approval system** for vehicle damage assessments. Workshops use the same AI analysis as the B2C app, then edit results and add prices before confirming estimates.

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env.local
```

Fill in credentials from wreck-vision Supabase project.

### 3. Setup Supabase
Run SQL migrations in Supabase dashboard:
```sql
-- Copy contents of supabase-migrations.sql and execute
```

### 4. Test
```bash
# Terminal 1 - Backend
npm run server:dev

# Terminal 2 - Frontend
npm run dev
```

Browser: http://localhost:3002

## Architecture

```
Frontend: React + TypeScript (port 3002)
Backend:  Express.js (port 3001)
Database: Supabase (shared with wreck-vision, workshop_app schema)
Analysis: @gfast/analysis-core module (shared)
```

## Features (V0)

- ✅ Workshop authentication (workshop_id + PIN)
- ✅ Vehicle damage analysis (AI via analysis-core)
- ✅ Estimate editing (severity, price, add/remove parts)
- ✅ Audit logging (all changes tracked)
- ✅ Multi-tenancy (RLS policies)
- ✅ Export (JSON/CSV)
- ✅ Bilingual (EN/AR)

## API Endpoints

```
POST   /api/auth/login                → JWT token
POST   /api/analysis                  → Gemini results
GET    /api/estimates                 → List estimates
POST   /api/estimates                 → Create
PUT    /api/estimates/:id/part/:partId → Update part
POST   /api/estimates/:id/confirm     → Lock estimate
GET    /api/estimates/:id/export      → Export (JSON/CSV)
```

## Documentation

- **README.md** — This file
- **SETUP_CHECKLIST.md** — Step-by-step deployment
- **BUILD_SUMMARY.md** — What's built & scope
- **NEXT_STEPS.txt** — Quick reference
- **supabase-migrations.sql** — Database schema

## Deployment

See SETUP_CHECKLIST.md for complete instructions.

**Estimated timeline**: 1 week (setup + UI implementation + beta testing)

## Next Steps

1. Implement Analysis page UI (image upload)
2. Implement Estimate editor (parts, prices)
3. Test with real workshops
4. Deploy to production

---

**For detailed setup instructions, see SETUP_CHECKLIST.md**
