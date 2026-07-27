# GymBro — Phase 5 SRS

## Free-Tier Resilience, Cold Start Mitigation & System Deployment Guide

> **Continuity Note:** This document extends `GymBro_SRS_Phase_1.md` (schema, `callGemini`, §3E token budgets, §7.5 cold-start mention), `GymBro_SRS_Phase_2.md` (`callGeminiResilient`, §7.4 rate-limit strategy, §7.6 error contract), `GymBro_SRS_Phase_3.md` (frontend consumption, offline store), and `GymBro_SRS_Phase_4.md` (concrete controllers, Zod validation). Phase 5 does not introduce new product features — it hardens the existing five AI endpoints plus `/api/audio/transcribe` against the free-tier ceilings the whole stack sits on: **Render's cold-start sleep**, **Gemini 2.5 Flash-Lite's quota trio (15 RPM / 1,000 RPD / 250,000 shared TPM, per Phase 2 §7.1/§7.4)**, and **Firebase's free-tier document/read quotas**. As established in Phase 1 §3E, Gemini 2.0 Flash and Flash-Lite were fully shut down by Google on June 1, 2026 — GymBro has run on `gemini-2.5-flash-lite` since Phase 1, and Phase 5's rate-limiting and provider-abstraction work below is written against that model's current free-tier numbers, not the retired 2.0 line. Every mitigation below is framed as a deliberate architectural choice, not a workaround, because that framing is the actual point of this phase: a $0 infrastructure budget forced explicit engineering decisions that a paid stack would have let the team skip, and that discipline is the artifact worth showing.

---

## 0. Why This Phase Exists

A free-tier deployment fails in three distinct ways, and conflating them leads to the wrong fix:

|Failure|Symptom|Wrong Fix|Right Fix|
|---|---|---|---|
|Render cold start|First request after ~15 min idle takes 20–50s before the server even receives it|Increase `axios` timeout|Warm the server proactively + set client expectations|
|Gemini 2.5 Flash-Lite's 15 RPM ceiling|Concurrent users' AI calls start failing with 429 once usage crosses ~15/min project-wide (RPD and shared TPM are separate, non-queueable ceilings — see note below)|Per-user retry loops (makes contention worse)|A single shared, ordered queue in front of every Gemini call|
|Vendor lock-in / key rotation risk|Swapping providers (Gemini → OpenRouter → paid tier) touches five controllers|Find-and-replace across `aiController.js`|One provider-abstraction interface, one `.env` variable|

Phase 5 treats each of these as a separate concern with a separate, composable fix, all of which sit **below** the controller layer established in Phase 4 — no controller code changes as a result of this phase.

---

## 1. Render Cold Start Handling

### 1.1 The Problem, Precisely

Render's free tier spins the web service down after ~15 minutes with no incoming HTTP traffic. The next request pays the full container-boot cost (dependency load, Express bind, Firebase Admin SDK init) **before** it reaches `verifyToken` — so from the client's point of view, a cold start looks identical to a hung network request. Phase 2 §7.5 flagged this; Phase 5 implements the fix.

### 1.2 Strategy: Proactive Warm-Up, Not Reactive Timeout Tuning

Three complementary layers, from cheapest to most robust:

#### Layer 1 — App-Launch Wake Ping (client-side, no infra cost)

Fire a fire-and-forget `GET /health` the instant the app becomes active — well before the user has navigated to any AI-touching screen — so the cold-start clock starts counting down during onboarding/splash time rather than at the moment of the user's first real request.

```javascript
// app/_layout.jsx (excerpt — root layout, runs once on app foreground)
import { AppState } from 'react-native';
import { useEffect, useRef } from 'react';
import { wakeBackend } from '../services/apiClient';

export default function RootLayout() {
  const lastWakeRef = useRef(0);

  useEffect(() => {
    // Wake immediately on cold app launch
    wakeBackend();

    // Also wake on foreground-return, but throttle to at most once per 60s —
    // an app-switcher user bouncing in and out shouldn't spam /health
    const sub = AppState.addEventListener('change', (state) => {
      const now = Date.now();
      if (state === 'active' && now - lastWakeRef.current > 60_000) {
        lastWakeRef.current = now;
        wakeBackend();
      }
    });

    return () => sub.remove();
  }, []);

  // ...rest of root layout (theme provider, auth listener, OfflineBanner)
}
```

