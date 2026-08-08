/**
 * ESTIMATES ROUTES - CRUD operations for estimates
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../db/supabase.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/estimates
 * List all estimates for the authenticated workshop
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const workshopId = req.workshop_id;
    const { status } = req.query; // Optional filter by status

    let query = supabase
      .from('estimates')
      .select(`
        *,
        estimate_parts:estimate_parts(*)
      `)
      .eq('workshop_id', workshopId)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data: estimates, error } = await query;

    if (error) throw error;

    res.json({
      success: true,
      count: estimates?.length || 0,
      estimates,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/estimates/:id
 * Get a single estimate with all its parts + supplement chain
 */
router.get('/:estimateId', authenticate, async (req, res, next) => {
  try {
    const { estimateId } = req.params;
    const workshopId = req.workshop_id;

    const { data: estimate, error } = await supabase
      .from('estimates')
      .select(`*, estimate_parts:estimate_parts(*)`)
      .eq('estimate_id', estimateId)
      .eq('workshop_id', workshopId)
      .single();

    if (error) {
      console.error('❌ GET estimate error:', error);
      return res.status(500).json({ error: 'Failed to fetch estimate', details: error.message });
    }
    if (!estimate) {
      return res.status(404).json({ error: 'Estimate not found' });
    }

    // Fetch supplement chain (children of this estimate OR siblings if this is a supplement)
    const rootId = estimate.parent_estimate_id || estimate.estimate_id;
    const { data: chain } = await supabase
      .from('estimates')
      .select('estimate_id, status, confirmed_at, created_at, parent_estimate_id, pricing_data')
      .eq('workshop_id', workshopId)
      .or(`estimate_id.eq.${rootId},parent_estimate_id.eq.${rootId}`)
      .order('created_at', { ascending: true });

    res.json({ success: true, estimate, chain: chain || [] });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/estimates/:id/accept-insurance-offer
 * Workshop accepts insurance's negotiated pricing as-is
 */
router.patch('/:estimateId/accept-insurance-offer', authenticate, async (req, res, next) => {
  try {
    const { estimateId } = req.params;
    const workshopId = req.workshop_id;

    const { data: estimate } = await supabase
      .from('estimates')
      .select('estimate_id, status, insurance_negotiated_pricing')
      .eq('estimate_id', estimateId)
      .eq('workshop_id', workshopId)
      .single();

    if (!estimate) return res.status(404).json({ error: 'Estimate not found' });
    if (estimate.status !== 'counter_offer') {
      return res.status(400).json({ error: 'Estimate is not in negotiate state' });
    }
    if (!estimate.insurance_negotiated_pricing) {
      return res.status(400).json({ error: 'No insurance negotiated pricing found' });
    }

    // Workshop accepted the insurance offer — flag it for insurance to do final approval
    const { data: updated, error } = await supabase
      .from('estimates')
      .update({ status: 'workshop_accepted' })
      .eq('estimate_id', estimateId)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, estimate: updated });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/estimates/:id/negotiate-draft
 * Auto-save workshop edits without changing status (real-time sync)
 */
router.patch('/:estimateId/negotiate-draft', authenticate, async (req, res, next) => {
  try {
    const { estimateId } = req.params;
    const workshopId = req.workshop_id;
    const { workshop_counter_offer_pricing, workshop_labor_comments, workshop_part_comments } = req.body;

    const updateData = {};
    if (workshop_counter_offer_pricing !== undefined) updateData.workshop_counter_offer_pricing = workshop_counter_offer_pricing;
    if (workshop_labor_comments        !== undefined) updateData.workshop_labor_comments        = workshop_labor_comments;
    if (workshop_part_comments         !== undefined) updateData.workshop_part_comments         = workshop_part_comments;

    const { error } = await supabase
      .from('estimates')
      .update(updateData)
      .eq('estimate_id', estimateId)
      .eq('workshop_id', workshopId);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/estimates/:id/negotiate-revision
 * Workshop re-confirms pricing after reviewing insurance negotiate offer
 */
router.patch('/:estimateId/negotiate-revision', authenticate, async (req, res, next) => {
  try {
    const { estimateId } = req.params;
    const workshopId = req.workshop_id;
    const { workshop_counter_offer_pricing, workshop_labor_comments, workshop_part_comments } = req.body;

    const { data: estimate } = await supabase
      .from('estimates')
      .select('estimate_id, status, extra_images_by_workshop')
      .eq('estimate_id', estimateId)
      .eq('workshop_id', workshopId)
      .single();

    if (!estimate) return res.status(404).json({ error: 'Estimate not found' });
    const negotiableStatuses = ['counter_offer', 'workshop_revised'];
    if (!negotiableStatuses.includes(estimate.status)) {
      return res.status(400).json({ error: 'Estimate is not in negotiate state' });
    }

    // Try to save workshop_counter_offer_pricing — column added by workshop-negotiate-migration.sql
    // If column doesn't exist yet, save only the status change
    let updated, updateError;
    ({ data: updated, error: updateError } = await supabase
      .from('estimates')
      .update({ workshop_counter_offer_pricing, status: 'workshop_revised' })
      .eq('estimate_id', estimateId)
      .select()
      .single());

    if (updateError) {
      if (updateError.message?.includes("workshop_counter_offer_pricing")) {
        // Column missing — apply migration first. Save status only for now.
        ({ data: updated, error: updateError } = await supabase
          .from('estimates')
          .update({ status: 'workshop_revised' })
          .eq('estimate_id', estimateId)
          .select()
          .single());
        if (updateError) throw updateError;
      } else {
        throw updateError;
      }
    }

    // Optional columns (workshop_labor_comments, workshop_part_comments) — ignore if missing
    const extras = {};
    if (workshop_labor_comments !== undefined) extras.workshop_labor_comments = workshop_labor_comments;
    if (workshop_part_comments  !== undefined) extras.workshop_part_comments  = workshop_part_comments;
    if (Object.keys(extras).length > 0) {
      try {
        await supabase.from('estimates').update(extras).eq('estimate_id', estimateId);
      } catch { /* ignore if columns don't exist */ }
    }

    // Promote pending negotiate-page images to insurance-visible (clear the pending flag)
    try {
      const imgs = Array.isArray(estimate.extra_images_by_workshop) ? estimate.extra_images_by_workshop : [];
      if (imgs.some(i => i && i.pending)) {
        const promoted = imgs.map(i => ({ ...i, pending: false }));
        await supabase.from('estimates').update({ extra_images_by_workshop: promoted }).eq('estimate_id', estimateId);
      }
    } catch { /* ignore if column doesn't exist */ }

    res.json({ success: true, estimate: updated });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/estimates/:id/workshop-extra-images
 * Workshop uploads an extra image during negotiation. Stored with pending:true
 * so the insurance only sees it after the workshop sends the revision.
 * Body: { cloudinary_url, cloudinary_public_id }
 */
router.post('/:estimateId/workshop-extra-images', authenticate, async (req, res, next) => {
  try {
    const { estimateId } = req.params;
    const workshopId = req.workshop_id;
    const { cloudinary_url, cloudinary_public_id } = req.body;
    if (!cloudinary_url) return res.status(400).json({ error: 'Missing cloudinary_url' });

    const { data: est, error: fetchErr } = await supabase
      .from('estimates')
      .select('extra_images_by_workshop')
      .eq('estimate_id', estimateId)
      .eq('workshop_id', workshopId)
      .single();
    if (fetchErr) throw fetchErr;
    if (!est) return res.status(404).json({ error: 'Estimate not found' });

    const image = { id: cloudinary_public_id || `img_${Date.now()}`, cloudinary_url, pending: true };
    const existing = Array.isArray(est.extra_images_by_workshop) ? est.extra_images_by_workshop : [];
    const updated = [...existing, image];

    const { error } = await supabase
      .from('estimates')
      .update({ extra_images_by_workshop: updated })
      .eq('estimate_id', estimateId)
      .eq('workshop_id', workshopId);
    if (error) throw error;

    res.json({ success: true, image });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/estimates/:id/status
 * Advance the estimate status in the workflow
 */
router.patch('/:estimateId/status', authenticate, async (req, res, next) => {
  try {
    const { estimateId } = req.params;
    const workshopId = req.workshop_id;
    const { status, insurance_notes } = req.body;

    const allowed = ['confirmed', 'approved_by_insurance', 'rejected_by_insurance', 'counter_offer', 'workshop_revised', 'workshop_accepted', 'settled'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${allowed.join(', ')}` });
    }

    const { data: estimate } = await supabase
      .from('estimates')
      .select('estimate_id, status')
      .eq('estimate_id', estimateId)
      .eq('workshop_id', workshopId)
      .single();

    if (!estimate) return res.status(404).json({ error: 'Estimate not found' });

    const updateData = { status };
    if (status === 'settled') updateData.settled_at = new Date().toISOString();
    if (insurance_notes) updateData.insurance_notes = insurance_notes;

    const { data: updated, error } = await supabase
      .from('estimates')
      .update(updateData)
      .eq('estimate_id', estimateId)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, estimate: updated });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/estimates
 * Create a new estimate (draft) from analysis results
 */
router.post('/', authenticate, async (req, res, next) => {
  try {
    const workshopId = req.workshop_id;
    const { vehicleYear, vehicleMake, vehicleModel, vehicle_year, vehicle_make, vehicle_model, vin_number, customer_name, customer_mobile, parts, labors, status, pricing_data, parent_estimate_id } = req.body;
    const year = vehicleYear || vehicle_year;
    const make = vehicleMake || vehicle_make;
    const model = vehicleModel || vehicle_model;

    console.log('📥 POST /api/estimates received:', {
      workshopId,
      status,
      vehicleInfo: { year, make, model },
      partsCount: parts?.length || 0,
      laborsCount: labors?.length || 0,
      hasPricingData: !!pricing_data,
      pricingDataKeys: pricing_data ? Object.keys(pricing_data) : [],
      pricingDataSummary: pricing_data ? {
        repairGroups: pricing_data.repair_groups?.length ?? 'missing',
        replaceGroups: pricing_data.replace_groups?.length ?? 'missing',
        partPrices: pricing_data.part_prices?.length ?? 'missing',
        grandTotal: pricing_data.grand_total ?? 'missing',
      } : 'NULL',
    });

    // RULE: an estimate + all its supplementary estimates belong to exactly
    // ONE vehicle, identified by its VIN. So when this is a supplement
    // (parent_estimate_id set), the vehicle/VIN is inherited from the parent
    // (root) estimate and is authoritative — client-sent values are ignored,
    // preventing a supplement from ever drifting to a different VIN.
    let vehYear = year, vehMake = make, vehModel = model, vehVin = vin_number || null;
    if (parent_estimate_id) {
      const { data: parent, error: parentErr } = await supabase
        .from('estimates')
        .select('vin_number, vehicle_year, vehicle_make, vehicle_model, workshop_id')
        .eq('estimate_id', parent_estimate_id)
        .single();
      if (parentErr || !parent) {
        return res.status(400).json({ error: 'المقايسة الأصلية غير موجودة' });
      }
      if (parent.workshop_id !== workshopId) {
        return res.status(403).json({ error: 'غير مصرح بإضافة ملحق لهذه المقايسة' });
      }
      vehVin   = parent.vin_number ?? null;
      vehYear  = parent.vehicle_year;
      vehMake  = parent.vehicle_make;
      vehModel = parent.vehicle_model;
    }

    // RULE: VIN is required for a root estimate (supplements inherit it).
    // Enforce once the estimate is being confirmed (drafts may still be incomplete).
    if (!parent_estimate_id && status === 'confirmed' && !String(vehVin || '').trim()) {
      return res.status(400).json({ error: 'رقم الشاسيه (VIN) مطلوب لتأكيد المقايسة' });
    }

    // Create estimate
    const estimateData = {
      workshop_id: workshopId,
      vehicle_year: vehYear,
      vehicle_make: vehMake,
      vehicle_model: vehModel,
      vin_number: vehVin,
      customer_name: customer_name || null,
      customer_mobile: customer_mobile || null,
      status: status || 'draft',
      labors: labors || [],
      pricing_data: pricing_data || null,
      parent_estimate_id: parent_estimate_id || null,
    };

    if (status === 'confirmed') {
      estimateData.confirmed_at = new Date().toISOString();
    }

    if (req.body.insurance_company_id) {
      estimateData.insurance_company_id = req.body.insurance_company_id;
    }

    const { data: estimate, error: estimateError } = await supabase
      .from('estimates')
      .insert(estimateData)
      .select()
      .single();

    if (estimateError) throw estimateError;

    // Add parts to estimate
    if (parts && Array.isArray(parts)) {
      const partsData = parts.map((part) => ({
        estimate_id: estimate.estimate_id,
        part_name_en: part.part_name_en,
        part_name_ar: part.part_name_ar,
        part_id: part.part_id,
        damage_type: part.damage_type,
        confidence: part.confidence,
        severity_label: part.severity_label || 'Repair',
        ai_original_severity: part.ai_original_severity || null,
        price: part.price || 0,
        is_ai_detected: part.is_ai_detected !== false,
      }));

      console.log('💾 Saving parts for estimate', estimate.estimate_id, ':', {
        totalParts: partsData.length,
        replaceParts: partsData.filter(p => p.severity_label === 'Replace').length,
        sampleParts: partsData.slice(0, 2),
      });

      const { error: partsError } = await supabase
        .from('estimate_parts')
        .insert(partsData);

      if (partsError) {
        console.error('❌ Error saving parts:', partsError);
        throw partsError;
      }
      console.log('✅ Parts saved successfully');
    }

    res.json({
      success: true,
      estimate_id: estimate.estimate_id,
      message: 'Estimate created successfully',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/estimates/:id/part/:partId
 * Update a part in the estimate (edit severity, price, etc.)
 */
router.put('/:estimateId/part/:partId', authenticate, async (req, res, next) => {
  try {
    const { estimateId, partId } = req.params;
    const workshopId = req.workshop_id;
    const { severity_label, price, part_name_en } = req.body;

    // Verify estimate belongs to workshop
    const { data: estimate, error: checkError } = await supabase
      .from('estimates')
      .select('estimate_id')
      .eq('estimate_id', estimateId)
      .eq('workshop_id', workshopId)
      .single();

    if (checkError || !estimate) {
      return res.status(403).json({ error: 'Estimate not found or access denied' });
    }

    // Update part
    const updateData = {};
    if (severity_label) updateData.severity_label = severity_label;
    if (price !== undefined) updateData.price = price;
    if (part_name_en) updateData.part_name_en = part_name_en;
    updateData.edited_at = new Date().toISOString();

    const { data: updated, error } = await supabase
      .from('estimate_parts')
      .update(updateData)
      .eq('estimate_part_id', partId)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      part: updated,
      message: 'Part updated successfully',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/estimates/:id/part/:partId
 * Remove a part from the estimate
 */
router.delete('/:estimateId/part/:partId', authenticate, async (req, res, next) => {
  try {
    const { estimateId, partId } = req.params;
    const workshopId = req.workshop_id;

    // Verify estimate belongs to workshop
    const { data: estimate } = await supabase
      .from('estimates')
      .select('estimate_id')
      .eq('estimate_id', estimateId)
      .eq('workshop_id', workshopId)
      .single();

    if (!estimate) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Delete part
    const { error } = await supabase
      .from('estimate_parts')
      .delete()
      .eq('estimate_part_id', partId);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Part removed successfully',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/estimates/:id/confirm
 * Confirm and lock the estimate
 */
router.post('/:estimateId/confirm', authenticate, async (req, res, next) => {
  try {
    const { estimateId } = req.params;
    const workshopId = req.workshop_id;

    // Verify estimate belongs to workshop
    const { data: estimate, error: checkError } = await supabase
      .from('estimates')
      .select('*')
      .eq('estimate_id', estimateId)
      .eq('workshop_id', workshopId)
      .single();

    if (checkError || !estimate) {
      return res.status(403).json({ error: 'Estimate not found or access denied' });
    }

    // RULE: VIN is required to confirm a root estimate (supplements inherit it).
    if (!estimate.parent_estimate_id && !String(estimate.vin_number || '').trim()) {
      return res.status(400).json({ error: 'رقم الشاسيه (VIN) مطلوب لتأكيد المقايسة' });
    }

    // Calculate totals from parts
    const { data: parts } = await supabase
      .from('estimate_parts')
      .select('price')
      .eq('estimate_id', estimateId);

    const totalCost = parts?.reduce((sum, p) => sum + (p.price || 0), 0) || 0;

    // Confirm estimate
    const { data: confirmed, error } = await supabase
      .from('estimates')
      .update({
        status: 'confirmed',
        confirmed_at: new Date().toISOString(),
        total_cost_min: totalCost,
        total_cost_max: totalCost,
      })
      .eq('estimate_id', estimateId)
      .select()
      .single();

    if (error) throw error;

    console.log(`✅ Estimate confirmed: ${estimateId}`);

    res.json({
      success: true,
      estimate: confirmed,
      message: 'Estimate confirmed and locked',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/estimates/:estimateId/audit-logs
 * Log an audit action (part edit, labor change, etc.)
 */
router.post('/:estimateId/audit-logs', authenticate, async (req, res, next) => {
  try {
    const { estimateId } = req.params;
    const workshopId = req.workshop_id;
    const { action_type, target_type, field, old_value, new_value, action_description_ar } = req.body;

    if (!action_type || !action_description_ar) {
      return res.status(400).json({ error: 'action_type and action_description_ar required' });
    }

    const logId = uuidv4();
    const timestamp = new Date().toISOString();

    const logEntry = {
      id: logId,
      estimate_id: estimateId,
      workshop_id: workshopId,
      action_type,
      target_type: target_type || null,
      field: field || null,
      old_value: old_value || null,
      new_value: new_value || null,
      action_description_ar,
      timestamp,
      created_at: timestamp,
    };

    const { data: log, error } = await supabase
      .from('estimate_audit_logs')
      .insert([logEntry]);

    if (error) {
      console.warn('Failed to insert audit log:', error);
      // Still return success even if audit log fails
    }

    res.json({
      success: true,
      logId,
      timestamp,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/estimates/:estimateId/audit-logs
 * Fetch all audit logs for an estimate
 */
router.get('/:estimateId/audit-logs', authenticate, async (req, res, next) => {
  try {
    const { estimateId } = req.params;
    const workshopId = req.workshop_id;

    const { data: logs, error } = await supabase
      .from('estimate_audit_logs')
      .select('*')
      .eq('estimate_id', estimateId)
      .eq('workshop_id', workshopId)
      .order('timestamp', { ascending: true });

    if (error) {
      console.warn('Failed to fetch audit logs:', error);
      return res.json({ logs: [] }); // Return empty logs if fetch fails
    }

    res.json({
      success: true,
      logs: logs || [],
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/estimates/:id/export
 * Export estimate as JSON/CSV
 */
router.get('/:estimateId/export', authenticate, async (req, res, next) => {
  try {
    const { estimateId } = req.params;
    const { format = 'json' } = req.query; // json or csv
    const workshopId = req.workshop_id;

    const { data: estimate, error } = await supabase
      .from('estimates')
      .select(`
        *,
        estimate_parts:estimate_parts(*)
      `)
      .eq('estimate_id', estimateId)
      .eq('workshop_id', workshopId)
      .single();

    if (error || !estimate) {
      return res.status(404).json({ error: 'Estimate not found' });
    }

    if (format === 'csv') {
      // Generate CSV
      let csv = 'Part Name,Part Name AR,Damage Type,Severity,Price EGP\n';
      estimate.estimate_parts.forEach((part) => {
        csv += `"${part.part_name_en}","${part.part_name_ar || ''}","${part.damage_type || ''}","${part.severity_label}",${part.price}\n`;
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=estimate-${estimateId}.csv`);
      res.send(csv);
    } else {
      // JSON (default)
      res.json({
        estimate,
        exportedAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    next(err);
  }
});

export default router;
