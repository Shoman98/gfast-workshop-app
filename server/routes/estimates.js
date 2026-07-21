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
 * Get a single estimate with all its parts
 */
router.get('/:estimateId', authenticate, async (req, res, next) => {
  try {
    const { estimateId } = req.params;
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

    if (error) {
      console.error('❌ GET estimate error:', error);
      return res.status(500).json({ error: 'Failed to fetch estimate', details: error.message });
    }

    if (!estimate) {
      console.error('❌ Estimate not found:', estimateId);
      return res.status(404).json({ error: 'Estimate not found' });
    }

    console.log('✅ GET estimate success:', {
      estimateId: estimate.estimate_id,
      hasEstimateParts: !!estimate.estimate_parts,
      estimatePartsLength: estimate.estimate_parts?.length || 0,
      estimatePartsData: estimate.estimate_parts,
    });

    res.json({
      success: true,
      estimate,
    });
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
    const { vehicleYear, vehicleMake, vehicleModel, vehicle_year, vehicle_make, vehicle_model, vin_number, customer_name, customer_mobile, parts, labors, status } = req.body;
    const year = vehicleYear || vehicle_year;
    const make = vehicleMake || vehicle_make;
    const model = vehicleModel || vehicle_model;

    console.log('📥 POST /api/estimates received:', {
      workshopId,
      status,
      vehicleInfo: { year, make, model },
      partsCount: parts?.length || 0,
      laborsCount: labors?.length || 0,
      partsArray: parts ? parts.slice(0, 2) : 'NO PARTS',
    });

    // Create estimate
    const estimateData = {
      workshop_id: workshopId,
      vehicle_year: year,
      vehicle_make: make,
      vehicle_model: model,
      vin_number: vin_number || null,
      customer_name: customer_name || null,
      customer_mobile: customer_mobile || null,
      status: status || 'draft',
      labors: labors || [],
    };

    // If status is confirmed, set confirmed_at timestamp
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
