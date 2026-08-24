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
      .select('workshop_id, workshop_name, display_name, city, phone, stars, review_text, badges, logo_url, accepts_insurance')
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
    const { workshop_id, branch_id } = req.body;
    if (!workshop_id) return res.status(400).json({ error: 'workshop_id required' });

    const { data, error } = await supabase
      .from('consumer_bookings')
      .update({ workshop_id, branch_id: branch_id || null })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

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
    const { workshop_id, branch_id, customer_mobile, report_url, image_urls, vehicle_make, vehicle_model, vehicle_year } = req.body;

    if (!workshop_id || !customer_mobile) {
      return res.status(400).json({ error: 'workshop_id and customer_mobile required' });
    }

    // Supersede all previous bookings for this customer globally — one active booking at a time
    await supabase
      .from('consumer_bookings')
      .update({ status: 'superseded' })
      .eq('customer_mobile', customer_mobile)
      .neq('status', 'superseded');

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
        status: 'pending',
      })
      .select()
      .single();

    if (error) throw error;

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
 * POST /api/public/meta-event
 * Forwards browser pixel events to Meta Conversions API for deduplication.
 * Keeps the CAPI token server-side.
 */
router.post('/meta-event', async (req, res) => {
  try {
    const { event_name, event_id, user_agent, source_url, fbp, fbc, external_id } = req.body;
    if (!event_name || !event_id) return res.status(400).json({ error: 'event_name and event_id required' });

    const user_data = {
      client_user_agent: user_agent || req.headers['user-agent'] || '',
      client_ip_address: req.ip || '',
    };
    if (fbp) user_data.fbp = fbp;
    if (fbc) user_data.fbc = fbc;
    if (external_id) user_data.external_id = external_id;

    const payload = {
      data: [{
        event_name,
        event_time: Math.floor(Date.now() / 1000),
        event_id,
        action_source: 'website',
        event_source_url: source_url || '',
        user_data,
      }],
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
