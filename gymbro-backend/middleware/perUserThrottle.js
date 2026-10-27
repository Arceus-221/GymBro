// Prevents one client from filling all shared Gemini queue slots by itself.
// In-memory only — fine for Render's single free-tier instance (Phase 5 §2.5).
// Swap for a Redis-backed counter if this ever moves to multi-instance.

const userLastRequestMap = new Map(); // uid -> timestamp
const MIN_INTERVAL_MS = 2000;

const perUserThrottle = (req, res, next) => {
  const uid = req.user?.uid;
  if (!uid) return next(); // verifyToken runs first; this should never happen

  const now = Date.now();
  const last = userLastRequestMap.get(uid) || 0;

  if (now - last < MIN_INTERVAL_MS) {
    return res.status(429).json({
      success: false,
      error: 'USER_THROTTLED',
      message: 'Please wait a moment before sending another request.',
    });
  }

  userLastRequestMap.set(uid, now);
  next();
};

module.exports = perUserThrottle;