```javascript
// services/apiClient.js (addition to Phase 1 §3I)
const BASE_URL = 'https://gymbro-api.onrender.com';

/**
 * Fire-and-forget wake ping. Deliberately does NOT await the caller's UI —
 * this exists purely to get Render's container spinning up in the
 * background before the user reaches a screen that actually needs it.
 * Errors are swallowed; a failed wake ping is not user-facing.
 */
export const wakeBackend = () => {
  fetch(`${BASE_URL}/health`).catch(() => {
    // Intentionally silent — this is opportunistic, not required for correctness
  });
};
```

#### Layer 2 — Warm-Up Polling With Honest Loading Copy (client-side)

For the **first** AI-touching action in a session, don't just extend the timeout — poll `/health` in the background and swap the loading message once the server responds, so the user gets an honest signal instead of a spinner that looks broken for 30+ seconds.

```javascript
// hooks/useCallBackend.js (extended — warm-up-aware variant)
import { useState, useCallback, useRef } from 'react';
import { callBackend } from '../services/apiClient';

const COLD_START_HINT_DELAY_MS = 4000; // if no response by 4s, assume cold start

export const useCallBackend = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingHint, setLoadingHint] = useState(null); // null | 'normal' | 'waking'
  const [error, setError] = useState(null);
  const hintTimerRef = useRef(null);

  const execute = useCallback(async (endpoint, body) => {
    setIsLoading(true);
    setError(null);
    setLoadingHint('normal');

    // If the request is still pending after COLD_START_HINT_DELAY_MS,
    // switch the copy — this is the ONLY signal we have client-side that
    // we're likely waiting on a cold container rather than Gemini latency,
    // since there's no separate "server booted" event to listen for.
    hintTimerRef.current = setTimeout(() => {
      setLoadingHint('waking');
    }, COLD_START_HINT_DELAY_MS);

    try {
      const result = await callBackend(endpoint, body);
      return result;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      clearTimeout(hintTimerRef.current);
      setIsLoading(false);
      setLoadingHint(null);
    }
  }, []);

  return { execute, isLoading, loadingHint, error };
};
```

```jsx
// Usage in any AI-touching screen (e.g. coach/[conversationId].jsx)
{isLoading && (
  <LoadingSpinner
    message={
      loadingHint === 'waking'
        ? 'Waking Coach up — this can take a moment on first use 🥱'
        : 'Coach is thinking...'
    }
  />
)}
```

This directly matches the UX mitigation flagged (but not implemented) in Phase 2 §7.5 — Phase 5 is where it's actually built.

#### Layer 3 — Scheduled External Keep-Alive (infra-side, still $0)

