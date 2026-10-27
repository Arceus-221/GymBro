# GymBro codebase review

Reviewed: 2026-10-25 (Asia/Dhaka). Scope: the current working tree, including existing uncommitted changes, both application packages, README, the five SRS documents, development log, Firestore rules, and CI configuration. `FRONTEND_FIX_LOG.md` was excluded.

This is a review and proposed repair backlog, not a record of completed fixes. No application code was changed. Findings distinguish source-confirmed defects, locally reproduced defects, and product/verification gaps. A static review cannot guarantee that every runtime issue has been found.

## Finding status

Status reflects the current working tree. ?Unsolved? includes partial fixes: R02 retains a session until server acknowledgement but has no durable offline draft; R08 resets stores on identity changes but does not yet cover every late asynchronous result or key workout drafts by user and date. R33 covers the frontend equipment selector; server-side profile validation remains R25. R03 uses online-only transactions and reports failed saves for retry. R14 preserves old positional-only log entries as history, but they cannot be matched safely to a plan or dish revision, so they do not mark current plan meals as logged. R10 evaluates gaps against the current weekly plan; older aggregate streaks are not reconstructed when a plan changes. R39 remains open because the focused tests do not cover the full integration surface.

| Number | Finding | Status |
| --- | --- | --- |
| R01 | Progress query is incompatible with the checked-in Firestore rules | Solved |
| R02 | Workout saving discards the session before success is known | Unsolved |
| R03 | Meal logging overwrites concurrent changes | Solved |
| R04 | Recipe completion can undo a meal swap | Solved |
| R05 | AI output validation does not protect the consumers | Unsolved |
| R06 | Coach lacks the personal context its UI implies it has | Unsolved |
| R07 | Account deletion does not erase chats and is not recoverable as one operation | Unsolved |
| R08 | User-scoped in-memory state survives sign-out | Unsolved |
| R09 | Repeating a workout has both lifecycle and accounting defects | Solved |
| R10 | Calendar-day streaks conflict with the scheduled-training definition | Solved |
| R11 | Dates do not roll over reliably while screens remain mounted | Solved |
| R12 | Signup can leave an authenticated account with no usable user document | Solved |
| R13 | Firestore read errors are hidden as empty or loading states | Solved |
| R14 | Swapped and regenerated meals inherit the old logged identity | Solved |
| R15 | Manual meal saving clears the form after a failed write | Solved |
| R16 | Estimates and swap alternatives can become stale while requests run | Solved |
| R17 | Concurrent plan generation can leave multiple active plans | Unsolved |
| R18 | Chat history can reach the model in the wrong order | Unsolved |
| R19 | Chat retry can duplicate a completed turn | Unsolved |
| R20 | Queue waits and client requests have no end-to-end deadline | Unsolved |
| R21 | Per-user throttling does not stop one user consuming the shared service | Unsolved |
| R22 | AI adapters hide truncation, blocking, and unexpected envelopes | Unsolved |
| R23 | AI generation settings and business checks do not match their contracts | Unsolved |
| R24 | OpenRouter plans are recorded as Gemini-generated | Unsolved |
| R25 | Saved profile data and free-text prompt inputs are not fully validated | Unsolved |
| R26 | Client rules allow fabricated assistant messages and malformed authoritative data | Unsolved |
| R27 | Token revocation handling is present but not activated | Unsolved |
| R28 | Voice recording timers are not tied to a recording session | Solved |
| R29 | Parser/upload failures are incorrectly reported as server errors | Unsolved |
| R30 | Audio duration validation fails open | Unsolved |
| R31 | Existing workout plans cannot be regenerated through the app | Solved |
| R32 | Onboarding can submit incomplete data and its final step lacks Back | Solved |
| R33 | Profile editing can create contradictory equipment selections | Solved |
| R34 | Nutrition goals and generated plans have separate sources of truth | Unsolved |
| R35 | Recipe currency handling can relabel the wrong numeric amounts | Unsolved |
| R36 | Workout data does not distinguish timed activities from reps | Solved |
| R37 | Daily-log creation timestamps are overwritten on every save | Solved |
| R38 | Refresh/status UI does not represent actual work or availability | Solved |
| R39 | Automated checks miss the application's important behavior | Unsolved |
| R40 | Documentation overstates several implementation guarantees | Unsolved |

## What the app is and how it works

GymBro is a personal fitness companion aimed at providing inexpensive workout programming, nutrition tracking, and conversational coaching without a personal trainer subscription. The infrastructure is designed around free tiers; the actual account quotas and deployed configuration were not verified in this review.

