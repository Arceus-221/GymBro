import { useCallback, useRef, useState } from 'react';
import { callBackend, ApiError } from '../services/apiClient';
import { useConnectivityStore } from '../store/useConnectivityStore';
import { useUIStore } from '../store/useUIStore';

// If nothing has come back by this point, we're most likely waiting on a
// Render cold container rather than Gemini latency (Phase 5 §1.2 Layer 2).
const SLOW_REQUEST_HINT_DELAY_MS = 4000;

/**
 * Client-side copy for the backend's standardized error codes (Phase 2 §7.6,
 * Phase 4 §5.5, Phase 5 §2.4). Anything unmapped falls back to the server's
 * own message, which is already written to be toast-safe.
 */
const ERROR_COPY = {
  AI_RATE_LIMITED: 'Coach is a little busy — try again in a few seconds',
  AI_TOKEN_RATE_LIMITED: 'Coach is a little busy — try again in a few seconds',
  AI_DAILY_QUOTA_EXCEEDED: 'AI features have hit today’s usage limit — please try again tomorrow',
  AI_QUEUE_FULL: 'Coach is handling a lot of requests right now — try again shortly',
  USER_THROTTLED: 'Give it a second before sending another request',
  AI_TIMEOUT: 'That took too long — check your connection and retry',
  AI_PROVIDER_DOWN: 'AI features are temporarily unavailable',
  AI_MALFORMED_OUTPUT: 'Something went wrong generating that — please retry',
  AI_UNKNOWN_ERROR: 'Something went wrong — please try again',
  ONBOARDING_INCOMPLETE: 'Finish setting up your profile first',
};

export function useCallBackend() {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingHint, setLoadingHint] = useState(null); // null | 'normal' | 'slow'
  const [error, setError] = useState(null);
  const hintTimerRef = useRef(null);
  const showError = useUIStore((s) => s.showError);

  const execute = useCallback(
    async (endpoint, body, { silent = false } = {}) => {
      // Path B has no offline story — short-circuit rather than letting fetch
      // hang until it times out (Phase 3 §3.3).
      if (!useConnectivityStore.getState().isOnline) {
        const offlineError = new ApiError(
          'You’re offline — AI features need a connection.',
          'OFFLINE',
          0
        );
        setError(offlineError);
        if (!silent) showError(offlineError.message);
        throw offlineError;
      }

      setIsLoading(true);
      setError(null);
      setLoadingHint('normal');
      hintTimerRef.current = setTimeout(
        () => setLoadingHint('slow'),
        SLOW_REQUEST_HINT_DELAY_MS
      );

      try {
        return await callBackend(endpoint, body);
      } catch (err) {
        setError(err);
        if (!silent && err.code !== 'AUTH_CHANGED') showError(ERROR_COPY[err.code] || err.message);
        throw err;
      } finally {
        clearTimeout(hintTimerRef.current);
        setIsLoading(false);
        setLoadingHint(null);
      }
    },
    [showError]
  );

  return { execute, isLoading, loadingHint, error };
}