A free external cron service (e.g. cron-job.org, GitHub Actions scheduled workflow, or UptimeRobot's free monitor) hits `GET /health` every 10 minutes during expected usage hours. This was explicitly deferred in Phase 2 §7.5 as an infra/cost tradeoff; Phase 5 resolves that tradeoff in favor of implementing it, since it's genuinely free and meaningfully reduces cold-start frequency for real users without touching app code at all.

```yaml
# .github/workflows/keep-warm.yml
# Free GitHub Actions scheduled workflow — no external service dependency,
# no account signup beyond GitHub itself, fully version-controlled with the repo.
name: Keep Render Backend Warm

on:
  schedule:
    # Every 10 minutes, 06:00–23:00 UTC — tune to your actual user base's timezone
    # spread rather than running 24/7, since a truly idle overnight window costs
    # nothing to let sleep and just re-warms on the next morning's first request.
    - cron: '*/10 6-23 * * *'
  workflow_dispatch: {} # allow manual trigger for testing

jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Ping health endpoint
        run: curl -sf https://gymbro-api.onrender.com/health || echo "Ping failed (non-blocking)"
```

**Honest caveat, stated for the interview-panel reader as much as the implementation:** a 10-minute keep-alive interval against a 15-minute sleep threshold means the server rarely fully sleeps during the cron's active window, but a real cold start can still happen at the boundary of the scheduled window (e.g. the first request at 06:00 UTC) or if Render's own infra restarts the instance independent of traffic. Layers 1 and 2 exist precisely because Layer 3 reduces cold-start _frequency_, not _certainty_ — a production-honest design assumes cold starts can still happen and handles them gracefully rather than assuming the cron eliminates the problem.

### 1.3 Summary Table

|Layer|Cost|Reduces Frequency?|Reduces User-Perceived Pain When It Happens Anyway?|
|---|---|---|---|
|App-launch wake ping|$0, client CPU only|Yes (per-session)|No|
|Warm-up polling + honest copy|$0|No|Yes — this is the layer that matters most|
|Scheduled external keep-alive|$0|Yes (systemically)|No|

---

## 2. Gemini Rate Limiting & Quota Queue

### 2.1 The Problem, Precisely

Gemini 2.5 Flash-Lite's free tier caps at **15 requests per minute, project-wide** — not per-user — alongside two other independent ceilings established in Phase 2 §7.1/§7.4: **1,000 requests/day (RPD)** and a **250,000 tokens/minute (TPM) ceiling shared across every Gemini model on the project**. Phase 5's queue below addresses the RPM ceiling specifically, since that's the one a request-ordering queue can actually smooth — RPD is a hard daily wall (Phase 2 §7.4a's proactive daily counter is the correct fix, not queueing) and TPM is a payload-size problem (Phase 2 §7.4b), not an arrival-order problem. Phase 2 §7.4 named the RPM risk as the single biggest scaling concern and sketched a `bottleneck`-based limiter conceptually. Phase 5 implements it fully, including the part Phase 2 left unresolved: **what a queued request looks like to the waiting client**, and **what happens if the queue itself backs up past a reasonable wait**.

### 2.2 Design Goals

1. No individual controller should know the queue exists — `callGeminiResilient` (Phase 2 §7.2) is the only integration point, so Phase 4's five controllers require zero code changes.
2. Requests queue **in arrival order** (FIFO) — no starvation, no priority scheme (GymBro has no product reason to prioritize one AI feature over another).
3. A request that would wait "too long" fails fast with a clear, actionable error rather than hanging behind an ever-growing queue.
4. The limiter is a **single shared instance** across the whole Node process — Render's free tier runs exactly one instance with no horizontal scaling, so there's no distributed-queue problem to solve (flagged explicitly in §2.6 as a Phase 6 concern if that ever changes).

### 2.3 Implementation

```javascript
// services/geminiRateLimiter.js
const Bottleneck = require('bottleneck');

/**
 * Global, process-wide limiter guarding every outbound Gemini call.
 * Tuned against gemini-2.5-flash-lite's free-tier RPM ceiling specifically
 * (Phase 2 §7.1/§7.4) — RPD and shared TPM are separate ceilings this
 * limiter does not and cannot address; see Phase 2 §7.4a/§7.4b.
 *
 * maxConcurrent: 1        — Gemini free tier has no concurrent-request
 *                            allowance beyond RPM; serialize everything.
 * minTime: 4200            — ~14.3 requests/minute ceiling (60000ms / 4200ms),
 *                            intentionally under the 15 RPM hard cap as a
 *                            safety margin — Gemini's own rate-limit window
 *                            isn't perfectly aligned to wall-clock minutes,
 *                            so shaving ~5% off the theoretical max avoids
 *                            edge-of-window 429s.
 * highWater: 30            — max queued jobs waiting for a slot. Chosen from
 *                            the "how long is a mobile user willing to wait
 *                            behind a spinner" constraint, not an arbitrary
 *                            number: 30 queued jobs * 4.2s/slot ≈ 126s worst
 *                            case for the LAST job in the queue — already
 *                            past what any mobile UX should ask a user to
 *                            wait, so it doubles as the natural queue-depth
 *                            ceiling before we should be rejecting instead
 *                            of queuing.
 * strategy: OVERFLOW        — once highWater is hit, reject new jobs
 *                            immediately (fail fast) rather than blocking
 *                            the caller or dropping older queued jobs.
 */
const geminiLimiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 4200,
  highWater: 30,
  strategy: Bottleneck.strategy.OVERFLOW,
});

// Observability: log queue depth periodically so it's visible in Render's
// free-tier logs without needing a paid metrics add-on.
geminiLimiter.on('queued', () => {
  const queued = geminiLimiter.jobs('QUEUED').length;
  if (queued > 5) {
    console.warn(`[geminiRateLimiter] queue depth: ${queued} — Gemini 15 RPM ceiling under pressure`);
  }
});

geminiLimiter.on('dropped', (dropped) => {
  console.error('[geminiRateLimiter] job dropped — queue was full (highWater exceeded)', dropped);
});

module.exports = { geminiLimiter };
```