- **Mobile app:** Expo / React Native, Expo Router, Zustand, Firebase JS SDK. Four tabs: Home, Train, Meals, AI. Profile, settings, and progress are separate routes.
- **Data path A:** the authenticated app reads/writes its own Firestore documents. A shared user-document subscription supplies profile and aggregate stats. Plans, daily logs, conversations, and messages live below `users/{uid}`.
- **Data path B:** the app sends a Firebase ID token to Express. AI routes authenticate, apply a per-user throttle, validate the request, build prompts, and call a shared queued/retrying provider wrapper. Gemini and OpenRouter adapters are selectable; this is configuration-based selection, not automatic failover.
- **Authentication/onboarding:** email/password signup creates an Auth account and user document. Three onboarding steps collect goals, body information, equipment, diet, schedule, and medical notes. Completion saves the profile and starts workout generation in the background.
- **Home:** combines today's scheduled workout, daily calories, stored streak, and the current week's completed daily logs. It can generate a first workout plan.
- **Training:** opening the screen seeds today's plan into an in-memory session. Users record reps/weight, navigate exercises, and use a rest timer. Finishing writes a daily workout and aggregate stats. Stored weights are kilograms; display/input conversion supports pounds.
- **Meals:** generates a seven-day meal plan but displays today's entries. Users can log a planned meal without another AI call, estimate a free-text meal and confirm it, request a recipe with estimated prices, or select an AI-proposed replacement. Recipes are cached inside the plan.
- **Coach:** resumes the latest conversation, displays the last 30 messages, and sends the latest 10 messages to the model. Chat responses and user messages are persisted together by the backend. Status chips read app data separately from the model's context.
- **Voice:** records audio and uploads it to a Groq Whisper proxy, then inserts the transcript into an editable chat/meal field. There is no on-device speech recognition fallback in the implementation.
- **Progress:** attempts to read date-filtered workout logs and calculates highest recorded weights and completed-set counts by muscle group on the client.
- **Account/settings:** profile editing, password change with reauthentication, sign-out, account deletion, device-local weight units, and light/dark/system theme preferences.
- **Backend-only capabilities:** recovery scoring and exercise substitution exist as endpoints but have no app callers. Chat cannot execute those endpoints, log workouts, or edit plans on the user's behalf.

Useful architectural foundations are already present: backend-only provider keys, authenticated AI routes, request schemas, per-user Firestore paths, centralized provider calls, local date IDs, and separate AI estimation versus user-confirmed meal saving. The biggest problems are data integrity, incomplete AI contracts/context, and missing integration coverage.

## Verification and confidence

Executed against installed local dependencies:

- Backend `npm run lint`: passed.
- Backend `npm test -- --ci --runInBand`: **9/9 passed**, one suite.
- Frontend `npm run lint`: **0 errors, 15 warnings**.
- Frontend `npm run typecheck`: passed, but `checkJs: false` means it does not type-check the app's JavaScript implementation.
- Isolated Node/VM probes against the actual source confirmed that validators accept empty active workout days, negative nutrition values, seven repeated Mondays, and a recovery score of zero with `train_hard`. A null plan response throws instead of returning a validation failure.
- A mocked write probe confirmed that a delayed recipe cache operation constructed from an older schedule restores the old meal after a swap.
- Supertest with mocked authentication confirmed malformed JSON and unsupported audio MIME types return **500**, rather than client-error responses.

No live AI requests, authenticated Firebase writes, rules deployment, account deletion, device/simulator run, or new native bundle export was performed. Provider model availability, actual quota values, deployed indexes/rules, and release-build behavior remain unverified. The development log's previous connectivity checks are historical evidence, not current end-to-end proof.

Severity: **P1** = data loss, major broken feature, or important trust/safety boundary; **P2** = material correctness/reliability issue; **P3** = lower-priority maintenance or product gap. Source-confirmed means the defect follows from the implementation; it does not mean it was reproduced on a phone.

## Fix ownership and feature classification

The backlog is organized as **Frontend / Backend > Feature > Finding**. Every finding keeps its original ID, evidence, proposed fix, and priority (P1/P2/P3), now shown in its heading. Work spanning features is filed once under a shared category and cross-referenced where needed. Cross-side tasks are not additional findings. Consult the status table above for the current state of each finding.

## Part 1 - Frontend fixes

Primary scope: `gymbro-app/`, screens, stores, hooks, client-side Firestore writes, and frontend tooling. **22 primary findings**, grouped by feature below. Direct Firestore writes count as frontend work because that is where their implementation lives.

### Authentication, onboarding, and profile

Also implement the client portions of backend R07 (account deletion) and R25 (shared profile validation).

#### R08. [P1] User-scoped in-memory state survives sign-out

- **Evidence:** `gymbro-app/app/_layout.jsx:51–69` clears only the profile; `useActiveWorkoutStore.js` and `useOnboardingDraftStore.js` are global stores with no auth-change reset.
- **Problem:** unfinished workout/body/medical draft data remains in memory after switching accounts. An active workout is not keyed by UID or date, and the workout screen can remain mounted with stale session state. Later async work also lacks a consistent auth-generation guard.
- **Fix:** reset user-scoped stores synchronously on UID changes, key workout drafts by UID/date/session, clear sensitive screen state, and ignore late results belonging to the previous account. Device-local theme/unit preferences can remain.

#### R12. [P2] Signup can leave an authenticated account with no usable user document

- **Evidence:** `app/(auth)/sign-up.jsx` creates Auth first, then updates display name and writes Firestore; root guard returns indefinitely for `userDoc === null`.
- **Problem:** if the later steps fail, signup reports failure but the email is already registered. Signing in again can remain on auth because a missing document is treated as “still loading”. Cold-start routing handles the same condition differently.
- **Fix:** make user-document provisioning idempotent and repairable on login. Separate loading, missing, and failed states; preserve/retry provisioning instead of asking the user to create the account again.

