/**
 * ADMIN ROUTES — Super-admin only
 * Controls marketplace workshops, bookings visibility, stars, badges, reorder
 */

import express from 'express';
import multer from 'multer';
import { supabase } from '../db/supabase.js';
import { authenticate } from '../middleware/auth.js';

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
      .select('workshop_id, workshop_name, display_name, city, phone, is_active, is_visible_to_consumers, is_super_admin, stars, review_text, badges, sort_order, created_at, logo_url, accepts_insurance')
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
    const allowed = ['display_name', 'is_visible_to_consumers', 'stars', 'review_text', 'badges', 'sort_order', 'is_active', 'logo_url', 'accepts_insurance'];
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
      .select('workshop_id, workshop_name, display_name, city, is_visible_to_consumers, stars, review_text, badges, sort_order, is_active, logo_url, accepts_insurance')
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

// ── POST /api/admin/workshops/:id/logo ── upload logo to Cloudinary + save URL
router.post('/workshops/:id/logo', authenticate, requireSuperAdmin, upload.single('logo'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const cloudName = (process.env.VITE_CLOUDINARY_CLOUD_NAME || 'nohkn9qb').trim();
    const uploadPreset = (process.env.VITE_CLOUDINARY_UPLOAD_PRESET || 'workshop-images').replace(/\s*[\(\[].*/, '').trim();
    const fd = new FormData();
    fd.append('file', new Blob([req.file.buffer], { type: req.file.mimetype }), req.file.originalname);
    fd.append('upload_preset', uploadPreset);
    const r = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: 'POST', body: fd });
    const d = await r.json();
    if (!r.ok) throw new Error(`Cloudinary upload failed: ${d?.error?.message || r.status}`);
    const logo_url = d.secure_url;
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

// ── PATCH /api/admin/bookings/:id ── update booking status
router.patch('/bookings/:id', authenticate, requireSuperAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const validStatuses = ['pending', 'contacted', 'confirmed', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
    }

    const { data, error } = await supabase
      .from('consumer_bookings')
      .update({ status })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, booking: data });
  } catch (err) { next(err); }
});

export default router;
