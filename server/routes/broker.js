/**
 * BROKER ROUTES
 * Full login, FNOL submission, docs upload, case tracking, assessment.
 */

import express from 'express';
import multer from 'multer';
import bcrypt from 'bcrypt';
import { supabase } from '../db/supabase.js';
import { generateBrokerToken, requireBroker } from '../middleware/auth.js';
import {
  notifyBrokerFnolAsync,
  notifyBrokerBookingAsync,
  notifyBrokerAssessmentAsync,
} from '../lib/telegram-notify.js';
import {
  MOCK_BROKERS,
  MOCK_FNOL_REPORTS,
  MOCK_BROKER_CASES,
  getMockBrokerByCreds,
} from '../lib/brokerStore.js';

const router = express.Router();
// 100 MB cap so a short claim video can be uploaded alongside photos/docs.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

const getMockBroker = getMockBrokerByCreds;

// ── Auth ──────────────────────────────────────────────────────────────────────

/**
 * POST /api/broker/auth/login
 * email + password → JWT valid 24 h
 */
router.post('/auth/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });

    // Try mock brokers first (local testing)
    const mockBroker = getMockBroker(email, password);
    if (mockBroker) {
      const token = generateBrokerToken(mockBroker.id);
      return res.json({
        success: true,
        token,
        broker: { id: mockBroker.id, name: mockBroker.name, company: mockBroker.company, email: mockBroker.email, link_token: mockBroker.link_token },
      });
    }

    // Fall back to Supabase
    const { data: broker, error } = await supabase
      .from('brokers')
      .select('id, name, company, email, password_hash, is_active, link_token')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (error || !broker) return res.status(401).json({ error: 'Invalid credentials' });
    if (!broker.is_active) return res.status(403).json({ error: 'Account disabled' });

    const valid = await bcrypt.compare(password, broker.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = generateBrokerToken(broker.id);
    res.json({
      success: true,
      token,
      broker: { id: broker.id, name: broker.name, company: broker.company, email: broker.email, link_token: broker.link_token },
    });
  } catch (err) { next(err); }
});

/**
 * GET /api/broker/auth/me — verify token, return broker profile
 */
router.get('/auth/me', requireBroker, async (req, res, next) => {
  try {
    const { data: broker } = await supabase
      .from('brokers')
      .select('id, name, company, email, link_token, created_at')
      .eq('id', req.broker_id)
      .single();
    res.json({ broker });
  } catch (err) { next(err); }
});

/**
 * GET /api/broker/link/:token — validate a customer link token, return public broker info
 * Public (no auth) — called by the FNOL page before showing the form.
 */
router.get('/link/:token', async (req, res, next) => {
  try {
    // Try mock brokers first
    const mockBroker = MOCK_BROKERS.find(b => b.link_token === req.params.token);
    if (mockBroker) {
      return res.json({ broker: { id: mockBroker.id, name: mockBroker.name, company: mockBroker.company } });
    }

    // Fall back to Supabase
    const { data: broker } = await supabase
      .from('brokers')
      .select('id, name, company')
      .eq('link_token', req.params.token)
      .eq('is_active', true)
      .single();
    if (!broker) return res.status(404).json({ error: 'Invalid or inactive link' });
    res.json({ broker });
  } catch (err) { next(err); }
});

/**
 * GET /api/broker/fnol-report/:id — PUBLIC printable FNOL report.
 * Returns vehicle + broker + the analysis (part names only, resolved client-side)
 * + the photos submitted in the FNOL. Powers the shareable "print claim" page.
 */
router.get('/fnol-report/:id', async (req, res, next) => {
  try {
    const shape = (fnol, broker, booking) => ({
      report: {
        fnol_id: fnol.id,
        vin: fnol.vin || null,
        vehicle_license: fnol.vehicle_license || null,
        vehicle_make: fnol.vehicle_make || null,
        vehicle_model: fnol.vehicle_model || null,
        vehicle_year: fnol.vehicle_year || null,
        customer_mobile: fnol.customer_mobile || null,
        submitted_at: fnol.submitted_at || null,
        broker_company: broker?.company || null,
        analysis_result: fnol.analysis_result || null,
        general_images: fnol.general_images || [],
        damage_images: fnol.damage_images || [],
        video_url: fnol.video_url || null,
        // Booking state so the customer's claim page can show "book" vs "booked".
        booking: booking || null,
      },
    });

    // Mock store first (local dev)
    const mockFnol = MOCK_FNOL_REPORTS.get(req.params.id);
    if (mockFnol) {
      const broker = MOCK_BROKERS.find(b => b.id === mockFnol.broker_id);
      return res.json(shape(mockFnol, broker, mockFnol.booking || null));
    }

    const { data: fnol } = await supabase
      .from('fnol_reports')
      .select('id, broker_id, vin, vehicle_license, vehicle_make, vehicle_model, vehicle_year, customer_mobile, general_images, damage_images, video_url, analysis_result, submitted_at')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!fnol) return res.status(404).json({ error: 'FNOL not found' });

    const { data: broker } = await supabase
      .from('brokers').select('company').eq('id', fnol.broker_id).maybeSingle();

    // Latest booking for this FNOL (if the customer already booked a workshop)
    const { data: bk } = await supabase
      .from('consumer_bookings')
      .select('id, status, scheduled_date, workshop_id')
      .eq('fnol_id', fnol.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    let booking = null;
    if (bk && bk.status !== 'superseded') {
      const { data: ws } = await supabase
        .from('workshops').select('workshop_name, display_name, city').eq('workshop_id', bk.workshop_id).maybeSingle();
      booking = {
        status: bk.status,
        scheduled_date: bk.scheduled_date || null,
        workshop_name: ws?.display_name || ws?.workshop_name || null,
        city: ws?.city || null,
      };
    }

    res.json(shape(fnol, broker, booking));
  } catch (err) { next(err); }
});