#### R32. [P2] Onboarding can submit incomplete data and its final step lacks Back

- **Evidence:** `schedule-summary.jsx::handleFinish` does not validate the full draft; `OnboardingCard` only renders Back when passed `onBack`, which step three omits. The onboarding stack disables gestures.
- **Problem:** direct navigation/reload at the summary can submit null required fields, and users cannot use the intended footer to correct earlier answers (particularly on iOS).
- **Fix:** validate the whole draft at final submit and route to the first invalid step. Pass the Back handler and preserve/reset drafts with an explicit account-aware policy.

#### R33. [P2] Profile editing can create contradictory equipment selections

- **Evidence:** onboarding `toggleEquipment` makes `bodyweight_only` exclusive; `app/(profile)/edit.jsx::toggleEquipment` does not.
- **Problem:** a saved profile can simultaneously claim bodyweight-only and loaded equipment, giving conflicting constraints to the plan generator.
- **Fix:** share the same normalization/validation logic in onboarding, profile editing, and server-side profile validation.
- **Cross-side work:** Backend: enforce the equipment invariant when validating saved profiles (R25).

### Workout plans and session logging

Coordinate generated-plan/session contracts with backend R05 and R17.

#### R02. [P1] Workout saving discards the session before success is known

- **Evidence:** `gymbro-app/app/(tabs)/workout/index.jsx:114` calls `batch.commit().catch(() => {})`, then clears the session and displays “Workout saved”.
- **Problem:** permission/server failures are swallowed, with no recoverable draft. On native, queued writes exist only in memory, so terminating the app before sync can lose a supposedly saved workout.
- **Fix:** retain a durable, user-scoped pending session until acknowledgement. Show pending/synced/failed states, surface rejection, and retry idempotently. Awaiting acknowledgement alone is sufficient for an online-only flow; a durable outbox is needed for the intended offline flow.

#### R09. [P2] Repeating a workout has both lifecycle and accounting defects

- **Evidence:** `app/(tabs)/workout/index.jsx:47–64,77–116`; `TodayWorkoutCard.jsx` offers “TRAIN AGAIN”.
- **Problem:** after `endSession()`, the seed effect depends on the unchanged plan/day, not the session ending or screen focus. A retained tab can reopen on “Preparing session...” forever. If a new session does start, it replaces today's single `workoutSession` but increments total workouts again. Stats also use stale read-plus-one values, so concurrent completions can lose increments. Even zero-set partial sessions count as workouts.
- **Fix:** add explicit start/resume/new-session actions. Decide whether one or multiple sessions per day are supported; persist session IDs and update counters transactionally/idempotently according to that policy.
- **Cross-side work:** Backend: coordinate session-schema/rules changes. Current workout persistence is implemented by the frontend Firestore client.

#### R31. [P2] Existing workout plans cannot be regenerated through the app

- **Evidence:** dashboard renders “GENERATE MY PLAN” only without `currentPlanId`; the only other caller is onboarding. Profile editing says changes affect future plans, but provides no route to create one. Chat only returns text.
- **Problem:** users who change equipment, schedule, or restrictions cannot replace their existing workout plan from the current UI. An invalid/dangling plan pointer can also hide the recovery CTA.
- **Fix:** expose a deliberate regenerate-plan action with progress/error state and an active-session policy. Allow recovery when a referenced plan is missing or invalid.

#### R36. [P3] Workout data does not distinguish timed activities from reps

- **Evidence:** `useActiveWorkoutStore.js::parseTargetReps` extracts the first number from any string, so `30s` becomes 30 reps despite its comment. The set UI has only reps/weight fields.
- **Problem:** cardio/mobility holds can be recorded with the wrong unit, undermining history and future analysis.
- **Fix:** model exercise targets with explicit units (reps, seconds, distance) and render/store the matching input.
- **Cross-side work:** Backend: extend generated exercise schemas/prompts to carry the same explicit target units.

### Nutrition, meal logging, recipes, and swaps

Also implement the client portions of backend R34 (unified targets) and R35 (currency preferences and recipe cache versions).

#### R03. [P1] Meal logging overwrites concurrent changes

- **Evidence:** `gymbro-app/services/nutritionLogActions.js:40` appends/removes using a caller-supplied `existingLog`, then replaces the entire meals array and totals.
- **Problem:** two actions based on the same snapshot, especially on two devices, overwrite each other's meals. There is no operation ID or transaction. Repeated taps can also produce duplicate entries.
- **Fix:** use individually identified meal documents or transactionally modify the latest log; make log operations idempotent and derive totals from authoritative entries. Handle offline operations explicitly rather than assuming transactions work offline.
- **Cross-side work:** Backend: update Firestore rules/schema tests if meals move to a subcollection.

#### R04. [P1] Recipe completion can undo a meal swap

