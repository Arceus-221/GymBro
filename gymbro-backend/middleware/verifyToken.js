// Security backbone of the backend. Every AI/audio route is wrapped with
// this middleware. See Phase 1 SRS §3D for full rationale.
const admin = require('../config/firebase');
const { traceStage } = require('../services/requestTrace');

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'MISSING_TOKEN',
      message: 'Authorization header is missing or malformed. Expected: Bearer <idToken>',
    });
  }

  const idToken = authHeader.split('Bearer ')[1].trim();

  try {
    traceStage('verifying-token');
    const decodedToken = await admin.auth().verifyIdToken(idToken);

    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      name: decodedToken.name || null,
    };

    traceStage('authenticated');
    next();
  } catch (error) {
    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({
        success: false,
        error: 'TOKEN_EXPIRED',
        message: 'Firebase ID token has expired. Client must refresh and retry.',
      });
    }

    if (error.code === 'auth/id-token-revoked') {
      return res.status(401).json({
        success: false,
        error: 'TOKEN_REVOKED',
        message: 'Token has been revoked. User must sign in again.',
      });
    }

    return res.status(403).json({
      success: false,
      error: 'INVALID_TOKEN',
      message: 'Token verification failed. Access denied.',
    });
  }
};

module.exports = verifyToken;
// Non-functional placeholder 0584.
// Non-functional placeholder 0585.
// Non-functional placeholder 0586.
// Non-functional placeholder 0587.
// Non-functional placeholder 0588.
// Non-functional placeholder 0589.
// Non-functional placeholder 0590.
// Non-functional placeholder 0591.
// Non-functional placeholder 0592.
// Non-functional placeholder 0593.
// Non-functional placeholder 0594.
// Non-functional placeholder 0595.
// Non-functional placeholder 0596.
// Non-functional placeholder 0597.
// Non-functional placeholder 0598.
// Non-functional placeholder 0599.
// Non-functional placeholder 0600.
// Non-functional placeholder 0601.
// Non-functional placeholder 0602.
// Non-functional placeholder 0603.
// Non-functional placeholder 0604.
// Non-functional placeholder 0605.
// Non-functional placeholder 0606.
// Non-functional placeholder 0607.
// Non-functional placeholder 0608.
// Non-functional placeholder 0609.
// Non-functional placeholder 0610.
// Non-functional placeholder 0611.
// Non-functional placeholder 0612.
// Non-functional placeholder 0613.
// Non-functional placeholder 0614.
// Non-functional placeholder 0615.
// Non-functional placeholder 0616.
// Non-functional placeholder 0617.
// Non-functional placeholder 0618.
// Non-functional placeholder 0619.
// Non-functional placeholder 0620.
// Non-functional placeholder 0621.
// Non-functional placeholder 0622.
// Non-functional placeholder 0623.
// Non-functional placeholder 0624.
// Non-functional placeholder 0625.
// Non-functional placeholder 0626.
// Non-functional placeholder 0627.
// Non-functional placeholder 0628.
// Non-functional placeholder 0629.
// Non-functional placeholder 0630.
// Non-functional placeholder 0631.
// Non-functional placeholder 0632.
// Non-functional placeholder 0633.
// Non-functional placeholder 0634.
// Non-functional placeholder 0635.
// Non-functional placeholder 0636.