```javascript
// services/aiResilienceWrapper.js (updated — Phase 2 §7.2, now queue-aware)
const { callGemini } = require('./geminiService');
const { geminiLimiter } = require('./geminiRateLimiter');

const MAX_RETRIES = 1;
const RETRY_DELAY_MS = 1200;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const callGeminiResilient = async (systemPrompt, userPrompt, maxTokens, validateShape = null) => {
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Every Gemini call is scheduled through the shared limiter — this is
      // the ONLY change from Phase 2 §7.2's callGeminiResilient. Controllers
      // are completely unaware this wrapping exists.
      const result = await geminiLimiter.schedule(() =>
        callGemini(systemPrompt, userPrompt, maxTokens)
      );

      if (validateShape && !validateShape(result)) {
        throw Object.assign(new Error('AI_SCHEMA_VIOLATION'), { code: 'AI_SCHEMA_VIOLATION' });
      }

      return result;

    } catch (error) {
      lastError = error;

      // Bottleneck throws a specific error when OVERFLOW strategy rejects a job
      const isQueueOverflow = error.message?.includes('This job has been dropped');

      if (isQueueOverflow) {
        // Not retryable — the queue itself is full, retrying immediately
        // would just re-enter the same full queue. Fail fast.
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
      const isSchemaViolation = error.code === 'AI_SCHEMA_VIOLATION';

      const isRetryable = isRateLimit || isServerError || isTimeout ||
                           isMalformedJson || isSchemaViolation;

      if (!isRetryable || attempt === MAX_RETRIES) break;

      const delay = isRateLimit ? RETRY_DELAY_MS * 3 : RETRY_DELAY_MS;
      await sleep(delay);
    }
  }

  throw normalizeAiError(lastError);
};

// normalizeAiError unchanged from Phase 2 §7.2, plus one new branch:
const normalizeAiError = (error) => {
  if (error.code === 'AI_QUEUE_FULL') return error; // already normalized above

  const status = error.response?.status;

  if (status === 429) {
    return Object.assign(new Error('AI provider rate limit exceeded. Please try again in a moment.'), {
      httpStatus: 429,
      code: 'AI_RATE_LIMITED',
    });
  }
  if (error.code === 'ECONNABORTED') {
    return Object.assign(new Error('AI request timed out.'), { httpStatus: 504, code: 'AI_TIMEOUT' });
  }
  if (status >= 500) {
    return Object.assign(new Error('AI provider is temporarily unavailable.'), { httpStatus: 502, code: 'AI_PROVIDER_DOWN' });
  }
  if (error instanceof SyntaxError || error.code === 'AI_SCHEMA_VIOLATION') {
    return Object.assign(new Error('AI returned an unexpected response format.'), { httpStatus: 502, code: 'AI_MALFORMED_OUTPUT' });
  }
  return Object.assign(new Error('AI request failed.'), { httpStatus: 500, code: 'AI_UNKNOWN_ERROR' });
};

module.exports = { callGeminiResilient };
```