- **Evidence:** `gymbro-app/services/mealPlanActions.js:47–76` rewrites the whole schedule supplied by the caller; `app/(tabs)/nutrition/meal.jsx:81–95` captures that schedule before awaiting AI.
- **Problem:** open a recipe, swap the meal while its request is running, then let the original request finish. Its cache write can restore the old dish and erase other edits. Reproduced with mocked writes against the actual helper.
- **Fix:** give meals stable IDs/revisions. Read the latest plan in a transaction and attach detail only if the same meal revision still exists; never write an old whole-schedule snapshot after an AI await.
- **Cross-side work:** Backend: coordinate stable generated meal IDs/revisions with R14.

#### R14. [P2] Swapped and regenerated meals inherit the old logged identity

- **Evidence:** `services/mealPlanActions.js:20` keys only by weekday/type/index; `meal.jsx:143–150` incorrectly claims this detects a new dish.
- **Problem:** log lunch, swap it, and the replacement still appears logged. Toggling it removes the old eaten meal. Regenerating a plan reuses the same slot keys as the old plan.
- **Fix:** use `planId + mealId + revision` for planned-meal identity and a separate immutable log-entry ID. Preserve previously eaten meals while treating a replacement as a new loggable item.
- **Cross-side work:** Backend: attach stable meal IDs/revisions during generation and preserve them in the shared contract.

#### R15. [P2] Manual meal saving clears the form after a failed write

- **Evidence:** nutrition screen `handleSaveMeal` catches and swallows rejection; `AddMealSheet.jsx:57–66` treats its resolved promise as success, resets, and closes.
- **Problem:** users lose their description and estimate even though saving failed.
- **Fix:** return a success result or rethrow the error; keep the sheet and draft until confirmed successful or durably queued.

#### R16. [P2] Estimates and swap alternatives can become stale while requests run

- **Evidence:** `AddMealSheet.jsx` allows description/type edits during estimation and applies the eventual response unconditionally. Voice transcription changes the description without clearing an existing estimate. `SwapMealSheet.jsx` has no request-generation guard and keyboard submission bypasses the disabled refresh button.
- **Problem:** macros can describe the previous input; older requests can overwrite newer alternatives. A late response can update a closed/reopened sheet.
- **Fix:** bind results to an input/version hash, discard late responses, invalidate estimates on every input path including voice, and guard all submission paths against overlapping requests.

### Dashboard, progress, streaks, and dates

#### R01. [P1] Progress query is incompatible with the checked-in Firestore rules

- **Evidence:** `gymbro-app/app/(profile)/progress/index.jsx:57` uses `collectionGroup(db, 'dailyLogs')`; `gymbro-backend/firestore.rules` grants reads only at `users/{uid}/dailyLogs/{date}`. There is no collection-group rule or checked-in group index configuration.
- **Problem:** with these rules deployed, the group query cannot establish permission across every possible `dailyLogs` path. A `uid` field filter does not turn it into a path-scoped query. Progress can fail despite the user's ordinary daily-log reads working.
- **Fix:** query `collection(db, 'users', user.uid, 'dailyLogs')` with the date range. If a group query is genuinely needed later, add explicit group rules, enforce immutable ownership fields on writes, and version the required indexes. This diagnosis follows Firebase's [collection-group rules requirements](https://firebase.google.com/docs/firestore/security/rules-query#collection-group_queries); the live deployment was not tested.

#### R10. [P2] Calendar-day streaks conflict with the scheduled-training definition

- **Evidence:** `app/(tabs)/workout/index.jsx:318` only checks yesterday; dashboard/profile display the stored value unchanged.
- **Problem:** a planned rest day breaks the next workout's streak, while missing several days leaves the old streak displayed until another workout is saved. The SRS defines missed scheduled days as the relevant condition.
- **Fix:** agree on the streak definition, derive the current value against today's date and schedule, and update aggregate values through one tested implementation.

#### R11. [P2] Dates do not roll over reliably while screens remain mounted

- **Evidence:** dashboard `weekDates` uses `useMemo(..., [])`; dashboard/workout memoize today's plan day only on `plan`; `hooks/useToday.js` contains helpers but no reactive hook.
- **Problem:** midnight, a new week, or returning after a long background period can leave the previous day's workout/week on screen. A session is dated by finish time, without an explicit cross-midnight policy.
- **Fix:** add a shared local-date hook refreshed at midnight and foreground/timezone changes. Include date/week in dependencies and record the intended workout date at session start.

### Voice capture

Coordinate upload deadlines and errors with backend R20, R29, and R30.

#### R28. [P2] Voice recording timers are not tied to a recording session

- **Evidence:** `hooks/useVoiceCapture.js:40–42` creates an untracked timeout. Auto-stop does not update `isRecording`, retain a stopped state, or start transcription; manual stop never clears the timeout.
- **Problem:** an old timeout can stop a newer recording. At 60 seconds, UI state can still say recording, and the next tap attempts to stop an already-stopped recorder. Multiple mic presses/transcriptions are not consistently blocked.
- **Fix:** keep and clear a timer per recording, use recorder state as the authority, unify manual/automatic stop, retain the URI, and clean up recording/audio mode on cancellation/unmount.

### Shared data loading, sync, and status

Also implement client request deadlines/cancellation from backend R20. These shared fixes affect several screens.

#### R13. [P2] Firestore read errors are hidden as empty or loading states

