# GymBro

AI-powered fitness coaching for people who don't have a personal trainer budget.
GymBro generates personalized workout plans, estimates meal macros from a plain-language
description, scores daily recovery/readiness, suggests exercise substitutions, and runs
an in-app AI coach chat — all on a **$0 infrastructure budget** (Render free tier +
Firebase free tier + Gemini free tier).

This README is the entry point for the team. Full technical specification lives in
[`/docs`](./docs) as five SRS phases — read them in order if you need the *why* behind
any decision below; this file is the *how do I run it*.

---

## 1. Architecture at a Glance

GymBro has exactly **two data paths**. Every feature belongs to one of them, and mixing
them up is the most common way to introduce a security bug in this codebase.

```
┌─────────────────────────────┐        ┌──────────────────────────────────┐
│      REACT NATIVE APP        │        │     NODE.JS + EXPRESS (Render)    │
│         (Expo Router)         │        │                                    │
│                              │        │  verifyToken middleware            │
│  Path A: Firestore Client SDK │        │      │                             │
│  ─────────────────────────── │        │      ▼                             │
│  profile · workout logs      │        │  AI Controllers                    │
│  meal logs · recovery logs   │        │      │                             │
│  chat history reads/writes   │        │      ▼                             │
│                              │        │  Gemini 2.5 Flash-Lite             │
│  Path B: fetch() w/ Firebase │───────▶│  (key lives ONLY in .env)          │
│  ID token → Express backend  │        │                                    │
│  ─────────────────────────── │        │  Groq-hosted Whisper (audio)       │
│  plan generation · chat turn │        │                                    │
│  macro estimate · recovery   │        └──────────────────────────────────┘
│  score · exercise substitute │                        │
└──────────────┬───────────────┘                        │
               │                                         │
               ▼                                         ▼
     ┌───────────────────┐                    ┌───────────────────────┐
     │  Firebase Auth      │                    │  Gemini / Groq APIs    │
     │  Firebase Firestore │                    │  (never called from    │
     │  (per-user rules)   │                    │   the mobile app)      │
     └───────────────────┘                    └───────────────────────┘
```

**Rule of thumb:** if the action is reading/writing *data*, it goes straight from the
app to Firestore (Path A). If the action needs *AI reasoning*, it goes through the
Express backend (Path B) — because the Gemini/OpenRouter/Groq API keys must never exist
inside the Expo app bundle (anyone can decompile an APK and pull a hardcoded key out of
it). The backend's `verifyToken` middleware is the only thing standing between the
public internet and those keys, so every AI route is authenticated with a Firebase ID
token before anything reaches an LLM.

Full data-flow diagrams and the complete Firestore schema: [`docs/GymBro_SRS_Phase_1.md`](./docs/GymBro_SRS_Phase_1.md).

---

## 2. Repository Structure

```
gymbro/
├── gymbro-backend/       # Node.js + Express — Path B, AI orchestration
│   ├── config/            # Firebase Admin SDK init
│   ├── middleware/        # verifyToken, perUserThrottle, validateBody
│   ├── controllers/       # aiController.js, audioController.js
│   ├── services/          # geminiService.js (provider facade), resilience wrapper,
│   │                      #   rate limiter, aiProviders/ adapters
│   ├── routes/            # /api/ai/*, /api/audio/*
│   ├── schemas/           # Zod request validation
│   ├── prompts/           # System prompts + user-prompt builders per AI feature
│   ├── firestore.rules    # Deployed via `firebase deploy --only firestore:rules`
│   └── index.js
│
├── gymbro-app/            # React Native (Expo Router) — Path A + Path B client
│   ├── app/                # File-based routes: (auth), (onboarding), (tabs)
│   ├── components/         # Presentational components, grouped by screen area
│   ├── store/              # Zustand global stores
│   ├── hooks/              # useFirestoreDoc, useCallBackend, useVoiceCapture, etc.
│   ├── services/           # firebase.js, apiClient.js
│   └── models/             # JSDoc typedefs mirroring the Firestore schema
│
├── docs/                  # The five SRS phase documents (source of truth)
├── .github/workflows/     # CI + Render keep-warm cron
├── DEMO_CREDENTIALS.md    # Seeded test account (fill in once one exists)
└── LICENSE
```

