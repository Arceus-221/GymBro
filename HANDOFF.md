# GymBro handoff

Last updated: 2026-10-27 (Asia/Dhaka)

## Objective and architecture

GymBro is an affordable personal fitness companion: workout planning/logging, meal planning/tracking, progress, and AI coaching.

- `gymbro-app/`: Expo SDK 58 / React Native 0.88, Expo Router, Zustand, Firebase JS SDK.
- Path A: authenticated app reads and writes user-scoped Firestore data directly. Native Firebase cache is in-memory so Expo Go works without native Firebase modules.
- Path B: app sends Firebase ID tokens to the Express backend. Auth, throttle, Zod validation, prompts, provider queue/retry, and AI calls live in `gymbro-backend/`. AI provider keys stay server-side. Gemini is configured by default; OpenRouter is a selectable adapter, not automatic failover.
- Backend also proxies voice transcription through Groq Whisper. Firestore is used for profiles, plans, logs, and chat history.

## Features and decisions

- App flows: email/password auth, onboarding/profile, dashboard, workout plans and session logging, meal plans and nutrition logs, AI Coach, progress, settings/account actions.
- Meal plan detail/recipe and meal substitution endpoints/UI were added; recipes are fetched on demand and cached in the plan. Plan meals can be logged without an AI call.
- Backend AI routes also include recovery scoring and exercise substitutions; those two currently have no frontend flow.
- SDK 58 dependencies/config were aligned; splash config uses the Expo plugin. `expo-font`, `expo-asset`, and `react-native-worklets` are installed for native peers.
- Current AI connectivity issue was network configuration, not a provider timeout: stale LAN address and then blocked inbound access prevented the phone from reaching the PC. Expo was restarted with `--lan`; the user reports AI now works after allowing local Node connections. Current `.env.local` is ignored and points to the PC's LAN address on port 3001; that address changes with Wi-Fi. Expo's `--tunnel` only tunnels Metro, not the backend.
- Dev-only `[api]` stage logs are present in `gymbro-app/services/apiClient.js` and `gymbro-backend/services/requestTrace.js`. They log route/stage/timing/status/error metadata, not tokens or prompts. Keep or remove after AI debugging is complete.

## Important files

- App: `gymbro-app/app/`, `components/`, `hooks/`, `services/firebase.js`, `services/apiClient.js`, `services/mealPlanActions.js`, `services/nutritionLogActions.js`.
- Backend: `gymbro-backend/index.js`, `routes/ai.js`, `controllers/aiController.js`, `controllers/mealPlanController.js`, `middleware/verifyToken.js`, `schemas/aiSchemas.js`, `services/aiResilienceWrapper.js`, `services/geminiService.js`, `services/aiProviders/`, `prompts/`.
- Specs/source of truth: `docs/GymBro_SRS_Phase_1.md` through `Phase_5.md`; practical setup: `README.md`; chronological notes: `DEVELOPMENT_LOG.md`.
- Review backlog: `CODEBASE_REVIEW.md` (40 findings grouped by frontend/backend and feature; `FRONTEND_FIX_LOG.md` was excluded from that review).
- Meaningful recent working-tree changes include SDK 58 config/lockfile/CI/README, nutrition detail/swap/logging UI and backend endpoints, AI diagnostics, and review docs. Check `git status --short` before editing: many existing changes are uncommitted. Preserve them; do not reset, clean, or overwrite unrelated work.
- No project-level `AGENTS.md` was found. The only discovered one is inside an installed dependency; do not treat it as project policy.

## Open findings and blockers

Use `CODEBASE_REVIEW.md` for evidence and proposed fixes. Highest-priority known issues:

1. **Data safety:** progress query conflicts with Firestore rules (R01); workout state can be lost on failed save (R02); concurrent meal writes can overwrite one another (R03); recipe caching can undo a swap (R04); account deletion leaves nested chat data / can partially fail (R07); user-scoped in-memory state can survive sign-out (R08).
2. **AI contracts/context:** backend output validation is insufficient for consumers (R05); Coach lacks context implied by the UI (R06); history ordering and retry duplication (R18/R19); queue wait and client calls lack an end-to-end deadline/cancellation (R20); more provider, input validation, throttle, and Firestore integrity findings are in the review.
3. **Reliability/coverage:** Firestore errors can look like empty data (R13); dates/streaks and voice timer behavior have defects (R10/R11/R28); automated coverage misses frontend flows, controllers, provider contracts, and Firestore rules (R39). See the review's suggested repair order before selecting work.
4. **Release:** no checked-in `eas.json`; physical-device/release validation, seeded demo account, and live Firebase integration remain incomplete. README/CI contain a few claims/configs worth reconciling with actual behavior (R40).

