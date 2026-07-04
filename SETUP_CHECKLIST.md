# Setup Checklist - gfast-workshop-app

## 1. GitHub Setup
- [ ] Create repo at https://github.com/new
  - Name: gfast-workshop-app
  - Description: G-Fast Workshop Portal
  - Public
- [ ] Connect local repo:
  ```bash
  git remote add origin <YOUR_REPO_URL>
  git branch -M main
  git push -u origin main
  ```

## 2. Supabase Setup

- [ ] Get credentials from wreck-vision Supabase project
- [ ] Run SQL migrations:
  1. Go to Supabase > SQL Editor
  2. Copy `supabase-migrations.sql`
  3. Paste and execute
  4. Verify tables created

- [ ] Create test workshop account:
  1. Generate bcrypt PIN: `node -e "const bcrypt = require('bcrypt'); console.log(bcrypt.hashSync('1234', 10))"`
  2. Insert into `workshop_app.workshops`:
     - workshop_id: test-workshop-1
     - workshop_name: Test Workshop
     - pin_hash: (bcrypt hash)
     - is_active: true

## 3. Local Setup

- [ ] Copy .env:
  ```bash
  cp .env.example .env.local
  ```

- [ ] Edit .env.local with Supabase credentials

- [ ] Install:
  ```bash
  npm install
  ```

## 4. Test Backend

- [ ] Start: `npm run server:dev`
- [ ] Test login endpoint:
  ```bash
  curl -X POST http://localhost:3001/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"workshop_id":"test-workshop-1","pin":"1234"}'
  ```
- [ ] Should return: `{ "success": true, "token": "...", "workshop": {...} }`

## 5. Test Frontend

- [ ] Start: `npm run dev`
- [ ] Open: http://localhost:3002
- [ ] Login with test account
- [ ] Verify redirect to /dashboard

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Supabase not found" | Check .env.local has correct credentials |
| "Workshop not found" | Create test workshop in Supabase |
| "analysis-core not found" | Verify wreck-vision/packages/analysis-core/ exists |
| "CORS error" | Backend must run on port 3001 |

## Next: Implement UI Pages

See NEXT_STEPS.txt for full timeline.
