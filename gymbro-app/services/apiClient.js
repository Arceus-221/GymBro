// services/apiClient.js
// Reusable helper for all backend AI calls (Path B). See Phase 1 §3I and
// Phase 5 §1.2 for full rationale.
import { auth } from './firebase';

const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://gymbro-api.onrender.com';

/**
 * Preserves the backend's standardized error contract (Phase 2 §7.6) so callers
 * can branch on `code` instead of string-matching a message.
 */
export class ApiError extends Error {
  constructor(message, code, status) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export const callBackend = async (endpoint, body) => {
  const user = auth.currentUser;
  if (!user) {
    throw new ApiError('You need to be signed in to do that.', 'NOT_AUTHENTICATED', 401);
  }

  const startedAt = Date.now();
  let stage = 'getting-token';
  const log = (details) => {
    if (__DEV__) console.info('[api]', { endpoint, stage, elapsedMs: Date.now() - startedAt, ...details });
  };
  log({ backend: BASE_URL });

  try {
    const idToken = await user.getIdToken(/* forceRefresh */ false);
    stage = 'requesting-backend';
    log({});

    const response = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    });
    stage = 'reading-response';
    log({ status: response.status, requestId: response.headers.get('X-Request-ID') });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new ApiError(
        payload?.message || 'Backend request failed',
        payload?.error || 'AI_UNKNOWN_ERROR',
        response.status
      );
    }

    if (auth.currentUser !== user) {
      throw new ApiError('The signed-in account changed.', 'AUTH_CHANGED', 0);
    }
    return payload;
  } catch (error) {
    log({ failed: true, code: error.code ?? null, status: error.status ?? null, message: error.message });
    throw error;
  }
};

/**
 * Fire-and-forget wake ping — gets Render's container spinning up in the
 * background before the user reaches a screen that actually needs it.
 * Errors are swallowed; a failed wake ping is not user-facing.
 */
export const wakeBackend = () => {
  fetch(`${BASE_URL}/health`).catch(() => {
    // Intentionally silent — this is opportunistic, not required for correctness
  });
};
