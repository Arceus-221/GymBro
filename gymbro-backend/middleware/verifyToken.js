// middleware/verifyToken.js
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
