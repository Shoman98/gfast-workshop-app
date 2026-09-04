/**
 * PUBLIC ROUTES - No auth required
 * Used by consumer-facing apps (wreck-vision) to fetch workshop listings
 */

import express from 'express';
import multer from 'multer';
import { supabase } from '../db/supabase.js';

const META_PIXEL_ID = '1576434103838817';
const META_CAPI_TOKEN = process.env.META_CAPI_TOKEN || 'EAAHP5ZAWffHYBSSbKd9U69GHlFjgzOCZC6UWsCGL5H50kGILJl3Na7PXBwfrxgTMq2JSlFRPfJEy9i4sZCMMw0UN0JFU1YDq9Bma5yo3MLRFhoyk7TBbv0ZBUgkc7QOP9ZBF9Eh5EEetbcoVunbZBWYEqaI95uBm636XZBipKo8jMyQBqgQyfSjZAmxYZAGYT1ZB28lwZDZD';
import { notifyConsumerBookingAsync } from '../lib/telegram-notify.js';
import { recordBookingStatus } from '../lib/bookingStatuses.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const router = express.Router();

/**
 * GET /api/public/workshops
 * Returns all visible workshops with their active branches.
 * Used by wreck-vision to show the workshop + branch picker to customers.
 */
router.get('/workshops', async (req, res, next) => {
  try {
    const { data: workshops, error } = await supabase
      .from('workshops')
      .select('workshop_id, workshop_name, display_name, city, phone, stars, review_text, is_new, badges, logo_url, accepts_insurance, working_days')
      .eq('is_visible_to_consumers', true)
      .eq('is_active', true)
      .eq('is_super_admin', false)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    // Fetch branches for all workshops in one query
    const workshopIds = (workshops || []).map(w => w.workshop_id);
    let branchMap = {};

    if (workshopIds.length > 0) {
      const { data: branches } = await supabase
        .from('workshop_branches')
        .select('branch_id, workshop_id, branch_name, city, phone')
        .in('workshop_id', workshopIds)
        .eq('is_active', true)
        .order('branch_name');

      (branches || []).forEach(b => {
        if (!branchMap[b.workshop_id]) branchMap[b.workshop_id] = [];
        branchMap[b.workshop_id].push(b);
      });
    }

    const result = (workshops || []).map(w => ({
      ...w,
      branches: branchMap[w.workshop_id] || [],
    }));

    res.json({ success: true, workshops: result });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/public/pre-booking
 * Called on "Book Now" click — uploads images, saves vehicle + mobile to DB.
 * Returns booking_id so the workshop can be linked later.
 */
router.post('/pre-booking', upload.array('images', 12), async (req, res, next) => {
  try {
    const { customer_mobile, vehicle_make, vehicle_model, vehicle_year } = req.body;
    if (!customer_mobile) return res.status(400).json({ error: 'customer_mobile required' });

    // Upload images to Cloudinary
    const cloudName = (process.env.VITE_CLOUDINARY_CLOUD_NAME || 'nohkn9qb').trim();
    const uploadPreset = (process.env.VITE_CLOUDINARY_UPLOAD_PRESET || 'workshop-images').replace(/\s*[\(\[].*/, '').trim();
    const files = req.files || [];
    const image_urls = await Promise.all(files.map(async (file) => {
      const fd = new FormData();
      fd.append('file', new Blob([file.buffer], { type: file.mimetype }), file.originalname);
      fd.append('upload_preset', uploadPreset);
      const r = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: 'POST', body: fd });
      if (!r.ok) return null;
      const d = await r.json();
      return d.secure_url || null;
    })).then(urls => urls.filter(Boolean));

    // Supersede any previous pending bookings for this customer
    await supabase
      .from('consumer_bookings')
      .update({ status: 'superseded' })
      .eq('customer_mobile', customer_mobile)
      .eq('status', 'pending');

    // Save to DB without workshop yet
    const { data, error } = await supabase
      .from('consumer_bookings')
      .insert({
        workshop_id: null,
        customer_mobile,
        image_urls,
        vehicle_make: vehicle_make || null,
        vehicle_model: vehicle_model || null,
        vehicle_year: vehicle_year || null,
        status: 'pending',
      })
      .select('id')
      .single();

    if (error) throw error;
    res.json({ success: true, booking_id: data.id, image_urls });
  } catch (err) { next(err); }
});

/**
 * PATCH /api/public/booking/:id
 * Called when customer confirms a workshop — links the pre-booking to the workshop.
 */
router.patch('/booking/:id', async (req, res, next) => {
  try {
    const { workshop_id, branch_id, scheduled_date } = req.body;
    if (!workshop_id) return res.status(400).json({ error: 'workshop_id required' });

    const { data, error } = await supabase
      .from('consumer_bookings')
      .update({ workshop_id, branch_id: branch_id || null, status: 'booked', ...(scheduled_date !== undefined ? { scheduled_date: scheduled_date || null } : {}) })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    // Seed the status timeline now that the pre-booking is a real workshop booking.
    try { await recordBookingStatus(req.params.id, 'booked', { changed_by: 'customer' }); }
    catch (histErr) { console.warn('⚠️  booking history seed failed:', histErr.message); }

    // Telegram notification
    const { data: ws } = await supabase.from('workshops').select('workshop_name').eq('workshop_id', workshop_id).single();
    const { data: br } = branch_id
      ? await supabase.from('workshop_branches').select('branch_name').eq('branch_id', branch_id).single()
      : { data: null };

    notifyConsumerBookingAsync({
      workshop_id,
      workshop_name: ws?.workshop_name,
      branch_name: br?.branch_name || null,
      customer_mobile: data.customer_mobile,
      vehicle_make: data.vehicle_make,
      vehicle_model: data.vehicle_model,
      vehicle_year: data.vehicle_year,
      scheduled_date: data.scheduled_date,
      images_count: (data.image_urls || []).length,
    }, process.env);

    res.json({ success: true, booking: data });
  } catch (err) { next(err); }
});

/**
 * POST /api/public/booking
 * Customer submits a booking request for a specific workshop (+ optional branch).
 * Creates a consumer_bookings record that appears in the workshop's bookings tab.
 */
router.post('/booking', async (req, res, next) => {
  try {
    const { workshop_id, branch_id, customer_mobile, report_url, image_urls, vehicle_make, vehicle_model, vehicle_year, scheduled_date } = req.body;

    if (!workshop_id || !customer_mobile) {
      return res.status(400).json({ error: 'workshop_id and customer_mobile required' });
    }

    // One active booking per vehicle: supersede only this customer's not-yet-started
    // bookings for the SAME vehicle. In-progress and past bookings stay as history.
    if (vehicle_make && vehicle_model && vehicle_year) {
      await supabase
        .from('consumer_bookings')
        .update({ status: 'superseded' })
        .eq('customer_mobile', customer_mobile)
        .eq('vehicle_make', vehicle_make)
        .eq('vehicle_model', vehicle_model)
        .eq('vehicle_year', vehicle_year)
        .in('status', ['pending', 'booked']);
    }

    const { data, error } = await supabase
      .from('consumer_bookings')
      .insert({
        workshop_id,
        branch_id: branch_id || null,
        customer_mobile,
        report_url: report_url || null,
        image_urls: image_urls || [],
        vehicle_make: vehicle_make || null,
        vehicle_model: vehicle_model || null,
        vehicle_year: vehicle_year || null,
        scheduled_date: scheduled_date || null,
        status: 'booked',
      })
      .select()
      .single();

    if (error) throw error;

    // Seed the status timeline (powers the customer progress bar).
    try { await recordBookingStatus(data.id, 'booked', { changed_by: 'customer' }); }
    catch (histErr) { console.warn('⚠️  booking history seed failed:', histErr.message); }

    // Fetch workshop + branch names for the Telegram notification
    const { data: ws } = await supabase.from('workshops').select('workshop_name').eq('workshop_id', workshop_id).single();
    const { data: br } = branch_id
      ? await supabase.from('workshop_branches').select('branch_name').eq('branch_id', branch_id).single()
      : { data: null };

    notifyConsumerBookingAsync({
      workshop_id,
      workshop_name: ws?.workshop_name,
      branch_name: br?.branch_name || null,
      customer_mobile,
      vehicle_make,
      vehicle_model,
      vehicle_year,
      scheduled_date: scheduled_date || null,
      images_count: (image_urls || []).length,
    }, process.env);

    res.json({ success: true, booking: data });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/public/upload-images
 * Accepts multipart images, uploads to Cloudinary, returns URLs.
 * Used by consumer-facing apps that can't upload directly.
 */
router.post('/upload-images', upload.array('images', 12), async (req, res, next) => {
  try {
    const cloudName = (process.env.VITE_CLOUDINARY_CLOUD_NAME || 'nohkn9qb').trim();
    // Strip any trailing whitespace or stray characters from the env value
    const uploadPreset = (process.env.VITE_CLOUDINARY_UPLOAD_PRESET || 'workshop-images').replace(/\s*[\(\[].*/, '').trim();
    const files = req.files || [];

    const urls = await Promise.all(files.map(async (file) => {
      const fd = new FormData();
      const blob = new Blob([file.buffer], { type: file.mimetype });
      fd.append('file', blob, file.originalname);
      fd.append('upload_preset', uploadPreset);
      const r = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: 'POST', body: fd });
      if (!r.ok) throw new Error(`Cloudinary error ${r.status}`);
      const d = await r.json();
      return d.secure_url;
    }));

    res.json({ success: true, urls });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/public/capture-lead
 * Saves mobile number + optional vehicle info as soon as user validates phone.
 */
router.post('/capture-lead', async (req, res) => {
  try {
    const { mobile, make, model, year } = req.body;
    if (!mobile) return res.status(400).json({ error: 'mobile required' });
    // Upsert into consumer_bookings with status=lead_capture — no workshop yet
    const { error } = await supabase
      .from('captured_leads')
      .upsert(
        { mobile, vehicle_make: make || null, vehicle_model: model || null, vehicle_year: year || null, source: 'landing' },
        { onConflict: 'mobile' }
      );
    if (error) console.error('capture-lead error:', error.message);
    res.json({ success: !error });
  } catch (err) {
    console.error('capture-lead exception:', err.message);
    res.json({ success: false });
  }
});

/**
 * GET /api/public/profile?mobile=
 * Customer profile: vehicles (grouped by make/model/year) with their bookings.
 * Vehicles come from real bookings + the customer_vehicles registry (added,
 * not-yet-booked vehicles).
 */
router.get('/profile', async (req, res, next) => {
  try {
    const mobile = String(req.query.mobile || '').trim();
    if (!mobile) return res.status(400).json({ error: 'mobile required' });

    const { data: bookings } = await supabase
      .from('consumer_bookings')
      .select('id, workshop_id, vehicle_make, vehicle_model, vehicle_year, status, scheduled_date, report_url, estimate_id, cancellation_reason, created_at')
      .eq('customer_mobile', mobile)
      .neq('status', 'superseded')
      .order('created_at', { ascending: false });

    // Resolve workshop display names (no FK for a PostgREST embed, so map manually).
    const wsIds = [...new Set((bookings || []).map(b => b.workshop_id).filter(Boolean))];
    const wsNames = {};
    if (wsIds.length) {
      const { data: ws } = await supabase.from('workshops').select('workshop_id, workshop_name, display_name').in('workshop_id', wsIds);
      for (const w of ws || []) wsNames[w.workshop_id] = w.display_name || w.workshop_name;
    }

    const { data: registered } = await supabase
      .from('customer_vehicles')
      .select('make, model, year')
      .eq('mobile', mobile);

    // Vehicles the customer entered on the landing page but hasn't booked yet.
    const { data: leads } = await supabase
      .from('captured_leads')
      .select('vehicle_make, vehicle_model, vehicle_year')
      .eq('mobile', mobile);

    const keyOf = (mk, md, yr) => [mk || '', md || '', yr || ''].join('|').toLowerCase();
    const vehicles = {};
    const ensure = (make, model, year) => {
      const k = keyOf(make, model, year);
      if (!vehicles[k]) vehicles[k] = { make, model, year, bookings: [] };
      return vehicles[k];
    };

    for (const b of bookings || []) {
      ensure(b.vehicle_make, b.vehicle_model, b.vehicle_year).bookings.push({
        id: b.id, status: b.status, scheduled_date: b.scheduled_date, report_url: b.report_url,
        estimate_id: b.estimate_id, cancellation_reason: b.cancellation_reason, created_at: b.created_at,
        workshop_name: wsNames[b.workshop_id] || null,
      });
    }
    for (const v of registered || []) {
      if (v.make || v.model || v.year) ensure(v.make, v.model, v.year);
    }
    for (const l of leads || []) {
      if (l.vehicle_make || l.vehicle_model || l.vehicle_year) ensure(l.vehicle_make, l.vehicle_model, l.vehicle_year);
    }

    res.json({ success: true, mobile, vehicles: Object.values(vehicles) });
  } catch (err) { next(err); }
});

/**
 * PATCH /api/public/profile/mobile { old_mobile, new_mobile }
 * Change the customer's mobile across all their records.
 */
router.patch('/profile/mobile', async (req, res, next) => {
  try {
    const old_mobile = String(req.body.old_mobile || '').trim();
    const new_mobile = String(req.body.new_mobile || '').trim();
    if (!old_mobile || !new_mobile) return res.status(400).json({ error: 'old_mobile and new_mobile required' });
    if (old_mobile === new_mobile) return res.json({ success: true });

    await supabase.from('consumer_bookings').update({ customer_mobile: new_mobile }).eq('customer_mobile', old_mobile);
    await supabase.from('estimates').update({ customer_mobile: new_mobile }).eq('customer_mobile', old_mobile);
    await supabase.from('customer_vehicles').update({ mobile: new_mobile }).eq('mobile', old_mobile);
    // captured_leads.mobile is unique — ignore conflict if the new number already exists there.
    const { error: leadErr } = await supabase.from('captured_leads').update({ mobile: new_mobile }).eq('mobile', old_mobile);
    if (leadErr) console.warn('captured_leads mobile update skipped:', leadErr.message);

    res.json({ success: true });
  } catch (err) { next(err); }
});

/**
 * POST /api/public/profile/vehicle { mobile, make, model, year }
 * Register another vehicle for the customer (no booking yet).
 */
router.post('/profile/vehicle', async (req, res, next) => {
  try {
    const { mobile, make, model, year } = req.body;
    if (!mobile || !make || !model) return res.status(400).json({ error: 'mobile, make and model required' });
    const { error } = await supabase
      .from('customer_vehicles')
      .upsert({ mobile, make, model, year: year || null }, { onConflict: 'mobile,make,model,year' });
    if (error) throw error;
    res.json({ success: true });
  } catch (err) { next(err); }
});

/**
 * GET /api/public/booking/:id/timeline
 * Dated status history for one booking — powers the progress bar.
 */
router.get('/booking/:id/timeline', async (req, res, next) => {
  try {
    const { data: booking } = await supabase
      .from('consumer_bookings')
      .select('id, status, scheduled_date, report_url, estimate_id, cancellation_reason')
      .eq('id', req.params.id)
      .single();
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const { data: history } = await supabase
      .from('booking_status_history')
      .select('status, cancellation_reason, estimate_id, created_at')
      .eq('booking_id', req.params.id)
      .order('created_at', { ascending: true });

    res.json({ success: true, booking, history: history || [] });
  } catch (err) { next(err); }
});

/**
 * GET /api/public/estimate-report/:id
 * Public view of a workshop's confirmed assessment (estimate) — powers the
 * "quoting"/"supplementary" report link on the customer profile. No auth;
 * only confirmed estimates are exposed.
 */
router.get('/estimate-report/:id', async (req, res, next) => {
  try {
    const { data: est, error } = await supabase
      .from('estimates')
      .select('*')
      .eq('estimate_id', req.params.id)
      .single();
    if (error || !est || est.status !== 'confirmed') {
      return res.status(404).json({ error: 'Report not found' });
    }

    const { data: ws } = await supabase
      .from('workshops').select('workshop_name, display_name, city, phone')
      .eq('workshop_id', est.workshop_id).single();

    // Supplement chain (confirmed only) — same shape the workshop report uses.
    const rootId = est.parent_estimate_id || est.estimate_id;
    const { data: chain } = await supabase
      .from('estimates')
      .select('estimate_id, status, confirmed_at, created_at, parent_estimate_id')
      .eq('workshop_id', est.workshop_id)
      .or(`estimate_id.eq.${rootId},parent_estimate_id.eq.${rootId}`)
      .order('created_at', { ascending: true });

    res.json({
      success: true,
      report: {
        estimate_id: est.estimate_id,
        vehicle_year: est.vehicle_year,
        vehicle_make: est.vehicle_make,
        vehicle_model: est.vehicle_model,
        vin_number: est.vin_number,
        customer_name: est.customer_name,
        customer_mobile: est.customer_mobile,
        insurance_company_id: est.insurance_company_id,
        confirmed_at: est.confirmed_at || est.created_at,
        parent_estimate_id: est.parent_estimate_id,
        pricing_data: est.pricing_data || null,
        workshop: {
          workshop_name: ws?.display_name || ws?.workshop_name || 'ورشة',
          city: ws?.city || '-',
          phone: ws?.phone || '-',
        },
      },
      chain: (chain || []).filter(c => c.status === 'confirmed'),
    });
  } catch (err) { next(err); }
});

/**
 * POST /api/public/meta-event
 * Forwards browser pixel events to Meta Conversions API for deduplication.
 * Keeps the CAPI token server-side.
 */
router.post('/meta-event', async (req, res) => {
  try {
    const { event_name, event_id, user_agent, source_url, fbp, fbc, external_id, phone, value, currency, workshop_name, city } = req.body;
    if (!event_name || !event_id) return res.status(400).json({ error: 'event_name and event_id required' });

    const user_data = {
      client_user_agent: user_agent || req.headers['user-agent'] || '',
      client_ip_address: req.ip || '',
    };
    if (fbp) user_data.fbp = fbp;
    if (fbc) user_data.fbc = fbc;
    if (external_id) user_data.external_id = external_id;
    if (phone) {
      const { createHash } = await import('crypto');
      const normalized = phone.replace(/\D/g, '');
      user_data.ph = createHash('sha256').update(normalized).digest('hex');
    }

    const event = {
      event_name,
      event_time: Math.floor(Date.now() / 1000),
      event_id,
      action_source: 'website',
      event_source_url: source_url || '',
      user_data,
    };
    const custom_data = {};
    if (value !== undefined) custom_data.value = value;
    if (currency) custom_data.currency = currency;
    if (workshop_name) custom_data.content_name = workshop_name;
    if (city) custom_data.content_category = city;
    if (Object.keys(custom_data).length > 0) event.custom_data = custom_data;

    const payload = {
      data: [event],
      access_token: META_CAPI_TOKEN,
    };

    await fetch(`https://graph.facebook.com/v18.0/${META_PIXEL_ID}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    res.json({ success: true });
  } catch (err) {
    res.json({ success: false }); // silent — never block the user
  }
});

export default router;
