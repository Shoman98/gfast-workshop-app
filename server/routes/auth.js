/**
 * AUTH ROUTES - Workshop login with workshop_id + PIN
 */

import express from 'express';
import { supabase } from '../db/supabase.js';
import { generateToken, verifyToken } from '../middleware/auth.js';
import bcrypt from 'bcrypt';

const router = express.Router();


/**
 * POST /api/auth/login
 * Login with workshop_id + PIN
 * Returns JWT token for session management
 */
router.post('/login', async (req, res, next) => {
  try {
    const { workshop_id, pin, workshop_name, location, phone } = req.body;

    if (!workshop_id || !pin) {
      return res.status(400).json({ error: 'workshop_id and pin required' });
    }

    // Fetch workshop from database
    const { data: workshop, error } = await supabase
      .from('workshops')
      .select('*')
      .eq('workshop_id', workshop_id)
      .single();

    if (error || !workshop) {
      console.log(`❌ Login failed: Workshop ${workshop_id} not found`);
      return res.status(401).json({ error: 'Invalid workshop_id or PIN' });
    }

    // Verify PIN
    const isPinValid = await bcrypt.compare(pin, workshop.pin_hash);
    if (!isPinValid) {
      console.log(`❌ Login failed: Wrong PIN for workshop ${workshop_id}`);
      return res.status(401).json({ error: 'Invalid workshop_id or PIN' });
    }

    // Check if workshop is active
    if (!workshop.is_active) {
      return res.status(403).json({ error: 'Workshop account is inactive' });
    }

    // Update workshop profile with user-provided data (if provided)
    if (workshop_name || location || phone) {
      const { error: updateError } = await supabase
        .from('workshops')
        .update({
          ...(workshop_name && { workshop_name }),
          ...(location && { city: location }),
          ...(phone && { phone }),
          updated_at: new Date().toISOString(),
        })
        .eq('workshop_id', workshop_id);

      if (updateError) {
        console.warn('⚠️  Failed to update workshop profile:', updateError.message);
      }
    }

    // Fetch branches for this workshop
    const { data: branches, error: branchError } = await supabase
      .from('workshop_branches')
      .select('branch_id, branch_name, city, phone')
      .eq('workshop_id', workshop_id)
      .eq('is_active', true)
      .order('branch_name');

    if (branchError) {
      console.warn('⚠️  Failed to fetch branches:', branchError.message);
    }

    const activeBranches = branches || [];

    // If only one branch (or none), auto-select and return token immediately
    if (activeBranches.length <= 1) {
      const branch = activeBranches[0] || null;
      const token = generateToken(workshop_id, workshop.is_super_admin === true, branch?.branch_id || null);

      console.log(`✅ Login successful: ${workshop.workshop_name} (${workshop_id})${branch ? ` → ${branch.branch_name}` : ''}`);

      return res.json({
        success: true,
        token,
        workshop: {
          workshop_id: workshop.workshop_id,
          is_super_admin: workshop.is_super_admin === true,
          workshop_name: workshop_name || workshop.workshop_name,
          category: workshop.category,
          city: location || workshop.city,
          phone: phone || workshop.phone,
          branch: branch || null,
        },
      });
    }

    // Multiple branches — return list for client to pick from (no token yet)
    console.log(`✅ Login successful: ${workshop.workshop_name} (${workshop_id}) — branch selection required`);

    res.json({
      success: true,
      requires_branch_selection: true,
      workshop: {
        workshop_id: workshop.workshop_id,
        is_super_admin: workshop.is_super_admin === true,
        workshop_name: workshop_name || workshop.workshop_name,
        category: workshop.category,
      },
      branches: activeBranches,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/select-branch
 * Called after multi-branch login — verifies branch belongs to workshop and issues token
 */
router.post('/select-branch', async (req, res, next) => {
  try {
    const { workshop_id, branch_id } = req.body;

    if (!workshop_id || !branch_id) {
      return res.status(400).json({ error: 'workshop_id and branch_id required' });
    }

    // Verify branch belongs to this workshop
    const { data: branch, error } = await supabase
      .from('workshop_branches')
      .select('branch_id, branch_name, city, phone')
      .eq('branch_id', branch_id)
      .eq('workshop_id', workshop_id)
      .eq('is_active', true)
      .single();

    if (error || !branch) {
      return res.status(403).json({ error: 'Invalid branch selection' });
    }

    const { data: workshop } = await supabase
      .from('workshops')
      .select('workshop_name, category, is_super_admin')
      .eq('workshop_id', workshop_id)
      .single();

    const token = generateToken(workshop_id, workshop?.is_super_admin === true, branch_id);

    console.log(`✅ Branch selected: ${branch.branch_name} for ${workshop_id}`);

    res.json({
      success: true,
      token,
      workshop: {
        workshop_id,
        is_super_admin: workshop?.is_super_admin === true,
        workshop_name: workshop?.workshop_name,
        category: workshop?.category,
        branch,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/validate-token
 * Validate JWT token and return workshop info
 */
router.post('/validate-token', async (req, res, next) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'token required' });
    }

    // Validate token (implementation depends on JWT library used)
    // This is a placeholder - implement based on your JWT setup
    const decoded = verifyToken(token);

    if (!decoded) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Fetch workshop data
    const { data: workshop, error } = await supabase
      .from('workshops')
      .select('*')
      .eq('workshop_id', decoded.workshop_id)
      .single();

    if (error || !workshop) {
      return res.status(401).json({ error: 'Workshop not found' });
    }

    res.json({
      valid: true,
      workshop: {
        workshop_id: workshop.workshop_id,
        workshop_name: workshop.workshop_name,
        category: workshop.category,
        city: workshop.city,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/refresh
 * Refresh token if still valid — returns new 24h token
 */
router.post('/refresh', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.substring(7);
  const decoded = verifyToken(token);

  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const newToken = generateToken(decoded.workshop_id);
  res.json({ success: true, token: newToken });
});

export default router;
