# Testing Guide - G-FAST Workshop App

## Setup for Testing

### Prerequisites
- Node.js 18+
- npm/yarn
- Supabase account with credentials
- Gemini API key

### 1. Environment Setup

```bash
cd /Users/User/Documents/gfast-workshop-app
cp .env.example .env.local
```

Edit `.env.local`:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...
WORKSHOP_GEMINI_API_KEY=AIza...
PORT=3001
NODE_ENV=development
```

### 2. Database Setup

Run in Supabase SQL Editor:
```sql
-- Copy entire supabase-migrations.sql
-- Paste into SQL Editor and execute
```

Create test workshop:
```sql
INSERT INTO workshop_app.workshops (
  workshop_id, 
  workshop_name, 
  pin_hash, 
  category, 
  phone, 
  email, 
  city, 
  is_active
) VALUES (
  'test-workshop-1',
  'Test Workshop',
  '$2b$10$8rnyxmyVGXl1H/2RvOzl3e7jRfPXlL0Z5Yv5XmqZ5mL5t5t5t5t5t',  -- bcrypt hash of "1234"
  'Auto Repair',
  '01234567890',
  'test@workshop.local',
  'Cairo',
  true
);
```

Or use this Node script to generate hash:
```bash
node -e "const bcrypt = require('bcrypt'); console.log(bcrypt.hashSync('1234', 10))"
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Start Development Servers

**Terminal 1 - Backend:**
```bash
npm run server:dev
```
Expected output:
```
◇ injected env (6) from .env.local
========================================================================
🏭 G-FAST WORKSHOP APP SERVER - READY
========================================================================
📍 URL: http://localhost:3001
🚀 API endpoints:
   POST   /api/auth/login
   POST   /api/analysis
   GET    /api/estimates
   ...
========================================================================
```

**Terminal 2 - Frontend:**
```bash
npm run dev
```
Expected output:
```
VITE v5.0.7  ready in 245 ms

➜  Local:   http://localhost:3002/
➜  press h to show help
```

## Test Scenarios

### Scenario 1: Login

**Steps:**
1. Open http://localhost:3002/
2. Redirects to /login
3. Enter Workshop ID: `test-workshop-1`
4. Enter PIN: `1234`
5. Click "Sign In"

**Expected Result:**
- Token saved to localStorage
- Redirect to /dashboard
- See empty "Recent Estimates" section

**API Call:**
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"workshop_id":"test-workshop-1","pin":"1234"}'
```

Expected Response:
```json
{
  "success": true,
  "token": "eyJ...",
  "workshop": {
    "workshop_id": "test-workshop-1",
    "workshop_name": "Test Workshop",
    "category": "Auto Repair",
    "city": "Cairo"
  }
}
```

### Scenario 2: Create New Estimate

**Steps:**
1. From Dashboard, click "+ New Estimate"
2. Go to /analysis page
3. Enter Vehicle Info:
   - Year: 2023
   - Brand: Toyota
   - Model: Corolla
4. Upload general photos (click button, select 2-3 images)
5. Upload damage photos (click button, select 3-5 images)
6. Click "Analyze Vehicle"
7. Wait for analysis (usually 30-60 seconds)
8. Results show in table on /estimate/new

**Expected Result:**
- Images compressed before upload
- Analysis returns damages with confidence scores
- Parts displayed in table with AI-detected flag
- Severities suggest Repair/Replace based on damage
- Default prices populated from parts database

**API Calls:**
```bash
# Analysis
curl -X POST http://localhost:3001/api/analysis \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{
    "images": ["base64_image1", "base64_image2"],
    "vehicleInfo": {
      "year": 2023,
      "make": "Toyota",
      "model": "Corolla"
    }
  }'

# Expected: { "success": true, "analysis": { "damages": [...] } }
```

### Scenario 3: Edit Estimate

**Steps:**
1. In estimate editor, for each part:
   - Change severity (Repair → Replace)
   - Change price (update EGP amount)
   - Add damage type comment if needed
2. Add new part manually:
   - Part name (EN): "Door Handle"
   - Part name (AR): "مقبض الباب"
   - Damage type: "Broken"
   - Price: 500
   - Click "+ Add Part"
3. Remove a part by clicking ✕
4. Verify total cost updates

**Expected Result:**
- Total cost recalculates on each change
- Can add unlimited parts
- Can remove any part
- All changes stay in memory until confirm

### Scenario 4: Confirm Estimate

**Steps:**
1. After editing, click "Confirm Estimate"
2. Waits for API response
3. Redirects back to Dashboard

**Expected Result:**
- Estimate created in database
- Status changes to "confirmed"
- Appears in Dashboard with lock icon
- Cannot re-edit (add edit endpoint later)

**API Call:**
```bash
# Create estimate
curl -X POST http://localhost:3001/api/estimates \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{
    "vehicle_year": 2023,
    "vehicle_make": "Toyota",
    "vehicle_model": "Corolla",
    "parts": [
      {
        "part_name_en": "Front Bumper",
        "part_name_ar": "المصد الأمامي",
        "damage_type": "Dent",
        "severity_label": "Repair",
        "price": 1500,
        "is_ai_detected": true
      }
    ]
  }'

# Confirm estimate
curl -X POST http://localhost:3001/api/estimates/<ESTIMATE_ID>/confirm \
  -H "Authorization: Bearer <TOKEN>"