### 2.4 New Error Code: `AI_QUEUE_FULL`

Joins the standardized contract from Phase 2 §7.6 / Phase 4 §5.5:

|`error` code|HTTP status|Suggested client UX|
|---|---|---|
|`AI_QUEUE_FULL`|503|Toast: "Coach is handling a lot of requests right now — try again shortly" (distinct copy from `AI_RATE_LIMITED`, since this means the _local_ queue is saturated, not that Gemini itself rejected the call)|

### 2.5 Per-User Soft Throttle (unchanged from Phase 2 §7.4, now composed with the queue)

The per-user throttle (max 1 chat message per 2 seconds per `uid`, Redis-backed or in-memory `Map`) still sits in front of the shared limiter as a separate concern: it prevents one abusive or buggy client from filling all 30 queue slots by itself, which the shared `geminiLimiter` alone cannot distinguish (it only sees "a job arrived," not "the same user already has 4 jobs queued").

```javascript
// middleware/perUserThrottle.js
const userLastRequestMap = new Map(); // uid -> timestamp, in-memory (single Render instance)
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
```

Applied after `verifyToken` and before `validateBody` on every `/api/ai/*` route:

```javascript
router.post('/chat', verifyToken, perUserThrottle, validateBody(chatRequestSchema), aiController.chat);
```

### 2.6 Explicitly Out of Scope (Flagged, Not Built)

- **Distributed queue (Redis-backed Bottleneck cluster mode):** unnecessary on a single free Render instance with no horizontal scaling. Flagged as a Phase 6 concern only if GymBro ever moves to a paid multi-instance deployment, at which point `Bottleneck.Clustering` (Redis-backed) is a drop-in replacement for the in-memory limiter shown here.
- **Priority queueing across the five AI features:** not implemented — all five endpoints share one FIFO queue. A future paid tier with higher RPM removes the need for this entirely rather than making it worth building.

---

## 3. API Key Security & Extensibility Strategy

### 3.1 The Problem, Precisely

`geminiService.js` (Phase 1 §3E) currently hardcodes the Gemini endpoint shape directly into `callGemini()`. That's fine for a single-provider MVP, but it means "swap providers" today would require editing every call site's understanding of request/response shape. Phase 5 introduces a thin **provider abstraction layer** so that swapping Gemini for OpenRouter, a paid Gemini tier, or any OpenAI-compatible endpoint is a **single `.env` variable change**, with zero controller-level code changes.

### 3.2 Design: One Interface, Swappable Adapters

```javascript
// services/aiProviders/providerInterface.js
/**
 * Every provider adapter must implement this exact function signature.
 * Controllers and callGeminiResilient never import a specific provider
 * directly — they always go through services/geminiService.js, which
 * resolves to whichever adapter AI_PROVIDER points to at process start.
 *
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {number} maxTokens
 * @returns {Promise<Object>} parsed JSON response body
 */

// This file is documentation-only (JSDoc typedef, no TypeScript per project
// convention established in Phase 3 §1) — each adapter below conforms to it.
```

```javascript
// services/aiProviders/geminiAdapter.js
const axios = require('axios');

// Matches the GEMINI_URL constant from Phase 1 §3E. gemini-2.0-flash and
// gemini-2.0-flash-lite were fully shut down by Google on June 1, 2026 —
// this adapter targets gemini-2.5-flash-lite, GymBro's model since Phase 1,
// and must never be pointed back at a 2.0-line model ID.
const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';

const call = async (systemPrompt, userPrompt, maxTokens) => {
  const payload = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: maxTokens,
      responseMimeType: 'application/json',
    },
  };

  const response = await axios.post(`${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000,
  });

  const rawText = response.data.candidates[0].content.parts[0].text;
  return parseJsonDefensively(rawText);
};

