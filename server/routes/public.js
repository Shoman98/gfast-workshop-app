/**
 * PUBLIC ROUTES - No auth required
 * Used by consumer-facing apps (wreck-vision) to fetch workshop listings
 */

import express from 'express';
import { supabase } from '../db/supabase.js';

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
      .select('workshop_id, workshop_name, display_name, city, phone, stars, review_text, badges')
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

    res.json({ success: true, booking: data });
  } catch (err) {
    next(err);
  }
});

export default router;
