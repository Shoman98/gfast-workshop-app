/**
 * AUTH MIDDLEWARE - JWT token generation and validation
 */

import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

/**
 * Generate JWT token for workshop
 */
export function generateToken(workshopId, isSuperAdmin = false) {
  return jwt.sign(
    { workshop_id: workshopId, is_super_admin: isSuperAdmin },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
}

/**
 * Generate a short-lived, scoped token for the pricing section.
 * Issued only after a successful step-up (single-use access code).
 */
export function generatePricingToken(workshopId) {
  return jwt.sign(
    { workshop_id: workshopId, scope: 'pricing' },
    JWT_SECRET,
    { expiresIn: '2h' }
  );
}

/**
 * Verify JWT token
 */
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

/**
 * Express middleware to authenticate requests
 */
export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.substring(7);
  const decoded = verifyToken(token);

  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Attach workshop_id, scope, and super-admin flag to request
  req.workshop_id = decoded.workshop_id;
  req.token_scope = decoded.scope || null;
  req.is_super_admin = decoded.is_super_admin === true;
  next();
}

/**
 * Guard for pricing-section data routes: requires a token minted by the
 * step-up flow (scope 'pricing'). A normal login token is rejected with 403
 * so the client knows to run the step-up.
 */
export function requirePricingScope(req, res, next) {
  if (req.token_scope !== 'pricing') {
    return res.status(403).json({ error: 'step-up required', code: 'STEP_UP_REQUIRED' });
  }
  next();
}
