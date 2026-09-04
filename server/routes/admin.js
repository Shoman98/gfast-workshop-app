/**
 * ADMIN ROUTES — Super-admin only
 * Controls marketplace workshops, bookings visibility, stars, badges, reorder
 */

import express from 'express';
import multer from 'multer';
import { supabase } from '../db/supabase.js';
import { authenticate } from '../middleware/auth.js';
import { recordBookingStatus, isValidStatus, STATUS_KEYS, CANCELLATION_REASONS } from '../lib/bookingStatuses.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const router = express.Router();

// Middleware: only super-admins can access these routes
function requireSuperAdmin(req, res, next) {
  if (!req.is_super_admin) {
    return res.status(403).json({ error: 'Super-admin access required' });
  }
  next();
}

// ── GET /api/admin/workshops ── all workshops with marketplace fields
router.get('/workshops', authenticate, requireSuperAdmin, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('workshops')
      .select('workshop_id, workshop_name, display_name, city, phone, is_active, is_visible_to_consumers, is_super_admin, stars, review_text, is_new, badges, sort_order, created_at, logo_url, accepts_insurance')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json({ success: true, workshops: data });
  } catch (err) { next(err); }
});

// ── PATCH /api/admin/workshops/:id ── update marketplace fields
router.patch('/workshops/:id', authenticate, requireSuperAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const allowed = ['display_name', 'is_visible_to_consumers', 'stars', 'review_text', 'is_new', 'badges', 'sort_order', 'is_active', 'logo_url', 'accepts_insurance'];
    const updates = {};
    for (const key of allowed) {
      if (key in req.body) updates[key] = req.body[key];
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('workshops')
      .update(updates)
      .eq('workshop_id', id)
      .select('workshop_id, workshop_name, display_name, city, is_visible_to_consumers, stars, review_text, is_new, badges, sort_order, is_active, logo_url, accepts_insurance')
      .single();

    if (error) throw error;
    res.json({ success: true, workshop: data });
  } catch (err) { next(err); }
});

// ── POST /api/admin/workshops/reorder ── bulk sort_order update
router.post('/workshops/reorder', authenticate, requireSuperAdmin, async (req, res, next) => {
  try {
    const { order } = req.body; // [{ workshop_id, sort_order }]
    if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array' });

    await Promise.all(order.map(({ workshop_id, sort_order }) =>
      supabase.from('workshops').update({ sort_order }).eq('workshop_id', workshop_id)
    ));

    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── POST /api/admin/workshops/:id/logo ── upload logo to Supabase Storage + save URL
router.post('/workshops/:id/logo', authenticate, requireSuperAdmin, upload.single('logo'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const ext = req.file.originalname.split('.').pop() || 'jpg';
    const path = `workshop-logos/${req.params.id}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('workshop-assets')
      .upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
    if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);
    const { data } = supabase.storage.from('workshop-assets').getPublicUrl(path);
    const logo_url = data.publicUrl;
    await supabase.from('workshops').update({ logo_url }).eq('workshop_id', req.params.id);
    res.json({ success: true, logo_url });
  } catch (err) { next(err); }
});

// ── GET /api/admin/workshops/:id/branches ── list branches for a workshop
router.get('/workshops/:id/branches', authenticate, requireSuperAdmin, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('workshop_branches')
      .select('*')
      .eq('workshop_id', req.params.id)
      .order('branch_name');
    if (error) throw error;
    res.json({ success: true, branches: data || [] });
  } catch (err) { next(err); }
});

// ── POST /api/admin/workshops/:id/branches ── add a branch
router.post('/workshops/:id/branches', authenticate, requireSuperAdmin, async (req, res, next) => {
  try {
    const { branch_name, city, phone } = req.body;
    if (!branch_name) return res.status(400).json({ error: 'branch_name required' });
    const branch_id = `${req.params.id}-${Date.now()}`;
    const { data, error } = await supabase
      .from('workshop_branches')
      .insert({ branch_id, workshop_id: req.params.id, branch_name, city: city || null, phone: phone || null })
      .select().single();
    if (error) throw error;
    res.json({ success: true, branch: data });
  } catch (err) { next(err); }
});

// ── PATCH /api/admin/workshops/:id/branches/:branchId ── update a branch
router.patch('/workshops/:id/branches/:branchId', authenticate, requireSuperAdmin, async (req, res, next) => {
  try {
    const allowed = ['branch_name', 'city', 'phone', 'is_active'];
    const updates = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
    const { data, error } = await supabase
      .from('workshop_branches')
      .update(updates)
      .eq('branch_id', req.params.branchId)
      .eq('workshop_id', req.params.id)
      .select().single();
    if (error) throw error;
    res.json({ success: true, branch: data });
  } catch (err) { next(err); }
});

// ── DELETE /api/admin/workshops/:id/branches/:branchId ── remove a branch
router.delete('/workshops/:id/branches/:branchId', authenticate, requireSuperAdmin, async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('workshop_branches')
      .delete()
      .eq('branch_id', req.params.branchId)
      .eq('workshop_id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── GET /api/admin/bookings ── all consumer bookings with filters
router.get('/bookings', authenticate, requireSuperAdmin, async (req, res, next) => {
  try {
    const { workshop_id, status, from, to } = req.query;

    let q = supabase
      .from('consumer_bookings')
      .select('*')
      .neq('status', 'superseded')
      .order('created_at', { ascending: false });

    if (workshop_id) q = q.eq('workshop_id', workshop_id);
    if (status)      q = q.eq('status', status);
    if (from)        q = q.gte('created_at', from);
    if (to)          q = q.lte('created_at', to);

    const { data, error } = await q;
    if (error) throw error;
    res.json({ success: true, bookings: data });
  } catch (err) { next(err); }
});

// ── PATCH /api/admin/bookings/:id ── update booking status and/or scheduled date
router.patch('/bookings/:id', authenticate, requireSuperAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, cancellation_reason, scheduled_date } = req.body;

    // Appointment-date edit (independent of a status change).
    if (scheduled_date !== undefined) {
      const { error: dErr } = await supabase
        .from('consumer_bookings')
        .update({ scheduled_date: scheduled_date || null })
        .eq('id', id);
      if (dErr) throw dErr;
    }

    if (status !== undefined) {
      if (!isValidStatus(status)) {
        return res.status(400).json({ error: `status must be one of: ${STATUS_KEYS.join(', ')}` });
      }
      if (status === 'cancelled' && !CANCELLATION_REASONS.includes(cancellation_reason)) {
        return res.status(400).json({ error: `cancellation_reason required: ${CANCELLATION_REASONS.join(' / ')}` });
      }
      await recordBookingStatus(id, status, {
        changed_by: 'admin',
        cancellation_reason: status === 'cancelled' ? cancellation_reason : null,
      });
    }

    const { data, error } = await supabase.from('consumer_bookings').select('*').eq('id', id).single();
    if (error) throw error;
    res.json({ success: true, booking: data });
  } catch (err) { next(err); }
});

// ── GET /api/admin/bookings/:id/history ── dated status timeline (admin)
router.get('/bookings/:id/history', authenticate, requireSuperAdmin, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('booking_status_history')
      .select('*')
      .eq('booking_id', req.params.id)
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json({ success: true, history: data || [] });
  } catch (err) { next(err); }
});

export default router;
