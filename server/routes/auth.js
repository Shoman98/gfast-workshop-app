/**
 * AUTH ROUTES - Workshop login with workshop_id + PIN
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import { supabase } from '../db/supabase.js';
import { generateToken, verifyToken } from '../middleware/auth.js';
import bcrypt from 'bcrypt';

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'محاولات كثيرة. يرجى الانتظار 15 دقيقة والمحاولة مجددا' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * POST /api/auth/login
 * Login with workshop_id + PIN
 * Returns JWT token for session management
 */
router.post('/login', loginLimiter, async (req, res, next) => {
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

    console.log(`🔍 Supabase query result: data=${JSON.stringify(workshop)}, error=${JSON.stringify(error)}`);
    console.log(`🔍 SUPABASE_URL=${process.env.SUPABASE_URL}`);

    if (error || !workshop) {
      console.log(`❌ Login failed: Workshop ${workshop_id} not found. Supabase error: ${JSON.stringify(error)}`);
      return res.status(401).json({ error: 'Invalid workshop_id or PIN' });
    }

    console.log(`✅ Workshop found: ${workshop.workshop_id}, is_active: ${workshop.is_active}, hash: ${workshop.pin_hash?.substring(0, 20)}`);

    // Verify PIN
    const isPinValid = await bcrypt.compare(pin, workshop.pin_hash);
    console.log(`🔑 PIN valid: ${isPinValid}`);
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
