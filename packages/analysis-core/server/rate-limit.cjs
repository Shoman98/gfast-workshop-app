const rateLimitStore = new Map();
const MAX_RATE_LIMIT_KEYS = 5000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

function cleanupRateLimitStore(now = Date.now()) {
  for (const [key, entry] of rateLimitStore.entries()) {
    if (!entry || now >= entry.resetAt) {
      rateLimitStore.delete(key);
    }
  }

  if (rateLimitStore.size <= MAX_RATE_LIMIT_KEYS) return;

  const entriesByExpiry = [...rateLimitStore.entries()].sort(
    ([, left], [, right]) => left.resetAt - right.resetAt,
  );
  const overflow = rateLimitStore.size - MAX_RATE_LIMIT_KEYS;
  for (const [key] of entriesByExpiry.slice(0, overflow)) {
    rateLimitStore.delete(key);
  }
}

const cleanupTimer = setInterval(cleanupRateLimitStore, CLEANUP_INTERVAL_MS);
cleanupTimer.unref?.();

function getClientIp(req) {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim().length > 0) {
    return forwardedFor.split(",")[0].trim();
  }

  return (
    req.ip ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

function createRateLimit({ windowMs, maxRequests, keyPrefix, message }) {
  if (!windowMs || !maxRequests || !keyPrefix) {
    throw new Error("Rate limit configuration is incomplete.");
  }

  return function rateLimitMiddleware(req, res, next) {
    const now = Date.now();
    cleanupRateLimitStore(now);
    const clientKey = `${keyPrefix}:${getClientIp(req)}`;
    const existingEntry = rateLimitStore.get(clientKey);

    if (!existingEntry || now >= existingEntry.resetAt) {
      rateLimitStore.set(clientKey, {
        count: 1,
        resetAt: now + windowMs,
      });
      return next();
    }

    if (existingEntry.count >= maxRequests) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((existingEntry.resetAt - now) / 1000),
      );

      res.setHeader("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({
        error: message || "Too many requests. Please try again later.",
        retryAfterSeconds,
        timestamp: new Date().toISOString(),
      });
    }

    existingEntry.count += 1;
    rateLimitStore.set(clientKey, existingEntry);
    return next();
  };
}

const demoRequestRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000,
  maxRequests: 10,
  keyPrefix: "demo-requests",
  message: "Too many demo requests from this IP. Please try again later.",
});

const analysisRateLimit = createRateLimit({
  windowMs: 10 * 60 * 1000,
  maxRequests: 10,
  keyPrefix: "damage-analysis",
  message:
    "Too many analysis requests from this IP. Please wait before trying again.",
});

const workshopFormRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000,
  maxRequests: 10,
  keyPrefix: "workshop-forms",
  message: "Too many workshop requests from this IP. Please try again later.",
});

const workshopAbandonmentRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000,
  maxRequests: 20,
  keyPrefix: "workshop-form-abandonments",
  message: "Too many workshop form events from this IP. Please try again later.",
});

module.exports = {
  createRateLimit,
  demoRequestRateLimit,
  analysisRateLimit,
  workshopFormRateLimit,
  workshopAbandonmentRateLimit,
};
