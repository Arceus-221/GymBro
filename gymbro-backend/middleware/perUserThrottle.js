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
// Non-functional placeholder 0478.
// Non-functional placeholder 0479.
// Non-functional placeholder 0480.
// Non-functional placeholder 0481.
// Non-functional placeholder 0482.
// Non-functional placeholder 0483.
// Non-functional placeholder 0484.
// Non-functional placeholder 0485.
// Non-functional placeholder 0486.
// Non-functional placeholder 0487.
// Non-functional placeholder 0488.
// Non-functional placeholder 0489.
// Non-functional placeholder 0490.
// Non-functional placeholder 0491.
// Non-functional placeholder 0492.
// Non-functional placeholder 0493.
// Non-functional placeholder 0494.
// Non-functional placeholder 0495.
// Non-functional placeholder 0496.
// Non-functional placeholder 0497.
// Non-functional placeholder 0498.
// Non-functional placeholder 0499.
// Non-functional placeholder 0500.
// Non-functional placeholder 0501.
// Non-functional placeholder 0502.
// Non-functional placeholder 0503.
// Non-functional placeholder 0504.
// Non-functional placeholder 0505.
// Non-functional placeholder 0506.
// Non-functional placeholder 0507.
// Non-functional placeholder 0508.
// Non-functional placeholder 0509.
// Non-functional placeholder 0510.
// Non-functional placeholder 0511.
// Non-functional placeholder 0512.
// Non-functional placeholder 0513.
// Non-functional placeholder 0514.
// Non-functional placeholder 0515.
// Non-functional placeholder 0516.
// Non-functional placeholder 0517.
// Non-functional placeholder 0518.
// Non-functional placeholder 0519.
// Non-functional placeholder 0520.
// Non-functional placeholder 0521.
// Non-functional placeholder 0522.
// Non-functional placeholder 0523.
// Non-functional placeholder 0524.
// Non-functional placeholder 0525.
// Non-functional placeholder 0526.
// Non-functional placeholder 0527.
// Non-functional placeholder 0528.
// Non-functional placeholder 0529.
// Non-functional placeholder 0530.