```

### Scenario 5: Language Toggle

**Steps:**
1. From any page, click language toggle (top right)
2. Switch between EN ↔ AR
3. Verify all text changes
4. Check RTL layout (Arabic text aligns right)

**Expected Result:**
- All labels change language
- Layout flips for RTL
- Persists during session
- Returns to EN on refresh (can enhance with localStorage)

### Scenario 6: Dashboard List

**Steps:**
1. Create 2-3 estimates
2. Go to Dashboard
3. See all estimates in table
4. Verify:
   - Vehicle info (year, make, model)
   - Part count
   - Total cost
   - Status badges
   - Date created
5. Click Edit on any row
6. Edit parts and confirm again

**Expected Result:**
- All estimates load from API
- Correct data displayed
- Can edit existing estimates
- Status updates reflect in table

### Scenario 7: Export (Optional)

**Steps:**
1. From estimate, click "Export"
2. Choose JSON or CSV format

**Expected Result:**
- JSON: Download entire estimate object
- CSV: Download parts table as CSV

**API Call:**
```bash
# JSON export
curl -X GET "http://localhost:3001/api/estimates/<ID>/export?format=json" \
  -H "Authorization: Bearer <TOKEN>"

# CSV export
curl -X GET "http://localhost:3001/api/estimates/<ID>/export?format=csv" \
  -H "Authorization: Bearer <TOKEN>"
```

### Scenario 8: Error Handling

**Test Cases:**
1. **Invalid credentials:**
   - PIN: 0000 (wrong)
   - Expected: "Invalid Workshop ID or PIN"

2. **Missing images:**
   - Click analyze with no images uploaded
   - Expected: "Error: Upload Images"

3. **Invalid vehicle info:**
   - Analyze with empty year/make/model
   - Expected: "Vehicle info required"

4. **Expired token:**
   - Wait 25 hours (JWT 24h expiry)
   - Try to access /api/estimates
   - Expected: 401 "Invalid or expired token"

5. **CORS:**
   - Frontend not running on :3002
   - API call from different origin
   - Expected: CORS error (normal)

## Checklist

### Frontend
- [ ] Login page loads
- [ ] Invalid credentials rejected
- [ ] Valid credentials work
- [ ] Dashboard loads estimates
- [ ] Can navigate to analysis
- [ ] Can upload images
- [ ] Images display with preview
- [ ] Can delete images before upload
- [ ] Vehicle form fields work
- [ ] Analyze button disabled until images + vehicle info
- [ ] Analysis loading state shows
- [ ] Results display in estimate page
- [ ] Can edit severity/price
- [ ] Can add/remove parts
- [ ] Total cost updates
- [ ] Confirm button works
- [ ] Redirect to dashboard after confirm
- [ ] Can edit existing estimate
- [ ] Language toggle works (EN/AR)
- [ ] RTL layout works in Arabic
- [ ] Logout clears token
- [ ] Token-less users redirected to login

### Backend
- [ ] Server starts without errors
- [ ] Health endpoint responds
- [ ] Login endpoint works
- [ ] Invalid PIN rejected
- [ ] Valid PIN returns token
- [ ] Analysis endpoint accepts images
- [ ] Analysis returns structured data
- [ ] Estimates list works
- [ ] Create estimate works
- [ ] Get single estimate works
- [ ] Confirm estimate works
- [ ] Status changes to confirmed
- [ ] Total cost calculated correctly
- [ ] Protected routes require token
- [ ] 401 for missing/invalid token
- [ ] 403 for cross-workshop access
- [ ] Error messages are helpful
- [ ] Server logs requests

### Database
- [ ] Schema created
- [ ] Test workshop created
- [ ] Estimate inserts work
- [ ] Parts inserts work
- [ ] Edits logged in audit table
- [ ] RLS policies enforce workshop isolation
- [ ] Cannot see other workshop's data

### Performance
- [ ] Image compression works (check file size)
- [ ] Analysis completes in <2 minutes
- [ ] Dashboard loads <1 second
- [ ] UI responsive on mobile (check DevTools)

## Debugging

### Check Token in localStorage
```javascript
// In browser DevTools console
console.log(localStorage.getItem('token'))
```

### Decode JWT Token
```javascript
// In browser DevTools console
const token = localStorage.getItem('token')
const parts = token.split('.')
const decoded = JSON.parse(atob(parts[1]))
console.log(decoded)
```

### Check Backend Logs
- Terminal with `npm run server:dev` shows all requests
- Look for ✅ (success) or ❌ (error) logs

### Supabase Debugging
- Go to Supabase dashboard
- Check workshop_app schema tables
- View data in Table Editor
- Run SQL queries in SQL Editor
- Check RLS policies in Policies tab

### Browser Network Tab
1. Open DevTools (F12)
2. Go to Network tab
3. Perform action (login, upload, confirm)
4. Click on API request
5. Check:
   - Headers (Authorization, Content-Type)
   - Request body
   - Response status (200, 400, 401, 500)
   - Response data

## Common Issues

| Issue | Solution |
|-------|----------|
| "Cannot find package 'cors'" | `npm install cors` |
| "Supabase credentials not found" | Add real values to .env.local |
| "Invalid or expired token" | Login again, check localStorage |
| "Estimate not found" | Make sure in same workshop account |
| "Analysis failed" | Check Gemini API key validity |
| "CORS error" | Backend must run on :3001 |
| "Port 3001/3002 in use" | Kill previous process: `lsof -i :3001` |

## Performance Benchmarks

**Expected Response Times:**
- Login: <100ms
- List estimates: <500ms
- Create estimate: <200ms
- Analysis: 30-120 seconds (depends on Gemini)
- Page loads: <500ms
- Image compression: <2 seconds per image

---

**Happy testing!** 🚀