- **Evidence:** root subscription error handler calls `setUserDoc(null)`; most consumers discard `error` from `useFirestoreDoc`/`useFirestoreCollection`. Those hooks retain old data while a new path loads.
- **Problem:** permission/network failures resemble “no plan”, “no messages”, or endless loading. Old data can briefly appear under a new resource path and can drive actions before its replacement arrives.
- **Fix:** expose distinct loading/missing/error states, clear or tag data by its resource key on path changes, disable writes until the correct resource is loaded, and offer an actual retry.

#### R37. [P3] Daily-log creation timestamps are overwritten on every save

- **Evidence:** `nutritionLogActions.js:27` and workout save both include `createdAt: serverTimestamp()` in merge writes.
- **Problem:** adding a meal or finishing a workout changes the apparent creation time of the existing daily document.
- **Fix:** set creation metadata only on first creation; update only `updatedAt` afterward.

#### R38. [P3] Refresh/status UI does not represent actual work or availability

- **Evidence:** dashboard refresh only waits 600 ms; Coach always displays “Online · Always here”; `useCallBackend` labels every request exceeding four seconds as waking the backend.
- **Problem:** refreshing cannot recover a failed subscription, and ordinary queue/model latency is mislabeled as a cold start. Offline users still see Coach online.
- **Fix:** make refresh retry/refetch, derive connectivity state honestly, and use generic waiting copy unless backend readiness is actually known.

### Testing and documentation

Backend testing and documentation responsibilities remain part of these shared findings.

#### R39. [P3] Automated checks miss the application's important behavior

- **Evidence:** one backend suite tests routing/auth rejection/request validation; no frontend suite. `tsconfig.json` disables `checkJs` and only includes JS/JSX globs. CI does not run controller/rules integration tests or a bundle export.
- **Problem:** green checks do not verify generated-output contracts, plan persistence, permissions, races, workout totals, meal updates, or routing. Contrary to a config comment, newly added standalone TS files also need matching include patterns.
- **Fix:** add focused response-schema/provider/controller tests, Firestore emulator tests, and frontend state/flow tests. Enable checking incrementally on core services and add an appropriate bundle smoke check. Treat the 15 lint warnings as maintenance work, not proof of 15 runtime bugs.
- **Cross-side work:** Backend: add response-schema/provider/controller and Firestore emulator tests to CI. Frontend: add state/flow tests, incremental JS checking, and bundle checks.

#### R40. [P3] Documentation overstates several implementation guarantees

- **Evidence:** README claims `tsc --checkJs` catches shape drift; actual config disables it. Development log calls a provider ping and Admin read proof that no AI/Firebase issue exists. Recipe caching and swaps are described as safe single-writer operations. SRS still describes capabilities/settings that differ from code.
- **Problem:** future debugging can mistake historical checks, design intent, and implementation claims for verified behavior.
- **Fix:** maintain one current feature/verification inventory. Mark provider pings, native runs, emulator checks, and end-to-end flows separately; update model/quota assumptions only using current account evidence. Keep historical logs intact but append corrections.
- **Cross-side work:** Backend: correct provider/quota, rules, and live-verification claims. Frontend: correct UI/offline/typecheck claims. Maintain one shared verification inventory.

### AI Coach interface - dependencies on backend findings

- **R18 [P2]:** query/render chat messages using the agreed ordering fields.
- **R19 [P2]:** generate stable request IDs, retain them for retries, and reconcile optimistic messages by ID.
- **R06 [P1]:** coordinate the interface with the actual context available to the coach; the missing context is fixed server-side.

These reference existing backend findings and do not increase the frontend finding count.

## Part 2 - Backend fixes

Primary scope: `gymbro-backend/`, AI providers/prompts/controllers, authentication middleware, Firestore rules, and backend CI. **18 primary findings**, grouped by feature below.

### Authentication, account deletion, and profile validation

#### R07. [P1] Account deletion does not erase chats and is not recoverable as one operation

- **Evidence:** `gymbro-app/services/accountActions.js:26–83`; message rules deny deletion. Settings promises to erase chats.
- **Problem:** deleting conversation parents leaves message documents behind. If a later deletion step fails, earlier data is already gone while the Auth account can remain. Background plan/chat requests can also race the deletion. The code acknowledges orphan messages, but the user-facing promise does not.
- **Fix:** implement a reauthenticated backend deletion job using Admin SDK recursive deletion. Mark the account as deleting, reject new work, cancel/check outstanding writes, retry cleanup, and delete Auth last. Report completion only after cleanup finishes.
- **Cross-side work:** Frontend: replace client-side deletion with the backend deletion flow and display pending, failed, and completed states.

#### R25. [P2] Saved profile data and free-text prompt inputs are not fully validated

- **Evidence:** profile forms mostly check positivity/presence; Firestore root rules check ownership/UID only. Plan prompt builders trust `profile.availableEquipment.join(...)`. Medical notes are unbounded and inserted outside the declared user-input block; several other free-text fields are interpolated similarly.
- **Problem:** malformed or extreme profile values can corrupt calculations, throw before the provider call, or inflate prompt size. Reading a client-writable field from Firestore does not make it trusted. Prompt delimiters are an instruction convention, not a security guarantee.
- **Fix:** share bounded profile schemas across form validation, server reads, and suitable Firestore rules. Serialize untrusted context consistently, retain clear system/data separation, and test adversarial inputs alongside strict output validation.
- **Cross-side work:** Frontend: apply the same bounded profile schema in onboarding and editing. Server/rules validation remains authoritative.