const parseJsonDefensively = (rawText) => {
  try {
    return JSON.parse(rawText);
  } catch (e) {
    const cleaned = rawText.replace(/```json\n?|```\n?/g, '').trim();
    return JSON.parse(cleaned);
  }
};

module.exports = { call };
```

```javascript
// services/aiProviders/openRouterAdapter.js
// OpenRouter exposes an OpenAI-compatible /chat/completions shape — this
// adapter is the concrete "swap to a paid/alternate provider" path referenced
// throughout Phases 1-4 wherever generatedByModel: 'openrouter/llama-3' was
// mentioned as a fallback option (Phase 1 workoutPlans schema).
const axios = require('axios');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const call = async (systemPrompt, userPrompt, maxTokens) => {
  const payload = {
    model: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3-70b-instruct',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: maxTokens,
    temperature: 0.7,
    response_format: { type: 'json_object' },
  };

  const response = await axios.post(OPENROUTER_URL, payload, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    },
    timeout: 30000,
  });

  const rawText = response.data.choices[0].message.content;
  return parseJsonDefensively(rawText);
};

const parseJsonDefensively = (rawText) => {
  try {
    return JSON.parse(rawText);
  } catch (e) {
    const cleaned = rawText.replace(/```json\n?|```\n?/g, '').trim();
    return JSON.parse(cleaned);
  }
};

module.exports = { call };
```

```javascript
// services/geminiService.js (updated — provider-resolving facade)
// Despite the filename (kept for backward compatibility with Phase 1-4
// import paths — every controller still does
// `const { callGemini, TOKEN_LIMITS } = require('./geminiService')`),
// this file no longer hardcodes Gemini. It resolves an adapter based on
// AI_PROVIDER and delegates. Renaming the file is a nice-to-have cleanup
// flagged for Phase 6, not done here, specifically to avoid touching every
// controller's import statement as part of this phase.

const TOKEN_LIMITS = {
  CHAT: 1200,
  SUBSTITUTE: 1000,
  RECOVERY: 1000,
  PLAN_RESTRUCTURE: 2500,
  MEAL_PLANNER: 4500,
};

const PROVIDERS = {
  gemini: require('./aiProviders/geminiAdapter'),
  openrouter: require('./aiProviders/openRouterAdapter'),
  // paid-gemini: intentionally the SAME adapter as 'gemini' — a paid Gemini
  // tier changes only the rate-limit ceiling (§2), not the request/response
  // shape, so it needs no separate adapter, only a change to §2's
  // geminiLimiter.minTime and highWater constants once billing is enabled.
};

const resolveProvider = () => {
  const providerKey = process.env.AI_PROVIDER || 'gemini';
  const provider = PROVIDERS[providerKey];

  if (!provider) {
    throw new Error(
      `AI_PROVIDER="${providerKey}" is not a recognized adapter. Valid options: ${Object.keys(PROVIDERS).join(', ')}`
    );
  }
  return provider;
};

/**
 * Drop-in replacement for the Phase 1 §3E callGemini signature — every
 * existing call site (callGeminiResilient, Phase 2 §7.2) works unchanged.
 */
const callGemini = async (systemPrompt, userPrompt, maxTokens = TOKEN_LIMITS.CHAT) => {
  const provider = resolveProvider();
  return provider.call(systemPrompt, userPrompt, maxTokens);
};

module.exports = { callGemini, TOKEN_LIMITS };
```

### 3.3 The `.env` Change That Does the Swap

```bash
# .env — switching providers is exactly this one line:

AI_PROVIDER=gemini          # default — gemini-2.5-flash-lite free tier applies
                             # (15 RPM / 1,000 RPD / 250K shared TPM, §2)
# AI_PROVIDER=openrouter    # swap to this + set OPENROUTER_API_KEY to move
                             # off Gemini entirely, e.g. if free-tier quota
                             # becomes a hard blocker before revenue exists