The user intends to send additional AI errors/fixes. Start with the exact endpoint/action, redacted Expo `[api]` stage lines, backend request trace stage/status, elapsed time, and provider error code. Never request or log API keys, bearer tokens, service-account credentials, or full personal prompts/profile data. AI working now does not resolve R20 or other review findings.

## Next steps, in priority order

1. Triage the user's next AI error using the trace from app request through backend auth, controller/Firestore, queue, provider, validation, and persistence. Fix only the evidenced fault and add focused regression coverage.
2. Address R01-R04 and R07-R08 data-integrity/account-safety issues from `CODEBASE_REVIEW.md`.
3. Address AI correctness/reliability findings R05-R06 and R18-R26, especially deadlines/cancellation, output contracts, context grounding, and retry idempotency.
4. Add missing controller/provider/Firestore-emulator and frontend-flow tests; then work through remaining R10-R40 and agreed product gaps.
5. Before release, verify physical-device flows, Firebase rules/deployment, runtime/theme behavior, and EAS build configuration.

## Run, check, and build

Use separate terminals for the two dev servers. Run commands from the named package directory. The app's checked-in `.npmrc` sets the legacy peer resolution mode.

```powershell
# Backend server (terminal 1)
cd gymbro-backend
npm install
# Create .env from .env.example; configure Firebase Admin, Gemini, and PORT.
npm run dev
# health endpoint: http://localhost:<PORT>/health (example defaults to 3000;
# this machine currently uses 3001)
```

```powershell
# Backend checks
cd gymbro-backend
npm run lint
npm test -- --ci --runInBand
```

```powershell
# Frontend (second terminal)
cd gymbro-app
npm install --legacy-peer-deps
# Create .env.local from .env.example; set Firebase web config and backend URL.
# Physical phone on same LAN: set URL to http://<PC-Wi-Fi-IPv4>:<backend-port>
npx expo start --clear --lan --port 8081
```

```powershell
# Frontend checks and export
cd gymbro-app
npm run lint
npm run typecheck
npx expo-doctor
npx expo export --platform ios --platform android
```

For a phone on a different network, Expo tunnel alone is insufficient: the backend also needs a reachable HTTPS deployment/tunnel. SDK 58's default Expo tunnel requires Expo login. For Android APK, no EAS config is checked in: run `npx eas-cli build:configure`, add a preview profile with `distribution: "internal"` and `android.buildType: "apk"`, then `npx eas-cli build --platform android --profile preview` after EAS login. An Expo export is a JS bundle, not an installable APK.

Last recorded checks (2026-10-25): backend lint passed and Jest **9/9** passed; frontend lint had **0 errors / 15 warnings**, typecheck passed with `checkJs: false`; Expo Doctor **20/20** and iOS + Android exports passed. These were not rerun while writing this handoff. No physical release build or full authenticated Firebase-to-AI device run was verified then; the user subsequently confirmed AI connectivity works.

## Constraints to preserve

- Keep provider secrets in `gymbro-backend/.env` / deployment secrets; never put them in Expo `EXPO_PUBLIC_*` variables.
- Keep AI requests behind Firebase ID-token auth and the shared resilience/provider path; keep routine user data on the direct Firestore path unless the security design changes intentionally.
- Preserve the `<<<USER_INPUT>>>` prompt delimiters and existing schemas/error contract when changing AI prompts/controllers.
- Respect Node requirements: app supports 22.13+, 24.3+, or 26+; backend supports Node 20+.
- Do not assume `.env.local` LAN IP is stable or that Expo tunnel makes port 3001 reachable. Verify `/health` from the phone after any network/firewall change.
- Preserve current uncommitted project work and the SRS as the design source. Do not use `FRONTEND_FIX_LOG.md` as source for this handoff unless the user asks.