// ── Docs upload ───────────────────────────────────────────────────────────────

/**
 * POST /api/broker/upload-docs
 * Accepts multipart docs (PDF, images). Uploads to Supabase Storage bucket 'broker-docs'.
 * Returns signed URLs valid for 1 year (effectively permanent for the FNOL lifetime).
 * Public endpoint — auth is via broker link_token passed in body.
 */
router.post('/upload-docs', upload.array('docs', 10), async (req, res, next) => {
  try {
    const { broker_id } = req.body;
    const files = req.files || [];
    if (files.length === 0) return res.json({ urls: [] });

    const urls = await Promise.all(files.map(async (file) => {
      const ext = file.originalname.split('.').pop() || 'bin';
      const path = `${broker_id || 'unknown'}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage
        .from('broker-docs')
        .upload(path, file.buffer, { contentType: file.mimetype, upsert: false });
      if (error) throw new Error(`Storage upload failed: ${error.message}`);

      const { data: signed } = await supabase.storage
        .from('broker-docs')
        .createSignedUrl(path, 60 * 60 * 24 * 365); // 1 year
      return signed?.signedUrl || path;
    }));

    res.json({ urls });
  } catch (err) { next(err); }
});

/**
 * POST /api/broker/video-upload-url
 * Returns a short-lived signed URL the browser uses to upload a (large) claim
 * video DIRECTLY to Supabase Storage — bypassing the API server entirely (no
 * request-size / memory / CORS limits). The FNOL submit later turns the path
 * into a 1-year signed download URL. Public (broker link flow).
 */
router.post('/video-upload-url', async (req, res, next) => {
  try {
    const { broker_id, ext } = req.body;
    const safeExt = String(ext || 'mp4').replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'mp4';
    const path = `${broker_id || 'unknown'}/video-${Date.now()}-${Math.random().toString(36).slice(2)}.${safeExt}`;
    const { data, error } = await supabase.storage.from('broker-docs').createSignedUploadUrl(path);
    if (error) throw new Error(`Signed upload URL failed: ${error.message}`);
    res.json({ signedUrl: data.signedUrl, path: data.path || path });
  } catch (err) { next(err); }
});

// ── FNOL submission ───────────────────────────────────────────────────────────

/**
 * POST /api/broker/fnol
 * Public — called from the customer FNOL page.
 * Creates fnol_reports + broker_cases. Fires Telegram trigger 1.
 */
router.post('/fnol', async (req, res, next) => {
  try {
    const {
      broker_id, vin, vehicle_license, vehicle_license_photo, customer_mobile, location,
      vehicle_make, vehicle_model, vehicle_year,
      general_images, damage_images, doc_urls, video_url, video_path,
      analysis_result, report_url,
    } = req.body;

    if (!broker_id || !vin) return res.status(400).json({ error: 'broker_id and vin required' });

    // Verify broker exists (check mock brokers first)
    let broker = MOCK_BROKERS.find(b => b.id === broker_id);
    if (!broker) {
      const { data: b } = await supabase
        .from('brokers')
        .select('id, name, company')
        .eq('id', broker_id)
        .eq('is_active', true)
        .single();
      broker = b;
    }
    if (!broker) return res.status(404).json({ error: 'Broker not found' });

    // Video uploaded directly to storage → sign a 1-year download URL from its path.
    let videoUrl = video_url || null;
    if (!videoUrl && video_path) {
      const { data: signed } = await supabase.storage
        .from('broker-docs').createSignedUrl(video_path, 60 * 60 * 24 * 365);
      videoUrl = signed?.signedUrl || null;
    }

    const vinUpper = vin.trim().toUpperCase();
    const fnolPayload = {
      broker_id,
      vin: vinUpper,
      vehicle_license: vehicle_license || null,
      vehicle_license_photo: vehicle_license_photo || null,
      customer_mobile: customer_mobile || null,
      location: location || null,
      vehicle_make: vehicle_make || null,
      vehicle_model: vehicle_model || null,
      vehicle_year: vehicle_year ? parseInt(vehicle_year) : null,
      general_images: general_images || [],
      damage_images: damage_images || [],
      doc_urls: doc_urls || [],
      video_url: videoUrl,
      analysis_result: analysis_result || null,
      report_url: report_url || null,
      status: 'submitted',
    };

    let fnol = null;
    let brokerCase = null;

    // 1. Try real Supabase (production). Mock brokers have string ids → skip.
    const isMockBroker = MOCK_BROKERS.some(b => b.id === broker_id);
    if (!isMockBroker) {
      const { data: f, error: fErr } = await supabase
        .from('fnol_reports').insert(fnolPayload).select().single();
      if (!fErr && f) {
        fnol = f;
        const { data: c } = await supabase
          .from('broker_cases')
          .insert({ broker_id, fnol_id: f.id, vin: vinUpper, stage: 'fnol' })
          .select().single();
        brokerCase = c;
      } else if (fErr) {
        console.warn('⚠️  Supabase FNOL insert failed, using mock store:', fErr.message);
      }
    }

    // 2. Fallback to in-memory store (local dev / tables not yet migrated)
    if (!fnol) {
      const fnolId = `fnol-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      fnol = { id: fnolId, ...fnolPayload, submitted_at: new Date().toISOString() };
      MOCK_FNOL_REPORTS.set(fnolId, fnol);
      const caseId = `case-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      brokerCase = { id: caseId, broker_id, fnol_id: fnolId, vin: vinUpper, stage: 'fnol', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      MOCK_BROKER_CASES.set(caseId, brokerCase);
    }

    // Telegram trigger 1
    notifyBrokerFnolAsync({
      broker_id,
      broker_name: `${broker.name} (${broker.company})`,
      vin: fnol.vin,
      customer_mobile,
      vehicle_make, vehicle_model, vehicle_year,
      location,
      general_images_count: (general_images || []).length,
      damage_images_count: (damage_images || []).length,
      docs_count: (doc_urls || []).length,
    }, process.env);

    res.json({ success: true, fnol_id: fnol.id, case_id: brokerCase.id });
  } catch (err) {
    console.error('FNOL Error:', err.message);
    res.status(500).json({ error: err.message || 'FNOL submission failed' });
  }
});

// ── Cases (broker authenticated) ─────────────────────────────────────────────

/**
 * Attach workshop + branch details to each case's booking. consumer_bookings has
 * no FK to workshops/branches (workshop_id is a plain text column), so PostgREST
 * can't embed them — we stitch by id in JS.
 */
async function attachWorkshops(cases) {
  const bookings = cases.map(c => c.booking).filter(Boolean);
  const wsIds     = [...new Set(bookings.map(b => b.workshop_id).filter(Boolean))];
  const branchIds = [...new Set(bookings.map(b => b.branch_id).filter(Boolean))];

  const wsMap = {}, brMap = {};
  if (wsIds.length) {
    const { data } = await supabase.from('workshops')
      .select('workshop_id, workshop_name, display_name, city').in('workshop_id', wsIds);
    (data || []).forEach(w => { wsMap[w.workshop_id] = w; });
  }
  if (branchIds.length) {
    const { data } = await supabase.from('workshop_branches')
      .select('branch_id, branch_name').in('branch_id', branchIds);
    (data || []).forEach(b => { brMap[b.branch_id] = b; });
  }
  for (const c of cases) {
    if (c.booking) {
      c.booking.workshop = c.booking.workshop_id ? (wsMap[c.booking.workshop_id] || null) : null;
      c.booking.branch   = c.booking.branch_id ? (brMap[c.booking.branch_id] || null) : null;
    }
  }
  return cases;
}

/**
 * GET /api/broker/cases
 * Returns all cases for the authenticated broker with latest status.
 */
router.get('/cases', requireBroker, async (req, res, next) => {
  try {
    // 1. Try Supabase (production)
    const { data, error } = await supabase
      .from('broker_cases')
      .select(`
        id, vin, stage, created_at, updated_at,
        fnol:fnol_reports (
          id, vin, vehicle_license, vehicle_license_photo, customer_mobile, vehicle_make, vehicle_model, vehicle_year,
          location, status, submitted_at, booking_at, assessment_at,
          general_images, damage_images, doc_urls, video_url, report_url, analysis_result
        ),
        booking:consumer_bookings ( id, status, scheduled_date, workshop_id, branch_id )
      `)
      .eq('broker_id', req.broker_id)
      .order('created_at', { ascending: false });

    if (!error && data) return res.json({ cases: await attachWorkshops(data) });

    if (error) console.warn('⚠️  broker cases query error, using mock:', error.message);

    // 2. Fallback to in-memory store
    const cases = Array.from(MOCK_BROKER_CASES.values())
      .filter(c => c.broker_id === req.broker_id)
      .map(c => ({ ...c, fnol: MOCK_FNOL_REPORTS.get(c.fnol_id) || null, booking: c.booking || null }))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json({ cases });
  } catch (err) { next(err); }
});

/**
 * GET /api/broker/case/:id
 * Full timeline for a single broker case. `:id` is the broker_case id (preferred —
 * unambiguous when several claims share a VIN). Falls back to VIN lookup (newest)
 * for older links.
 */
router.get('/case/:id', requireBroker, async (req, res, next) => {
  try {
    const raw = req.params.id;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw);
    const vin = raw.trim().toUpperCase();

    const SELECT = `
        id, vin, stage, assessment_notes, assessment_estimate, assessment_url,
        created_at, updated_at,
        fnol:fnol_reports (
          id, vehicle_license, vehicle_license_photo, customer_mobile, vehicle_make, vehicle_model, vehicle_year,
          location, status, submitted_at, booking_at, assessment_at,
          general_images, damage_images, doc_urls, video_url, analysis_result, report_url
        ),
        booking:consumer_bookings ( id, status, scheduled_date, created_at, workshop_id, branch_id )
      `;

    // 1. Try Supabase (production) — by case id when given, else newest for the VIN.
    let q = supabase.from('broker_cases').select(SELECT).eq('broker_id', req.broker_id);
    q = isUuid ? q.eq('id', raw) : q.eq('vin', vin).order('created_at', { ascending: false }).limit(1);
    const { data, error } = await q.maybeSingle();

    if (!error && data) return res.json({ case: (await attachWorkshops([data]))[0] });

    if (error) console.warn('⚠️  broker case query error, using mock:', error.message);

    // 2. Fallback to in-memory store (match by id first, then VIN)
    const brokerCase = Array.from(MOCK_BROKER_CASES.values())
      .filter(c => c.broker_id === req.broker_id && (c.id === raw || c.vin === vin))
      .map(c => ({ ...c, fnol: MOCK_FNOL_REPORTS.get(c.fnol_id) || null, booking: c.booking || null }))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

    if (!brokerCase) return res.status(404).json({ error: 'Case not found' });
    res.json({ case: brokerCase });
  } catch (err) { next(err); }
});

/**
 * POST /api/broker/case/:fnolId/assessment
 * Workshop (or admin) submits the confirmed assessment.
 * Advances broker_case to 'assessed'. Fires Telegram trigger 3.
 * Auth: broker JWT OR workshop JWT (we check both).
 */
router.post('/case/:fnolId/assessment', async (req, res, next) => {
  try {
    const { fnol_id: fnolId } = { fnol_id: req.params.fnolId };
    const { notes, estimate, report_url } = req.body;

    // Verify FNOL exists
    const { data: fnol } = await supabase
      .from('fnol_reports')
      .select('id, vin, broker_id, vehicle_make, vehicle_model, vehicle_year, customer_mobile')
      .eq('id', fnolId)
      .single();
    if (!fnol) return res.status(404).json({ error: 'FNOL not found' });

    const now = new Date().toISOString();

    // Update FNOL
    await supabase
      .from('fnol_reports')
      .update({ status: 'assessed', assessment_at: now })
      .eq('id', fnolId);

    // Update broker_case
    await supabase
      .from('broker_cases')
      .update({
        stage: 'assessed',
        assessment_notes: notes || null,
        assessment_estimate: estimate ? parseFloat(estimate) : null,
        assessment_url: report_url || null,
        updated_at: now,
      })
      .eq('fnol_id', fnolId);

    // Fetch broker + workshop name for Telegram
    const { data: broker } = await supabase
      .from('brokers').select('name, company').eq('id', fnol.broker_id).single();

    const { data: bc } = await supabase
      .from('broker_cases')
      .select('booking:consumer_bookings(workshop:workshops(workshop_name))')
      .eq('fnol_id', fnolId)
      .single();

    const workshopName = bc?.booking?.workshop?.workshop_name || '-';

    notifyBrokerAssessmentAsync({
      broker_name: broker ? `${broker.name} (${broker.company})` : '-',
      vin: fnol.vin,
      customer_mobile: fnol.customer_mobile,
      vehicle_make: fnol.vehicle_make,
      vehicle_model: fnol.vehicle_model,
      vehicle_year: fnol.vehicle_year,
      workshop_name: workshopName,
      estimate,
      notes,
    }, process.env);

    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
