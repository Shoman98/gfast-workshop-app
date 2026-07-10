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
      .from('workshop_app.workshops')
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
        .from('workshop_app.workshops')
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

    // Generate JWT token
    const token = generateToken(workshop_id);

    console.log(`✅ Login successful: ${workshop_name || workshop.workshop_name} (${workshop_id})`);

    res.json({
      success: true,
      token,
      workshop: {
        workshop_id: workshop.workshop_id,
        workshop_name: workshop_name || workshop.workshop_name,
        category: workshop.category,
        city: location || workshop.city,
        phone: phone || workshop.phone,
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
      .from('workshop_app.workshops')
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

export default router;