#### R27. [P2] Token revocation handling is present but not activated

- **Evidence:** `middleware/verifyToken.js:20` calls `verifyIdToken(idToken)` without checking revocation, yet has a revoked-token branch.
- **Problem:** signature/expiry validation alone does not perform the revocation check that the middleware appears to promise. Previously issued valid tokens can continue reaching AI/audio until expiry after revocation.
- **Fix:** use revocation-aware verification or an explicit equivalent policy for sensitive operations, with tests and an understood latency cost. Firebase documents the additional flag in [Manage User Sessions](https://firebase.google.com/docs/auth/admin/manage-sessions#detect_id_token_revocation).

### Workout and meal plan generation

Also apply shared AI validation/settings fixes R05 and R23. Coordinate meal identities with frontend R04/R14 and target units with R36.

#### R17. [P2] Concurrent plan generation can leave multiple active plans

- **Evidence:** both plan controllers read `currentPlanId`/`currentMealPlanId` before the potentially long AI call, then deactivate only that captured plan in a batch.
- **Problem:** two requests can read the same old pointer and both create an active plan. A write batch is atomic but does not protect an earlier read from concurrent changes. A dangling old pointer also makes `batch.update(oldPlanRef)` fail the whole save.
- **Fix:** generate outside the transaction, then transactionally read the latest pointer and commit the new plan/deactivate the actual predecessor. Add a per-user generation lock/idempotency key and handle a missing predecessor.

### AI Coach and chat history

Frontend follow-up: adopt the same ordering fields, reuse retry request IDs, and reconcile optimistic bubbles by ID.

#### R06. [P1] Coach lacks the personal context its UI implies it has

- **Evidence:** `gymbro-backend/controllers/aiController.js:248–291` sends goal, experience, and streak; `stats.currentPlanName` is referenced but never populated by app writes. `ChatScreen.jsx` displays workout/calorie chips separately.
- **Problem:** the model does not receive active exercises, meal plan, actual progress, daily intake, dietary restrictions, or medical notes. “Check progress” and personalized food/injury questions therefore lack the relevant facts, even though they are available in the app.
- **Fix:** build a bounded server-side context object with relevant profile restrictions, current plans, and recent logs. Include only necessary fields, timestamp the context, and instruct the coach to identify missing information instead of inventing it.

#### R18. [P2] Chat history can reach the model in the wrong order

- **Evidence:** `aiController.js:283–287` orders only by timestamp and reverses the results, although both messages share a timestamp and have `sequence: 0/1`.
- **Problem:** ID-based ties can put the assistant before its user prompt. The client sorts ties, but that does not repair the backend's model context. Simultaneous turns can also read the same history before either is saved.
- **Fix:** order by an explicit turn/message sequence, use it in both queries, and serialize turns per conversation or enforce a conversation revision.
- **Cross-side work:** Frontend: use the same ordering fields in chat queries and rendering.

#### R19. [P2] Chat retry can duplicate a completed turn

- **Evidence:** `ChatScreen.jsx::sendMessage` retries without an operation ID; `aiController.js::chat` always creates new messages and, if no ID was received, a new conversation.
- **Problem:** a successful commit followed by a lost HTTP response is shown as failed. Retrying writes another turn/conversation and spends more provider quota.
- **Fix:** generate a client request ID, persist/deduplicate it server-side, and reconcile optimistic bubbles using that ID rather than response timing.
- **Cross-side work:** Frontend: generate and reuse request IDs on retries; reconcile optimistic messages by ID.

### Nutrition targets, recipes, and pricing

Also apply shared AI validation/settings fixes R05 and R23 to nutrition estimates, meal plans, and substitutions.

#### R34. [P2] Nutrition goals and generated plans have separate sources of truth

- **Evidence:** `services/nutritionTargets.js` computes targets locally; `mealPlanPrompts.js` asks the model to independently derive intake, without receiving those targets. The nutrition screen's “AI COACH TIP” is a fixed string recommending a shake/yogurt.
- **Problem:** a fully followed generated plan can disagree with the ring's daily goals. The fixed tip ignores the stored diet/restrictions and can make an unsupported “closes most of that” claim for a large gap.
- **Fix:** calculate/version one agreed set of targets and pass it into generation; validate daily totals against it. Make static suggestions restriction-aware and label them accurately, or generate grounded advice using the same context.
- **Cross-side work:** Frontend: display the agreed versioned targets and make static nutrition tips restriction-aware and accurately labelled.

#### R35. [P2] Recipe currency handling can relabel the wrong numeric amounts

- **Evidence:** `mealPlanController.js:202–204` overwrites returned currency with the request value without checking a mismatch. Cached detail is reused regardless of device currency/profile changes; `deviceCurrency()` has no user override.
- **Problem:** changing a currency label is not conversion. A response priced in the wrong currency becomes plausible-looking wrong prices; another device or a changed dietary restriction still receives the old cached recipe.
- **Fix:** reject mismatched currency, verify ingredient totals, and key recipe caches by meal revision, currency/location preference, and relevant profile version. Provide an override for the shopping locale/currency.
- **Cross-side work:** Frontend: add shopping currency/location preferences and invalidate caches when meal/profile/currency versions change.

### Voice transcription

Also apply shared API error handling R29, queue/deadline handling R20, and audio throttling R21.

#### R30. [P2] Audio duration validation fails open

- **Evidence:** `controllers/audioController.js:16–25` returns zero when metadata parsing fails or has no duration.
- **Problem:** the advertised 60-second server cap is not enforced on unprobeable audio; a compressed long clip can fit within the file-size cap.
- **Fix:** reject unknown/invalid duration with a clear error or use a reliable bounded decoding/probing path, and retain the independent byte/concurrency limits.

### Shared AI providers, validation, queues, and API errors

These fixes apply across workout generation, meal planning, nutrition estimation, recovery scoring, substitutions, and chat as relevant; they are listed once to avoid duplicate work.

#### R05. [P1] AI output validation does not protect the consumers

- **Evidence:** `gymbro-backend/controllers/aiController.js:23,128,175,208,246`; `controllers/mealPlanController.js:44,166,224`.
- **Problem:** workout validation does not require valid day labels, nonempty active days, exercise names, bounded integer sets, durations, or top-level plan metadata. Meal validation allows repeated weekdays and negative macros. Several nested null values throw TypeErrors. Bad output can reach Firestore, break rendering, produce empty sessions, or fail later as an unrelated 500. Local probes confirmed several accepted invalid cases.
- **Fix:** define full null-safe Zod response schemas, including all UI-consumed fields, bounds, unique weekdays, string lengths, and business invariants. Run them before persistence and inside the retry policy. Validate model output even when structured-output support is enabled.

#### R20. [P2] Queue waits and client requests have no end-to-end deadline

- **Evidence:** `geminiRateLimiter.js` allows 30 queued jobs with concurrency 1; only the outbound provider call has a timeout. `apiClient.js` and voice upload have no AbortController/deadline.
- **Problem:** jobs can wait minutes before the provider timeout even starts. A client that navigates away or loses connectivity leaves queued work running; spinners can remain indefinitely on stalled fetches.
- **Fix:** impose a queue-age deadline and total request budget, propagate cancellation where feasible, and expose retryable queue-timeout errors. Use idempotency for operations that may finish after the client times out.
- **Cross-side work:** Frontend: add deadlines/cancellation to API and audio clients; handle timeout errors without unsafe retries.

#### R21. [P2] Per-user throttling does not stop one user consuming the shared service

- **Evidence:** `perUserThrottle.js` permits one request every two seconds, while the shared queue starts at most one every 4.2 seconds and can be slower. Audio has no throttle at all.
- **Problem:** one authenticated client can accumulate queued AI requests and monopolize the service; audio requests can concurrently allocate up to 5 MB each and consume transcription quota. The UID timestamp map also grows without expiry.
- **Fix:** cap outstanding work per UID, add appropriate audio concurrency/rate limits, enforce usage budgets, and expire throttle entries. Tune provider-specific limits from verified configuration rather than comments about an earlier model.

#### R22. [P2] AI adapters hide truncation, blocking, and unexpected envelopes

- **Evidence:** adapters index `candidates[0].content.parts[0].text` or `choices[0].message.content` without checking finish/block reasons. The resilience wrapper recognizes syntax/schema failures but not validator TypeErrors.
- **Problem:** a blocked/missing response becomes a generic 500; truncated output is retried with the same potentially insufficient budget. A model/configuration error is indistinguishable from other failures to the user and poorly diagnosable by maintainers.
- **Fix:** normalize provider envelopes and finish reasons, distinguish refusal/truncation/configuration errors, record safe diagnostic metadata, and use bounded feature-specific recovery. Confirm actual model availability with the project's provider account during the forthcoming AI investigation.

#### R23. [P2] AI generation settings and business checks do not match their contracts

- **Evidence:** both adapters hardcode `temperature: 0.7`; workout/meal count checks run after the resilience wrapper; recovery/substitution validators check shape without enforcing score bands or macro tolerances.
- **Problem:** deterministic calculations receive the same randomness as chat. Some invalid responses retry while count mismatches do not. Meal alternatives are presented as fitting a slot without checking the promised calorie/protein range; recovery can accept contradictory scores/recommendations.
- **Fix:** pass per-feature generation settings, move business checks into contextual response validators, and calculate deterministic values/rules in code where practical. Measure real output sizes before changing the fixed token budgets.

#### R24. [P2] OpenRouter plans are recorded as Gemini-generated

- **Evidence:** both plan controllers import `MODEL_ID` directly from `geminiAdapter`, irrespective of `AI_PROVIDER`.
- **Problem:** provenance/debugging metadata is false whenever OpenRouter is selected. The Gemini-specific queue settings also apply to both providers without an explicit configuration boundary.
- **Fix:** return provider/model metadata from the selected adapter and persist it with the result; configure limits by provider.

#### R29. [P2] Parser/upload failures are incorrectly reported as server errors

- **Evidence:** global error handler in `gymbro-backend/index.js`; Multer file filtering in `routes/audio.js`; unsupported-format catch inside the controller is too late.
- **Problem:** malformed JSON, oversized bodies/files, and rejected MIME types bypass the intended validation responses and return generic 500. Malformed JSON and MIME rejection were reproduced locally.
- **Fix:** normalize body-parser and Multer errors centrally into 400/413/415 responses with the existing JSON error contract. Test those middleware failure paths.

### Firestore rules and data integrity

Also cover frontend write schemas from R03, R09, and R14 with rules/emulator tests.

#### R26. [P2] Client rules allow fabricated assistant messages and malformed authoritative data

- **Evidence:** `firestore.rules` permits owners to create messages with `role: 'assistant'` and to modify whole plan/profile/log documents; timestamp/sequence and most data shapes are unrestricted.
- **Problem:** an owner can manufacture history later treated as coach output, or write data that the UI/backend cannot process. This is an integrity issue inside that user's account, not evidence of cross-user access.
- **Fix:** make assistant messages backend-written only; validate permitted client message/log/profile shapes and constrain plan edits to intended fields. Keep ownership protection and add emulator tests for malformed writes.

### Testing and documentation

- **R39 [P3]:** add backend response-schema, provider, controller, and Firestore emulator tests in CI. The full shared finding is under frontend Testing and documentation.
- **R40 [P3]:** correct backend/provider/deployment documentation and verification claims. The full shared finding is under frontend Testing and documentation.

## Product gaps and accepted limitations — separate from defects

These should be prioritized as product decisions, not silently counted as broken implemented features:

- **Recovery and exercise substitution:** backend endpoints exist, but no app flow invokes/saves their results. The revised SRS explicitly deferred their UI placement. Add the flows if they remain in scope; generic coach replies do not implement them.
- **Coach action wording:** “Log today's workout”, “Update meal plan”, and “Adjust plan” only open/send conversational requests. Either clearly describe them as advice or add structured, validated, user-confirmed actions. No plan/log mutation tool exists today.
- **Chat history navigation:** only the latest conversation and last 30 rendered messages are reachable through normal UI; there is no new-chat/history/archive/pagination experience. A route accepting a conversation ID does not provide a way to discover older chats.
- **Manual meal correction:** manually logged meals are read-only in the list. Add edit/delete by stable entry ID so bad estimates and accidental logs can be corrected.
- **Offline durability:** Firebase native cache and active workout state are in-memory by design. The README documents the compromise, but the banner's sync promise needs to reflect it. Persistent drafts/outbox or a native Firestore migration are required for restart-safe offline use.
- **Body-weight history/plan progression:** profile weight replaces one current value; no daily weight-history chart is implemented. `durationWeeks` is stored but plans are repeated by weekday indefinitely, without expiry/progression or a week browser. Some of these were already deferred in the revised SRS.
- **Localization:** meals have one description, without the local-name/English-gloss schema proposed in Phase 3. Currency inference alone does not localize meals or establish shopping location.
- **Password recovery:** change-password requires the current password; sign-in has no forgot-password flow. Add password-reset support if accounts are intended for ongoing use.
- **Web/release readiness:** a web script/config exists without declared `react-native-web`/`react-dom` support. No EAS build configuration is checked in. Native system-theme behavior also needs release-build verification because `app.json` fixes `userInterfaceStyle` to `light` while settings advertise System. These are not validated by lint/typecheck.
- **Deployment/demo evidence:** actual rules/index deployment, hosted backend environment, provider-account limits, a seeded demo, and full login-to-save device runs remain to be verified. This review makes no claim that a particular live service is down or that a named model is currently unavailable.

## Suggested repair order

1. Protect saved data and account boundaries: R01–R04, R07–R09, R14–R17.
2. Establish reliable AI contracts and grounded context: R05–R06, R18–R26, R34–R35.
3. Repair auth/routing, deadlines, voice, and feature recovery: R10–R13, R27–R33.
4. Add regression coverage for those fixes, then address R36–R40 and select product gaps.

Before implementation, add focused regression cases for: two simultaneous meal logs; recipe request finishing after a swap; log/swap/regenerate identity; finish-workout rejection and restart; a second workout on the same day; UID switch with an active draft; midnight/week rollover; signup with a failed user-document write; parallel plan generation; duplicate chat retry; malformed/blocked/truncated provider responses; and account deletion with nested chats/in-flight requests.

## Handoff for the forthcoming AI errors

The main trace is: screen/component → `useCallBackend` → `apiClient` → route/auth/throttle/Zod → controller/context/prompt → `aiResilienceWrapper` → limiter → selected adapter → response validation → optional Firestore batch → app snapshot.

When examining the next error report, distinguish provider HTTP failures, response parsing/schema failures, queue/throttle failures, persistence failures after successful generation, and frontend consumption errors. Useful evidence is the affected action, endpoint, HTTP status and application error code, provider/model configuration, request duration, and a redacted provider finish reason/response shape. Do not include API keys, bearer tokens, service-account material, or unnecessary personal profile/chat content.