> **Note on current state:** the backend is functionally complete against Phases 1, 2,
> 4, and 5 — all five `/api/ai/*` controllers, the audio transcription proxy, the
> Gemini/OpenRouter provider adapters, the rate limiter, and the resilience wrapper are
> implemented and boot-tested (`npm install && npm run dev` + `curl /health` both verified
> during scaffolding). What's still open: real Firebase project credentials (the repo only
> ships `.env.example`), automated tests (`__tests__/` is empty), and the entire
> `gymbro-app/` frontend beyond the folder structure and `apiClient.js` — the Expo screens
> from Phase 3 still need to be built out.

---

## 3. Local Setup

### Prerequisites

- Node.js 20+
- A Firebase project (Firestore + Auth enabled) — create one for free at
  [console.firebase.google.com](https://console.firebase.google.com)
- A Gemini API key (free tier) from [Google AI Studio](https://aistudio.google.com)
- Expo CLI (`npm install -g expo-cli`) or just use `npx expo`
- Optional: a Groq API key (free tier) if you're working on the voice-note transcription
  fallback

### 3.1 Backend (`gymbro-backend/`)

```bash
cd gymbro-backend
npm install
cp .env.example .env
# Fill in .env with your Firebase service account + Gemini API key
npm run dev
```

Confirm it's alive:

```bash
curl http://localhost:3000/health
# {"status":"ok"}
```

Deploy Firestore rules (once, or whenever `firestore.rules` changes):

```bash
npm install -g firebase-tools   # one-time
firebase login
firebase use --add              # select your Firebase project
npm run predeploy               # runs `firebase deploy --only firestore:rules`
```

### 3.2 Frontend (`gymbro-app/`)

The `gymbro-app/` folder here is the **target structure** (Phase 3 SRS §1) but has not
been through `create-expo-app` yet, since that command needs to run interactively and
generates platform config (`app.json`, Metro/Babel config) that shouldn't be hand-written.
First time only:

```bash
cd gymbro-app
npx create-expo-app@latest . --template blank   # answer prompts; it will warn the
                                                 # directory isn't empty — that's expected,
                                                 # it merges around package.json/services/etc.
npm install
cp .env.example .env.local
# Fill in .env.local with your Firebase web config + backend URL
npx expo start
```

Scan the QR code with Expo Go, or press `i` / `a` for a simulator.

### 3.3 Running Both Together

The app's `EXPO_PUBLIC_API_BASE_URL` should point at your local backend
(`http://<your-machine-LAN-IP>:3000` for a physical device, `http://localhost:3000` for
a simulator) during development, and at the deployed Render URL otherwise.

---

## 4. Free-Tier Engineering

This project deliberately runs on $0 of infrastructure, which forced explicit
engineering decisions a paid stack would have let us skip. Each one is a real
architectural choice, documented in depth in [`docs/GymBro_SRS_Phase_5.md`](./docs/GymBro_SRS_Phase_5.md):

| Constraint | Mitigation |
|---|---|
| **Render free tier sleeps after ~15 min idle** — first request after that pays a 20-50s cold-boot cost | Three layers: an app-launch fire-and-forget wake ping, a client loading-copy swap ("Waking Coach up...") after 4s so the spinner never looks broken, and a GitHub Actions cron hitting `/health` every 10 minutes during expected usage hours |
| **Gemini 2.5 Flash-Lite free tier: 15 RPM / 1,000 RPD / 250K shared TPM** | A single in-process `bottleneck` queue (`maxConcurrent: 1, minTime: 4200ms, highWater: 30, OVERFLOW`) in front of every Gemini call, plus a per-user soft throttle (1 request per 2s) so one client can't starve the shared budget. RPD is a hard wall handled by a proactive daily counter, not retries; TPM is a payload-size concern handled by the fixed `TOKEN_LIMITS` per feature |
| **Vendor lock-in risk** | A one-file provider-adapter interface (`services/aiProviders/`) resolved by a single `AI_PROVIDER` env var — swapping Gemini for OpenRouter (or a paid Gemini tier) touches zero controller code |
| **API key exposure** | Gemini/OpenRouter/Groq keys exist only in `gymbro-backend/.env` / Render's dashboard — never in the Expo bundle. Every AI route requires a verified Firebase ID token before it's reachable at all |

### Standardized AI Error Contract

Every `/api/ai/*` and `/api/audio/*` failure returns the same shape, so the app needs
exactly one error-handling code path:

```json
{ "success": false, "error": "AI_RATE_LIMITED", "message": "..." }
```

| `error` code | HTTP | Meaning |
|---|---|---|
| `AI_QUEUE_FULL` | 503 | Local request queue is saturated |
| `AI_RATE_LIMITED` | 429 | Gemini RPM ceiling hit |
| `AI_TOKEN_RATE_LIMITED` | 429 | Shared TPM ceiling hit |
| `AI_DAILY_QUOTA_EXCEEDED` | 429 | RPD hard wall — do not retry, "try again tomorrow" |
| `AI_TIMEOUT` | 504 | Gemini call exceeded 30s |
| `AI_PROVIDER_DOWN` | 502 | 5xx from the AI provider |
| `AI_MALFORMED_OUTPUT` | 502 | Valid response but broke schema/JSON parsing |
| `USER_THROTTLED` | 429 | Per-user soft throttle (max 1 req / 2s) |
| `INVALID_REQUEST_BODY` / `INVALID_INPUT_RANGE` | 400 | Zod/range validation failed before any AI call was attempted |

Full detail: [`docs/GymBro_SRS_Phase_2.md` §7](./docs/GymBro_SRS_Phase_2.md), extended in
[Phase 4 §5.5](./docs/GymBro_SRS_Phase_4.md) and [Phase 5 §2.4](./docs/GymBro_SRS_Phase_5.md).

---

## 5. Working Conventions

- **No screen/controller talks to Firestore or Gemini directly.** The app goes through
  `hooks/useFirestoreDoc`, `useFirestoreCollection`, or `useCallBackend`; the backend
  goes through `callGeminiResilient` only. This is what keeps retry/offline/error
  handling centralized in one place instead of five.
- **Every AI system prompt lives in `prompts/`, not inline in the controller.** Keep the
  `<<<USER_INPUT>>> ... <<<END_USER_INPUT>>>` delimiter pattern intact — it's the primary
  defense against prompt injection via free-text fields (meal descriptions, chat
  messages, custom plan instructions).
- **Token budgets are fixed constants** (`CHAT: 1200`, `SUBSTITUTE: 1000`, `RECOVERY: 1000`,
  `PLAN_RESTRUCTURE: 2500`, `MEAL_PLANNER: 4500`) — never pass a raw number to
  `callGemini`/`callGeminiResilient`. Undershooting truncates JSON mid-structure.
- **Plain JavaScript, not TypeScript**, on both sides — JSDoc `@typedef` comments in
  `models/` document shapes for reference; `tsc --checkJs` in CI catches drift without
  requiring a full TS migration.
- **CommonJS on the backend** (`require`/`module.exports`), matching Node 20 + Express
  conventions used throughout the SRS.
- **No live third-party API calls in CI.** Mock `services/aiProviders/*` in tests —
  protects the shared 15 RPM budget and keeps the pipeline deterministic.

---

## 6. Where to Go Next

| If you're working on... | Read... |
|---|---|
| Firestore schema, security rules, Path A vs B | `docs/GymBro_SRS_Phase_1.md` |
| A specific AI feature's system prompt / token budget / error handling | `docs/GymBro_SRS_Phase_2.md` |
| Any screen's UI, state management, or offline behavior | `docs/GymBro_SRS_Phase_3.md` |
| Wiring a controller's actual logic (Firestore + Gemini calls) | `docs/GymBro_SRS_Phase_4.md` |
| Rate limiting, cold-start handling, provider swaps, CI/CD | `docs/GymBro_SRS_Phase_5.md` |

If you hit a decision that isn't covered by any of the five docs, raise it in a PR
description rather than guessing — these documents are meant to be the actual source of
truth, not a suggestion.