GEMINI_API_KEY=AIzaSy...
OPENROUTER_API_KEY=sk-or-...   # only required if AI_PROVIDER=openrouter
OPENROUTER_MODEL=meta-llama/llama-3-70b-instruct  # optional override
```

No controller, no prompt file, no schema file, and no route file changes when this variable flips — the entire surface area of the swap is `.env` plus the two adapter files already written and tested ahead of time. This is the concrete deliverable the task asked for: extensibility proven by architecture, not promised in a comment.

### 3.4 Security Posture (unchanged principle from Phase 1, restated for completeness)

- Both `GEMINI_API_KEY` and `OPENROUTER_API_KEY` live only in Render's environment variable dashboard and local `.env` (git-ignored per Phase 1 §3A) — never in the mobile bundle, never in a committed file.
- The provider abstraction does not weaken this boundary in any way — it's still the Node backend, and only the Node backend, that ever holds a key. The mobile app's `apiClient.js` (Phase 1 §3I) is completely unaware which provider is active.
- Rotating a compromised key is unaffected by this phase: revoke in the provider's console, update the Render env var, redeploy — the same process as before, per-provider.

---

## 4. CI/CD & Deployment Checklist for Showcase-Ready Repositories

### 4.1 Why This Section Matters for a $0-Budget Portfolio Project

A hiring panel evaluating this repo will look at exactly three things beyond the code itself: does it deploy from a clean clone, does CI catch regressions before merge, and does the README communicate the architecture decisions above without requiring a live walkthrough. This section is a checklist against all three, using only free tooling (GitHub Actions free minutes, Render free tier, no paid CI product).

### 4.2 Repository Structure Checklist

- [ ] Root-level `README.md` leads with a **one-paragraph elevator pitch** and an **architecture diagram** (the Path A / Path B split from Phase 1 §1 is the single most important diagram to surface here — it's the artifact that best demonstrates the security reasoning, i.e. why the Gemini key can never be client-side).
- [ ] `README.md` includes a **"Free-Tier Engineering" section** explicitly listing the three constraints this phase addresses (Render sleep, 15 RPM, provider lock-in) and links to this document — reviewers reward explicit acknowledgment of constraints over an implicit assumption everything "just works."
- [ ] Separate `gymbro-backend/` and `gymbro-app/` folders (or separate repos, either is defensible) each with their own `README.md` covering local setup — a reviewer should be able to run `npm install && npm run dev` in the backend folder without reading this SRS first.
- [ ] `.env.example` committed (never `.env` itself) listing every variable from Phase 1 §3B plus Phase 5 §3.3's `AI_PROVIDER`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, and Phase 4 §4's `GROQ_API_KEY` — a reviewer spinning this up locally should never have to guess a variable name from reading controller source.
- [ ] `LICENSE` file present (MIT is the conventional default for a portfolio project unless there's a specific reason otherwise).

### 4.3 GitHub Actions CI Checklist (Free Tier — 2,000 minutes/month on public repos, unlimited on public repos actually)

```yaml
# .github/workflows/ci.yml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  backend-lint-and-test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: gymbro-backend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: gymbro-backend/package-lock.json
      - run: npm ci
      - run: npm run lint
      - run: npm test -- --ci
      # No live Gemini/Groq calls in CI — tests must mock the provider
      # adapters (§3.2) rather than hitting real APIs, both to avoid
      # burning the shared 15 RPM budget from a CI runner and because a
      # flaky third-party API should never fail a PR check.

  frontend-lint-and-typecheck:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: gymbro-app
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: gymbro-app/package-lock.json
      - run: npm ci
      - run: npm run lint
      # JSDoc typedefs are checked via `tsc --checkJs --noEmit` even though
      # the project is plain JS (Phase 3 §1 convention) — this catches shape
      # drift between models/ typedefs and actual usage without adopting
      # TypeScript wholesale.
      - run: npx tsc --checkJs --noEmit --allowJs
