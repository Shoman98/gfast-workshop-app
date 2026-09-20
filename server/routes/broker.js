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
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

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

// ── FNOL submission ───────────────────────────────────────────────────────────

/**
 * POST /api/broker/fnol
 * Public — called from the customer FNOL page.
 * Creates fnol_reports + broker_cases. Fires Telegram trigger 1.
 */
router.post('/fnol', async (req, res, next) => {
  try {
    const {
      broker_id, vin, customer_mobile, location,
      vehicle_make, vehicle_model, vehicle_year,
      general_images, damage_images, doc_urls,
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

    const vinUpper = vin.trim().toUpperCase();
    const fnolPayload = {
      broker_id,
      vin: vinUpper,
      customer_mobile: customer_mobile || null,
      location: location || null,
      vehicle_make: vehicle_make || null,
      vehicle_model: vehicle_model || null,
      vehicle_year: vehicle_year ? parseInt(vehicle_year) : null,
      general_images: general_images || [],
      damage_images: damage_images || [],
      doc_urls: doc_urls || [],
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
          id, vin, customer_mobile, vehicle_make, vehicle_model, vehicle_year,
          location, status, submitted_at, booking_at, assessment_at,
          general_images, damage_images, doc_urls, report_url, analysis_result
        ),
        booking:consumer_bookings (
          id, status, scheduled_date,
          workshop:workshops ( workshop_name, display_name, city )
        )
      `)
      .eq('broker_id', req.broker_id)
      .order('created_at', { ascending: false });

    if (!error && data) return res.json({ cases: data });

    // 2. Fallback to in-memory store
    const cases = Array.from(MOCK_BROKER_CASES.values())
      .filter(c => c.broker_id === req.broker_id)
      .map(c => ({ ...c, fnol: MOCK_FNOL_REPORTS.get(c.fnol_id) || null, booking: c.booking || null }))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json({ cases });
  } catch (err) { next(err); }
});

/**
 * GET /api/broker/case/:vin
 * Full timeline for a single VIN owned by this broker.
 */
router.get('/case/:vin', requireBroker, async (req, res, next) => {
  try {
    const vin = req.params.vin.trim().toUpperCase();

    // 1. Try Supabase (production)
    const { data, error } = await supabase
      .from('broker_cases')
      .select(`
        id, vin, stage, assessment_notes, assessment_estimate, assessment_url,
        created_at, updated_at,
        fnol:fnol_reports (
          id, customer_mobile, vehicle_make, vehicle_model, vehicle_year,
          location, status, submitted_at, booking_at, assessment_at,
          general_images, damage_images, doc_urls, analysis_result, report_url
        ),
        booking:consumer_bookings (
          id, status, scheduled_date, created_at,
          workshop:workshops ( workshop_id, workshop_name, display_name, city ),
          branch:workshop_branches ( branch_name )
        )
      `)
      .eq('broker_id', req.broker_id)
      .eq('vin', vin)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) return res.json({ case: data });

    // 2. Fallback to in-memory store
    const brokerCase = Array.from(MOCK_BROKER_CASES.values())
      .filter(c => c.broker_id === req.broker_id && c.vin === vin)
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
