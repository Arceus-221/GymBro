// Single entry point every controller uses for AI calls. Handles: shared
// rate-limit queueing (Phase 5 §2), retry-on-transient-failure, shape
// validation, and normalized error codes (Phase 2 §7.2, extended Phase 5 §2.3).
const { callGemini } = require('./geminiService');
const { geminiLimiter } = require('./geminiRateLimiter');
const { traceStage } = require('./requestTrace');

const MAX_RETRIES = 1; // one retry only — mobile users won't wait through more
const RETRY_DELAY_MS = 1200;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const callGeminiResilient = async (systemPrompt, userPrompt, maxTokens, validateShape = null) => {
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      traceStage('ai-queued', { attempt: attempt + 1 });
      const result = await geminiLimiter.schedule(async () => {
        traceStage('provider-started', { attempt: attempt + 1 });
        const output = await callGemini(systemPrompt, userPrompt, maxTokens);
        traceStage('provider-returned', { attempt: attempt + 1 });
        return output;
      });

      if (validateShape && !validateShape(result)) {
        throw Object.assign(new Error('AI_SCHEMA_VIOLATION'), { code: 'AI_SCHEMA_VIOLATION' });
      }

      traceStage('ai-complete');
      return result;
    } catch (error) {
      lastError = error;
      traceStage('ai-attempt-failed', {
        attempt: attempt + 1,
        code: error.code ?? null,
        status: error.response?.status ?? null,
      });

      const isQueueOverflow = error.message?.includes('This job has been dropped');
      if (isQueueOverflow) {
        throw Object.assign(
          new Error('Coach is handling a lot of requests right now. Please try again shortly.'),
          { httpStatus: 503, code: 'AI_QUEUE_FULL' }
        );
      }

      const status = error.response?.status;
      const isRateLimit = status === 429;
      const isServerError = status >= 500 && status < 600;
      const isTimeout = error.code === 'ECONNABORTED';
      const isMalformedJson = error instanceof SyntaxError;
      const isSchemaViolation = error.code === 'AI_SCHEMA_VIOLATION' || error.code === 'AI_OUTPUT_TRUNCATED';

      const normalized = isRateLimit ? normalizeAiError(error) : null;
      const isNonRetryableQuota = normalized?.code === 'AI_DAILY_QUOTA_EXCEEDED';

      const isRetryable = !isNonRetryableQuota && (
        isRateLimit || isServerError || isTimeout || isMalformedJson || isSchemaViolation
      );

      if (!isRetryable || attempt === MAX_RETRIES) break;

      const delay = normalized?.retryDelaySeconds != null
        ? normalized.retryDelaySeconds * 1000
        : (isRateLimit ? RETRY_DELAY_MS * 3 : RETRY_DELAY_MS);
      await sleep(delay);
    }
  }

  throw normalizeAiError(lastError);
};

const normalizeAiError = (error) => {
  if (error.code === 'AI_QUEUE_FULL') return error;

  const status = error.response?.status;

  if (status === 429) {
    const details = error.response?.data?.error?.details || [];
    const quotaFailure = details.find((d) => d['@type']?.endsWith('QuotaFailure'));
    const quotaId = quotaFailure?.violations?.[0]?.quotaId || '';

    const retryInfo = details.find((d) => d['@type']?.endsWith('RetryInfo'));
    const retryDelaySeconds = retryInfo?.retryDelay
      ? parseFloat(retryInfo.retryDelay.replace('s', ''))
      : null;

    const isDailyQuota = /PerDay/i.test(quotaId);
    const isTpm = /TokensPer/i.test(quotaId);

    if (isDailyQuota) {
      return Object.assign(new Error('Daily AI usage limit reached. Please try again tomorrow.'), {
        httpStatus: 429,
        code: 'AI_DAILY_QUOTA_EXCEEDED',
        retryable: false,
      });
    }

    return Object.assign(new Error('AI provider rate limit exceeded. Please try again in a moment.'), {
      httpStatus: 429,
      code: isTpm ? 'AI_TOKEN_RATE_LIMITED' : 'AI_RATE_LIMITED',
      retryable: true,
      retryDelaySeconds,
    });
  }

  if (error.code === 'ECONNABORTED') {
    return Object.assign(new Error('AI request timed out.'), { httpStatus: 504, code: 'AI_TIMEOUT' });
  }

  if (status >= 500) {
    return Object.assign(new Error('AI provider is temporarily unavailable.'), { httpStatus: 502, code: 'AI_PROVIDER_DOWN' });
  }

  if (error instanceof SyntaxError || error.code === 'AI_SCHEMA_VIOLATION' || error.code === 'AI_OUTPUT_TRUNCATED') {
    return Object.assign(new Error('AI returned an unexpected response format.'), { httpStatus: 502, code: 'AI_MALFORMED_OUTPUT' });
  }

  return Object.assign(new Error('AI request failed.'), { httpStatus: 500, code: 'AI_UNKNOWN_ERROR' });
};

module.exports = { callGeminiResilient };