```

- [ ] CI runs on every PR to `main` — branch protection rule requires it to pass before merge (free on public repos).
- [ ] Provider adapters (§3.2) are mocked in tests, never live-called — protects the shared Gemini RPM budget and keeps CI deterministic.
- [ ] `npm audit --production` run as a non-blocking informational step (not a hard gate, since a portfolio project shouldn't block on transitive dev-dependency CVEs, but should surface them).

### 4.4 Deployment Checklist (Render + Expo)

|Step|Detail|
|---|---|
|Backend env vars set in Render dashboard|All of §4.2's `.env.example` list, entered directly in Render's environment tab — never committed|
|Render health check path configured|`/health` (Phase 1 §3G) set as Render's own health-check endpoint, separate from the GitHub Actions keep-warm cron (§1.2 Layer 3) — Render uses this to detect the service is alive post-deploy, the cron uses it to prevent sleep|
|Auto-deploy on push to `main` enabled|Render's free tier supports this natively — no separate CD tool needed|
|Firestore Security Rules deployed via Firebase CLI, not console click-through|`firebase deploy --only firestore:rules` scripted as an npm script (`predeploy` hook) so rules changes are version-controlled and reviewable in the same PR as the code that depends on them, not a manual console edit that drifts from the committed `firestore.rules` file|
|EAS Build configured for at least one platform|Expo's free tier EAS Build allows a limited number of builds/month — sufficient to produce a demo APK/TestFlight build for a portfolio reviewer without needing a paid Expo plan|
|Demo credentials or seeded demo account documented|A reviewer should not need to complete a 6-step onboarding flow cold — a `DEMO_CREDENTIALS.md` (not committed with real secrets, just a documented seeded test account) speeds up evaluation significantly|

### 4.5 Showcase-Specific Polish Checklist

- [ ] A short (60–90s) screen-recording GIF or video linked in the README showing the cold-start warm-up message (§1.2 Layer 2) actually firing — this is the single most "senior engineer" detail in the whole app and it's invisible unless explicitly surfaced, since by design it only appears once per session.
- [ ] The `AI_PROVIDER` swap (§3.3) demonstrated in the README with a before/after `.env` diff, even if OpenRouter isn't actually wired to a funded account — the point is architectural readiness, not a live paid integration.
- [ ] Standardized error contract (Phase 2 §7.6, extended in Phase 4 §5.5 and Phase 5 §2.4) documented as a single table in the README — this is the artifact most likely to come up in a technical interview follow-up question ("walk me through how you handle a rate-limited AI call") and having it pre-written avoids improvising the answer live.

---

## Summary Reference Card — Phase 5 Additions

|Concern|File(s)|Key Constant / Config|
|---|---|---|
|App-launch wake ping|`app/_layout.jsx`, `services/apiClient.js`|Throttled to 1 wake/60s per foreground event|
|Warm-up polling + honest loading copy|`hooks/useCallBackend.js`|`COLD_START_HINT_DELAY_MS = 4000`|
|Scheduled keep-alive|`.github/workflows/keep-warm.yml`|`*/10 6-23 * * *` (every 10 min, 06:00–23:00 UTC)|
|Shared Gemini queue|`services/geminiRateLimiter.js`|`maxConcurrent: 1, minTime: 4200, highWater: 30, strategy: OVERFLOW`|
|Per-user soft throttle|`middleware/perUserThrottle.js`|`MIN_INTERVAL_MS = 2000`|
|Provider abstraction|`services/aiProviders/*`, `services/geminiService.js`|`AI_PROVIDER` env var: `gemini` \| `openrouter`|
|CI|`.github/workflows/ci.yml`|Mocked provider adapters, no live API calls in CI|

|New Error Codes|HTTP Status|
|---|---|
|`AI_QUEUE_FULL`|503|
|`USER_THROTTLED`|429|

|Schema/Infra Gaps Flagged for Phase 6|Reason|
|---|---|
|Redis-backed distributed queue (`Bottleneck.Clustering`)|Only needed if Render moves off single-instance free tier|
|`geminiService.js` rename to `aiProviderService.js`|Cosmetic cleanup deferred to avoid touching every controller's import path in this phase|
|Priority queueing across AI features|Not needed until RPM ceiling itself is raised via a paid tier, at which point it's moot|