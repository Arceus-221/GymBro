# GymBro — Phase 3 SRS

## Frontend Architecture & Detailed UI/UX Specifications

> **Continuity Note:** This document extends `GymBro_SRS_Phase_1.md` (data flow, Firestore schema, backend) and `GymBro_SRS_Phase_2.md` (AI prompt specs). All screen specs below assume Path A (direct Firestore SDK) for CRUD and Path B (`callBackend()` from Phase 1 §3I) for every AI-touching action. Every Firestore field referenced here maps directly to the schema in Phase 1 §2.

---

## 1. Folder Structure & Modular Component Tree

GymBro uses **Expo Router** (file-based routing) rather than manually wired React Navigation stacks — this keeps deep-linking, auth-gating, and tab structure declarative and colocated with the screens themselves.

```
gymbro-app/
├── app/                                   ← Expo Router file-based routes
│   ├── _layout.jsx                        ← Root layout: theme provider, auth listener, offline banner
│   ├── index.jsx                          ← Splash/redirect: routes to (auth) or (tabs) based on auth state
│   │
│   ├── (auth)/                            ← Unauthenticated stack
│   │   ├── _layout.jsx
│   │   ├── sign-in.jsx
│   │   └── sign-up.jsx
│   │
│   ├── (onboarding)/                      ← Shown once, gated by users/{uid}.onboardingComplete
│   │   ├── _layout.jsx                    ← Progress bar header, back-swipe disabled
│   │   ├── goals.jsx                      ← Step 1
│   │   ├── experience.jsx                 ← Step 2
│   │   ├── equipment.jsx                  ← Step 3
│   │   ├── diet.jsx                       ← Step 4
│   │   ├── schedule.jsx                   ← Step 5
│   │   └── summary.jsx                    ← Step 6: review + submit → writes users/{uid}.profile
│   │
│   └── (tabs)/                            ← Main authenticated app, bottom tab navigator
│       ├── _layout.jsx                    ← Tab bar config (5 tabs, dark theme, icon set)
│       ├── index.jsx                      ← Home Dashboard
│       ├── workout/
│       │   ├── index.jsx                  ← Today's Workout Screen
│       │   └── [planId].jsx               ← View a specific historical/alternate plan
│       ├── coach/
│       │   ├── index.jsx                  ← Conversation list (if >1 active conversation)
│       │   └── [conversationId].jsx       ← AI Coach chat screen
│       ├── nutrition/
│       │   ├── index.jsx                  ← Nutrition (log meal) screen
│       │   └── planner.jsx                ← Meal Planner screen
│       └── progress/
│           └── index.jsx                  ← Progress screen
│
├── components/
│   ├── onboarding/
│   │   ├── OnboardingCard.jsx             ← Shared card shell (title, subtitle, footer nav)
│   │   ├── GoalSelector.jsx
│   │   ├── EquipmentGrid.jsx              ← Multi-select chip grid
│   │   └── ProgressDots.jsx
│   │
│   ├── dashboard/
│   │   ├── TodayWorkoutCard.jsx
│   │   ├── RecoveryScoreRing.jsx          ← Animated SVG ring, 0–100
│   │   ├── CalorieSnapshotCard.jsx
│   │   ├── AIMotivationBanner.jsx
│   │   └── StreakBadge.jsx
│   │
│   ├── workout/
│   │   ├── ExerciseCard.jsx               ← Collapsible: name, sets, form cue, substitute trigger
│   │   ├── SetRow.jsx                     ← reps/weight input row, checkbox for completed
│   │   ├── RestTimerModal.jsx
│   │   ├── SubstituteSheet.jsx            ← Bottom sheet, triggers Path B call
│   │   ├── VoiceLogButton.jsx             ← Mic icon, triggers Expo Speech/Whisper capture
│   │   └── WorkoutSummaryModal.jsx        ← Shown on "Finish Workout"
│   │
│   ├── coach/
│   │   ├── ChatBubble.jsx                 ← role-aware styling (user right/assistant left)
│   │   ├── ChatInputBar.jsx               ← text input + context chips + send button
│   │   ├── ContextChipSelector.jsx        ← 'workout_advice' | 'nutrition' | 'recovery' | 'motivation'
│   │   ├── TypingIndicator.jsx
│   │   └── ConversationListItem.jsx
│   │
│   ├── nutrition/
│   │   ├── MealInputBar.jsx               ← text input + voice trigger
│   │   ├── MacroEstimatePreviewCard.jsx   ← shown post-AI-call, pre-save
│   │   ├── MealTypeSelector.jsx
│   │   ├── DailyMacroSummaryBar.jsx       ← stacked progress bar: protein/carbs/fats
│   │   └── LoggedMealRow.jsx
│   │
│   ├── planner/
│   │   ├── WeekDayMealCard.jsx
│   │   ├── MacroBadge.jsx
│   │   └── RegeneratePlanButton.jsx
│   │
│   ├── progress/
│   │   ├── WeightProgressChart.jsx        ← react-native-svg + victory-native or Skia
│   │   ├── PRTrackerTable.jsx
│   │   ├── VolumeBarChart.jsx             ← weekly sets-per-muscle-group
│   │   └── DateRangeToggle.jsx            ← 1M / 3M / 6M / All
│   │
│   └── shared/
│       ├── Button.jsx
│       ├── Card.jsx
│       ├── LoadingSpinner.jsx
│       ├── OfflineBanner.jsx              ← global, driven by NetInfo + Firestore metadata.fromCache
│       ├── ErrorToast.jsx                 ← consumes standardized error contract (Phase 2 §7.6)
│       ├── EmptyState.jsx
│       └── BottomSheet.jsx
│
├── store/                                 ← Zustand stores (see §3)
│   ├── useAuthStore.js
│   ├── useUserProfileStore.js
│   ├── useActiveWorkoutStore.js           ← ephemeral, in-progress session state
│   ├── useUIStore.js                      ← modals, sheets, toasts, active tab
│   └── useConnectivityStore.js            ← online/offline + pending-write count
│
├── hooks/
│   ├── useFirestoreDoc.js                 ← reusable onSnapshot wrapper w/ Firestore converter
│   ├── useFirestoreCollection.js
│   ├── useCallBackend.js                  ← wraps Phase 1 §3I callBackend() with loading/error state
│   ├── useVoiceCapture.js                 ← Expo Speech / Whisper API abstraction
│   ├── useRestTimer.js
│   └── useOptimisticWrite.js              ← generic optimistic-update + rollback helper
│
├── services/
│   ├── firebase.js                        ← client SDK init + offline persistence config
│   ├── firestoreConverters.js             ← withConverter() for every collection (JSDoc-typed, not TS)
│   ├── apiClient.js                       ← from Phase 1 §3I
│   └── analytics.js
│
├── models/                                ← plain JS shape references + JSDoc typedefs (no TypeScript)
│   ├── user.js                            ← mirrors Phase 1 users/{uid} schema
│   ├── workoutPlan.js
│   ├── dailyLog.js
│   ├── aiConversation.js
│   └── api.js                             ← request/response shapes per Phase 2 endpoint
│
├── constants/
│   ├── theme.js                           ← dark palette, spacing scale, typography
│   └── equipment.js                       ← the 7 availableEquipment enum values, labeled
│
└── app.json / eas.json / package.json
```

**Component tree conventions:**

- Every screen component is a thin composition layer — data fetching lives in hooks, presentation lives in `components/`.
- No screen directly calls `firestore()` or `fetch()` — always through `hooks/useFirestoreDoc`, `useFirestoreCollection`, or `useCallBackend`, so retry/offline/error handling is centralized exactly once (mirrors the Phase 2 §7.2 backend philosophy, applied client-side).

---

## 2. Screen-by-Screen Technical Specifications

### 2.1 Onboarding Flow Screen

**Route:** `app/(onboarding)/*.jsx` — 6-step wizard, one screen per step, `ProgressDots` in header.

**Layout (per step):**

```
┌─────────────────────────────────┐
│  ← Back        ●●●○○○  (dots)   │  ← ProgressDots, step 3 of 6
├─────────────────────────────────┤
│                                  │
│   "What's your main goal?"      │  ← Title, large, bold
│   Pick one to personalize plans │  ← Subtitle, muted
│                                  │
│  ┌───────────┐  ┌───────────┐   │
│  │ 🔥 Fat    │  │ 💪 Muscle │   │  ← GoalSelector: 2x2 card grid
│  │   Loss    │  │   Gain    │   │
│  └───────────┘  └───────────┘   │
│  ┌───────────┐  ┌───────────┐   │
│  │ ⚖️ Maint. │  │ 🏃 Endur. │   │
│  └───────────┘  └───────────┘   │
│                                  │
├─────────────────────────────────┤
│         [ Continue → ]          │  ← disabled until a selection made
└─────────────────────────────────┘
```

**Step mapping to `profile` fields:**

|Step|Screen|Fields Collected|Component|
|---|---|---|---|
|1|`goals.jsx`|`fitnessGoal`|`GoalSelector` (single-select cards)|
|2|`experience.jsx`|`experienceLevel`, `age`, `gender`, `heightCm`, `weightKg`|Segmented control + numeric inputs|
|3|`equipment.jsx`|`availableEquipment`|`EquipmentGrid` (multi-select chips)|
|4|`diet.jsx`|`dietaryPreference`, `targetWeightKg` (optional)|Radio list + optional numeric field|
|5|`schedule.jsx`|`workoutDaysPerWeek`, `preferredDurationMinutes`, `medicalNotes` (optional free text)|Stepper (2–6) + segmented duration (30/45/60/90) + `TextInput`|
|6|`summary.jsx`|Review card of all above, editable via tap-to-jump-back|Read-only summary list|

**State requirements:**

- A single `useOnboardingDraftStore` (Zustand, not persisted to Firestore until final submit) holds the in-progress `profile` object across all 6 steps — avoids partial writes to Firestore mid-flow.
- Each step screen reads/writes only its own slice of the draft via selector hooks (`useOnboardingDraftStore(s => s.fitnessGoal)`), preventing unnecessary re-renders of unrelated fields.
- `summary.jsx` is the **only** screen that performs the Firestore write: a single `users/{uid}.set({ profile: draft, onboardingComplete: true, updatedAt: serverTimestamp() }, { merge: true })` (Path A). On success, root layout's auth listener re-evaluates and routes to `(tabs)`.

**User actions:**

- Tap card/chip → updates draft store, no network call.
- "Continue" → validates required field(s) for that step present, pushes next route.
- "Back" → `router.back()`, draft store retains prior values (no reset).
- Final "Finish Setup" (on `summary.jsx`) → shows `LoadingSpinner` over button during the Firestore write, then triggers **Path B** call to `/api/ai/generate-plan` automatically (first plan generation is part of onboarding completion, not a separate user action) before navigating to Home Dashboard, so the user's first-ever screen already has a plan waiting.

---

### 2.2 Home Dashboard Screen

**Route:** `app/(tabs)/index.jsx`

**Layout:**

```
┌─────────────────────────────────┐
│  Good morning, Alex 👋   🔥 12  │  ← Greeting + StreakBadge (stats.currentStreakDays)
├─────────────────────────────────┤
│  ┌───────────────────────────┐   │
│  │ 💬 "Nice work yesterday—  │   │  ← AIMotivationBanner (dismissible,
│  │ let's keep the streak     │   │     cached client-side, refreshed 1x/day)
│  │ alive today."              │   │
│  └───────────────────────────┘   │
│                                  │
│  ┌───────────┐  ┌────────────┐  │
│  │  Recovery │  │  Today's   │  │  ← RecoveryScoreRing (left)
│  │    ⭕ 78   │  │  Workout   │  │  ← TodayWorkoutCard (right)
│  │  Train    │  │  Upper Push│  │
│  │  Normally │  │  [Start →] │  │
│  └───────────┘  └────────────┘  │
│                                  │
│  ┌───────────────────────────┐   │
│  │ Today's Calories           │  │  ← CalorieSnapshotCard
│  │ 1,240 / 2,400 kcal         │  │
│  │ ▓▓▓▓▓▓░░░░░░░░░░           │  │
│  │ P 88g  C 120g  F 32g       │  │
│  └───────────────────────────┘   │
│                                  │
│  [Bottom tab bar]                │
└─────────────────────────────────┘
```

**State requirements:**

- `useFirestoreDoc('users/{uid}')` — live subscription (Path A, `onSnapshot`) for `profile`, `stats`, `currentPlanId`.
- `useFirestoreDoc('users/{uid}/workoutPlans/{currentPlanId}')` — active plan, derives today's `dayLabel` entry client-side by matching current weekday against `weeklySchedule`. All hooks in `hooks/` are plain JavaScript — no generics, no interfaces; shape expectations for each collection are documented via JSDoc `@typedef` comments in `models/` purely as developer reference, not enforced at compile time.
- `useFirestoreDoc('users/{uid}/dailyLogs/{today}')` — today's log document; `recoveryLog.aiOutput`, `nutritionLog.aiEstimatedTotals`, and `workoutSession.completionStatus` all read from this single subscription.
- If `recoveryLog` is `null` for today → `RecoveryScoreRing` renders an empty/prompt state ("Log recovery →") instead of a score, linking to a recovery check-in modal.
- `AIMotivationBanner` content is **not** re-fetched on every dashboard mount — cached in `AsyncStorage` keyed by date string; only calls `/api/ai/chat` (with `contextType: 'motivation'`) once per calendar day, on first dashboard load of that day.

**User actions:**

- Tap `TodayWorkoutCard` → navigate to `workout/index.jsx`.
- Tap `RecoveryScoreRing` (if already logged) → navigate to a recovery detail modal showing `aiOutput.reasoning` and `suggestedActivities`.
- Tap `CalorieSnapshotCard` → navigate to `nutrition/index.jsx`.
- Swipe/dismiss `AIMotivationBanner` → hides for the session (not persisted).
- Pull-to-refresh → forces `getDocFromServer()` on the three subscriptions above to bypass cache (useful right after a Render cold-start recovers).

---

### 2.3 Workout Screen

**Route:** `app/(tabs)/workout/index.jsx`

**Layout:**

```
┌─────────────────────────────────┐
│  ← Upper Body Push      ⏱ 42:10 │  ← running session timer since startTime
├─────────────────────────────────┤
│ ┌─────────────────────────────┐ │
│ │ ▾ Barbell Bench Press        │ │  ← ExerciseCard (expanded)
│ │   4 sets · 8–12 reps · 90s   │ │
│ │   "Tuck elbows 45°, full ROM"│ │
│ │  ┌───┬────────┬────────┬──┐ │ │
│ │  │Set│ Reps   │ Weight │✓ │ │ │  ← SetRow x4 (header + 4 data rows)
│ │  ├───┼────────┼────────┼──┤ │ │
│ │  │ 1 │  [10]  │ [60kg] │☑ │ │ │
│ │  │ 2 │  [10]  │ [60kg] │☑ │ │ │
│ │  │ 3 │  [ 8 ]  │ [65kg] │☐ │ │ │
│ │  │ 4 │  [  ]  │ [    ] │☐ │ │ │
│ │  └───┴────────┴────────┴──┘ │ │
│ │  [🔄 Substitute]  [🎙 Log]   │ │  ← SubstituteSheet trigger, VoiceLogButton
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │ ▸ Incline Dumbbell Press      │ │  ← ExerciseCard (collapsed, next up)
│ └─────────────────────────────┘ │
│                                  │
│         [ Finish Workout ]       │
└─────────────────────────────────┘
```

**Component hierarchy:**

```
WorkoutScreen
 └─ SessionHeader (timer, exit-confirm)
 └─ FlatList<ExerciseCard>
     └─ ExerciseCard
         ├─ ExerciseHeader (name, sets×reps×rest, formCue, collapse toggle)
         ├─ SetRow[] (one per set, numeric inputs bound to local state)
         ├─ SubstituteSheet (bottom sheet, lazy-mounted on trigger)
         └─ VoiceLogButton
 └─ RestTimerModal (global overlay, triggered on any SetRow checkbox tick)
 └─ WorkoutSummaryModal (shown after "Finish Workout")
```

**State requirements:**

- `useActiveWorkoutStore` (Zustand, in-memory only, not Firestore-backed until finish) holds the entire in-progress `workoutSession` object: per-exercise, per-set `repsCompleted`, `weightKg`, `completed`, `isWarmupSet`. This is the **single source of truth** during the session — Firestore is not touched per-set to avoid write-quota churn and to keep set-logging instant even with poor gym Wi-Fi.
- `startTime` is captured client-side (`Date.now()`) the moment the screen mounts and the user has not yet finished; not written to Firestore until "Finish Workout".
- `RestTimerModal` reads `restSeconds` from the just-completed exercise's plan data and starts a countdown; runs via `useRestTimer` hook using `Date.now()` deltas (not `setInterval` alone) so backgrounding the app doesn't desync the timer.
- Ticking a `SetRow` checkbox is instant local state — no loading spinner, no network call.

**User actions & optimistic flow:**

1. User fills reps/weight, taps checkbox → `useActiveWorkoutStore` updates instantly, `RestTimerModal` auto-opens (dismissible).
2. Tap "🔄 Substitute" → opens `SubstituteSheet`, calls **Path B** `/api/ai/substitute-exercise` with `exerciseName`, `availableEquipment` (from cached profile), `reason` (free-text input in the sheet). On response, user picks one substitute → replaces the `ExerciseCard`'s displayed exercise **in local state only** for this session (does not mutate the underlying `workoutPlans` document).
3. Tap "🎙 Log" (`VoiceLogButton`) → `useVoiceCapture` records via Expo Speech/Whisper, transcript stored in `workoutSession.voiceLogTranscript` (local state), displayed as a chip under the exercise for user confirmation — not sent to any AI endpoint; it's a raw note field per Phase 1 schema.
4. "Finish Workout" → opens `WorkoutSummaryModal` (perceivedExertion slider, notes field) → on confirm, performs **one single Firestore write** (Path A): `users/{uid}/dailyLogs/{today}.set({ workoutSession: {...fullSessionFromStore} }, { merge: true })`, plus a batched increment of `stats.totalWorkoutsCompleted` and streak fields. This is the **optimistic UI update** described in §3.2 — the modal closes and the app navigates back to Home Dashboard immediately, before Firestore's write acknowledgment returns, using Firestore's built-in local-write optimism (see §3.3).

---

### 2.4 AI Coach Screen

**Route:** `app/(tabs)/coach/[conversationId].jsx`

**Layout:**

```
┌─────────────────────────────────┐
│  ← Coach            🗑 Archive  │
├─────────────────────────────────┤
│                                  │
│  ┌──────────────────────┐       │
│  │ Hey! Ready for today's│       │  ← ChatBubble (assistant, left-aligned)
│  │ Upper Push? 💪         │       │
│  └──────────────────────┘       │
│              ┌──────────────┐   │
│              │ my shoulder   │   │  ← ChatBubble (user, right-aligned)
│              │ feels off     │   │
│              └──────────────┘   │
│  ┌──────────────────────┐       │
│  │ Got it — let's ease up│       │
│  │ on overhead pressing  │       │
│  │ today. See a doctor if│       │
│  │ it persists 🩺         │       │
│  └──────────────────────┘       │
│  ● ● ●  (typing indicator)      │
│                                  │
├─────────────────────────────────┤
│ [Workout][Nutrition][Recovery]   │  ← ContextChipSelector (optional filter)
│ ┌───────────────────────────┐▸ │  ← ChatInputBar (text + send)
└─────────────────────────────────┘
```

**State requirements:**

- `useFirestoreCollection('users/{uid}/aiConversations/{conversationId}/messages', orderBy('timestamp', 'asc'), limitToLast(30))` — live subscription; only the last 30 messages are subscribed client-side for render performance, independent of the backend's separate "last 10 for Gemini context" window (Phase 2 §5.2) — these are two different windows for two different purposes and must not be conflated.
- Local `draftMessage` state for the input bar (not global — resets per screen mount).
- `isSending` boolean local state drives the `TypingIndicator` and disables the send button during the Path B round trip.
- `selectedContextType` local state (`ContextChipSelector`), defaults to `undefined` → sent as `contextType` in the request body (Phase 2 §5.4).

**User actions:**

1. Type message, tap send → `ChatInputBar` clears instantly, an **optimistic** `ChatBubble` for the user's message renders immediately in local state (not yet in Firestore) while `useCallBackend('/api/ai/chat', {...})` is in flight.
2. On success: backend has already written both the user message and assistant reply to Firestore (Phase 2 §5.5) — the `onSnapshot` listener receives both real documents; the optimistic local bubble is reconciled/removed once the real user-message document with a matching approximate timestamp arrives, and the assistant's `ChatBubble` renders from the live subscription with a brief fade-in.
3. On failure (any Phase 2 §7.6 error code): optimistic user bubble gets a small "⚠ failed to send — tap to retry" affordance instead of being removed; tapping it re-fires the same request body.
4. Tap "🗑 Archive" → sets `isArchived: true` on the conversation doc (Path A, direct write — no AI involved).

---

### 2.5 Nutrition Screen

**Route:** `app/(tabs)/nutrition/index.jsx`

**Layout:**

```
┌─────────────────────────────────┐
│  Nutrition          💧 1.8L      │  ← waterIntakeMl quick display
├─────────────────────────────────┤
│  Today: 1,240 / 2,400 kcal      │  ← DailyMacroSummaryBar
│  ▓▓▓▓▓▓░░░░░░░░░░                │
├─────────────────────────────────┤
│  [Breakfast][Lunch][Dinner]...  │  ← MealTypeSelector (segmented)
│ ┌───────────────────────────┐   │
│ │ "1 bowl rice, chicken      │   │  ← MealInputBar (multiline text)
│ │  curry, 1 banana"      🎙  │   │  ← voice trigger inline
│ └───────────────────────────┘   │
│        [ Estimate ]              │
│                                  │
│ ┌───────────────────────────┐   │
│ │ ⏳ Estimating...            │   │  ← MacroEstimatePreviewCard (loading state)
│ └───────────────────────────┘   │
│  — becomes —                     │
│ ┌───────────────────────────┐   │
│ │ 620 kcal · P 34g C 78g F14g│   │  ← MacroEstimatePreviewCard (result state)
│ │ • Rice (1 cup, ~180g) 240  │   │
│ │ • Chicken curry        280 │   │
│ │ • Banana                100│   │
│ │   [ Discard ]  [ Save ✓ ] │   │
│ └───────────────────────────┘   │
│                                  │
│ Logged today:                    │
│ ┌───────────────────────────┐   │
│ │ 🍳 Breakfast · 420 kcal    │   │  ← LoggedMealRow[] from meals array
│ └───────────────────────────┘   │
└─────────────────────────────────┘
```

**State requirements:**

- `useFirestoreDoc('users/{uid}/dailyLogs/{today}')` — same subscription pattern as Dashboard; `nutritionLog.meals` array drives `LoggedMealRow` list, `aiEstimatedTotals` drives the summary bar.
- Local `draftMealDescription`, `selectedMealType` — reset after each save.
- Local `estimatePreview` state machine: `idle → loading → result → (saved | discarded)`. The AI estimate is **never** written to Firestore automatically — it's a preview the user must explicitly confirm, per the Phase 2 §2.5 note that `aiEstimatedTotals` is app-computed and meal-level `aiEstimate` only persists on user save.

**User actions:**

1. Type or dictate meal description → tap "Estimate" → **Path B** call to `/api/ai/estimate-nutrition` with `mealDescription`, `mealType`. Card transitions to loading, then result.
2. Voice input (🎙 icon): `useVoiceCapture` transcribes speech-to-text directly into the `MealInputBar` text field (client-side transcription only — this reuses the same estimate flow, it does not skip straight to an AI nutrition call from audio).
3. Tap "Save ✓" → appends a new meal-object (with `aiEstimate` from the preview) to the `meals` array in `dailyLogs/{today}` (Path A, `arrayUnion`-style merge), then client-side recomputes `aiEstimatedTotals` by summing all `meals[].aiEstimate` and writes that alongside in the same batched update.
4. Tap "Discard" → clears preview, no write.

---

### 2.6 Meal Planner Screen

**Route:** `app/(tabs)/nutrition/planner.jsx`

**Layout:**

```
┌─────────────────────────────────┐
│  Weekly Meal Plan     ↻ Regen.  │  ← RegeneratePlanButton
├─────────────────────────────────┤
│  Monday                          │
│ ┌───────────────────────────┐   │
│ │ 🍳 Breakfast                │   │  ← WeekDayMealCard
│ │ Oats + banana + peanut butter│  │
│ │ [🔥 420][🥩 18g][🍞 55g][🧈12g]│  ← MacroBadge x4 (cal/protein/carb/fat)
│ └───────────────────────────┘   │
│ ┌───────────────────────────┐   │
│ │ 🍗 Lunch                    │   │
│ │ Grilled chicken, rice, salad│  │
│ │ [🔥 610][🥩 42g][🍞 60g][🧈15g]│
│ └───────────────────────────┘   │
│  ... (Tuesday–Sunday, scrollable)│
└─────────────────────────────────┘
```

**State requirements:**

- This screen's data source is **not** part of the Phase 1/2 schema as written — it requires a new sub-collection `users/{uid}/mealPlans/{planId}` (analogous structure to `workoutPlans`) and a corresponding Path B endpoint (e.g. `POST /api/ai/generate-meal-plan` using the already-reserved `TOKEN_LIMITS.MEAL_PLANNER` budget from Phase 1 §3E, which exists in the token table but has no endpoint yet — this screen is that endpoint's first consumer). Flagging this explicitly as a **Phase 4 backend addition**, not something this frontend spec silently assumes already exists.
- Until that endpoint exists, `RegeneratePlanButton` should render disabled with a "Coming soon" tooltip, or the screen ships behind a feature flag in `useUIStore`.
- Once available: `useFirestoreDoc('users/{uid}/mealPlans/{currentMealPlanId}')` live subscription, grouped client-side by `dayLabel` into 7 `WeekDayMealCard` sections.

**User actions:**

- Tap "↻ Regenerate" → Path B call → overwrite flow identical in spirit to workout plan regeneration (Phase 2 §1.5: old plan `isActive: false`, new plan written, `currentMealPlanId` updated).
- Tap a `WeekDayMealCard` → expands to show full macro breakdown and a "Log this meal" shortcut that deep-links into Nutrition Screen with `draftMealDescription` pre-filled from the card's meal description.

---

### 2.7 Progress Screen

**Route:** `app/(tabs)/progress/index.jsx`

**Layout:**

```
┌─────────────────────────────────┐
│  Progress      [1M][3M][6M][All]│  ← DateRangeToggle
├─────────────────────────────────┤
│  Body Weight                     │
│ ┌───────────────────────────┐   │
│ │      ╭─╮                   │   │  ← WeightProgressChart
│ │   ╭──╯  ╰──╮   ╭──╮        │   │     (line chart, tappable points
│ │ ──╯        ╰───╯  ╰──      │   │      show weightKg + date tooltip)
│ └───────────────────────────┘   │
│                                  │
│  Personal Records                │
│ ┌────────────┬────────┬───────┐ │
│ │ Exercise    │ Best   │ Date  │ │  ← PRTrackerTable
│ ├────────────┼────────┼───────┤ │
│ │ Bench Press │ 85 kg  │ 7/12  │ │
│ │ Squat       │ 110kg  │ 7/18  │ │
│ └────────────┴────────┴───────┘ │
│                                  │
│  Weekly Training Volume          │
│ ┌───────────────────────────┐   │
│ │ ▇▇  ▇▇▇  ▇  ▇▇▇▇  ▇▇  ▇  ▇  │  ← VolumeBarChart (sets/muscle group/week)
│ │ Chest Back Legs Shldr Arms │  │
│ └───────────────────────────┘   │
└─────────────────────────────────┘
```

**State requirements:**

- No single Firestore document holds this data pre-aggregated — this screen is the one place in the app that requires a **collection group query** across `dailyLogs`: `firestore().collectionGroup('dailyLogs').where('uid', '==', uid).where('date', '>=', rangeStart).orderBy('date')`. This is exactly why Phase 1's `dailyLogs` schema includes the redundant `uid` field on every document — it exists specifically to make this query possible without a composite `users/{uid}/dailyLogs` collection-group ambiguity.
- Client-side derivation from the fetched range of `dailyLogs` documents (not stored, computed on-device):
    - **Weight series** → `profile.weightKg` is a point-in-time field on the root user doc, not historical; so weight history instead requires a lightweight `weightKg` snapshot to be added into each day's `dailyLogs/{date}` document at recovery-check-in or workout-log time (a minor schema extension flagged here — currently Phase 1 has no daily weight field; recommend adding an optional `bodyWeightKg: number|null` field at the `dailyLogs/{date}` root level to support this chart without redesigning the schema).
    - **PR Tracker** → derived by scanning `workoutSession.exercises[].sets[]` across the fetched range, grouping by `exerciseId`/`name`, taking `max(weightKg where completed === true)`.
    - **Volume chart** → derived by summing `sets.length` per `primaryMuscleGroup` per ISO week (muscle group requires a join against the exercise's plan-time `primaryMuscleGroup`, denormalized onto the log entry at logging time — already covered since `workoutSession.exercises[].name` is denormalized per Phase 1; recommend also denormalizing `primaryMuscleGroup` onto the logged exercise object at save time in the Workout Screen's "Finish Workout" write, for exactly this reason).
- Given collection-group queries over 6 months of daily documents can be non-trivial in size, this screen fetches **once** (not a live `onSnapshot`) with a manual pull-to-refresh, and shows a `LoadingSpinner` covering all three charts during that fetch — not a per-chart optimistic pattern like other screens, since there is no "write" here at all, only a read-and-compute.

**User actions:**

- Toggle date range → re-fires the collection-group query with a new `rangeStart`, all three visualizations recompute from the new dataset.
- Tap a point on `WeightProgressChart` → tooltip showing exact `bodyWeightKg` and date.
- Tap a `PRTrackerTable` row → optional deep-link to that day's `dailyLogs/{date}` detail (out of scope for this spec, flagged as a nice-to-have).

---

## 3. State Management & Offline Strategy

### 3.1 Global UI State vs. Local Component State

GymBro uses **Zustand** for global state (lightweight, no boilerplate, works well with React Native) and reserves it strictly for state that must survive navigation or be shared across unrelated component trees. Everything else stays local (`useState`/`useReducer`).

|State|Scope|Why|
|---|---|---|
|Auth user (`uid`, `email`)|`useAuthStore` (global)|Needed by nearly every Firestore query and API call app-wide|
|Cached `profile` / `stats`|`useUserProfileStore` (global)|Read by Dashboard, Workout, Nutrition, Coach, Onboarding-summary — re-fetching per screen would be wasteful and would desync during a live session|
|In-progress workout session|`useActiveWorkoutStore` (global, session-scoped)|Must survive the user backgrounding the app mid-set or navigating to `SubstituteSheet` and back; cleared on "Finish Workout" or explicit exit|
|Onboarding draft profile|`useOnboardingDraftStore` (global, but reset after submit)|Spans 6 separate route screens; local state would be lost on each route push|
|Active modal/sheet/toast|`useUIStore` (global)|Any screen can trigger a global toast (e.g. an AI error from Phase 2 §7.6); centralizing avoids prop-drilling a toast dispatcher|
|Connectivity + pending-write count|`useConnectivityStore` (global)|Drives the app-wide `OfflineBanner` in the root layout, independent of any single screen|
|Chat draft message, meal draft description, form inputs, chart date-range toggle|Local `useState` per screen|Ephemeral, single-screen concerns; global state here would only add unnecessary re-render surface|

**Rule of thumb applied throughout:** if losing the state on unmount would break the user's task, it's global; if losing it on unmount is exactly what should happen (e.g. clearing a chat draft after navigating away), it's local.

### 3.2 Optimistic UI Updates for Instant Workout Logging

The Workout Screen (§2.3) is the single highest-frequency write surface in the app and the one most likely to be used on unreliable gym Wi-Fi, so it gets the most aggressive optimistic treatment:

1. **Per-set interactions never touch the network.** Every checkbox tick, rep count, and weight entry during a session updates only `useActiveWorkoutStore` (in-memory). This is not "optimistic" in the retry-and-reconcile sense — it's simply local-first by design, since there is no reason a mid-set checkbox tap should ever wait on a round trip.
2. **The single Firestore write happens once, at "Finish Workout".** This is where true optimistic-UI applies: the app navigates away and shows the workout as saved (`stats.totalWorkoutsCompleted` incremented, streak updated in the locally-cached `useUserProfileStore`) **before** Firestore's server acknowledgment returns, relying on the Firestore SDK's own local-cache-first write behavior (§3.3) rather than hand-rolled optimism.
3. **Rollback path:** if the write ultimately fails after exhausting Firestore's internal retry (e.g. the device goes fully offline for an extended period and the app is later force-quit before reconnecting), the write remains queued in Firestore's persistent local cache and flushes automatically on the next app launch with connectivity — GymBro does not need custom rollback logic here because Firestore's offline queue already guarantees eventual delivery; the only custom logic needed is the `useConnectivityStore` pending-write counter (§3.4) so the user can see "1 workout syncing" rather than assuming data loss.
4. **AI-touched writes (Path B) are the exception to optimism.** Substitute-exercise suggestions and any Coach reply genuinely require a server round trip before anything can render (there is no valid client-side guess for what Gemini will return), so these use the standard `loading → result | error` pattern (§2.4, §2.5) rather than optimistic rendering — the only thing that's optimistic there is the user's own outgoing chat bubble (§2.4, point 1), never the AI's response.

### 3.3 Firestore Offline Persistence Configuration

```javascript
// services/firebase.js
import { initializeApp } from 'firebase/app';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

const app = initializeApp(firebaseConfig);

// React Native has no multi-tab concept, but persistentMultipleTabManager
// is still the correct manager here — it's what enables the unlimited
// local cache size and long-term offline queueing; single-tab manager
// is a web-only optimization irrelevant on-device.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});
```

**Configuration rationale, specific to GymBro's gym-network use case:**

- **Unlimited cache size** (default with `persistentLocalCache`, no `cacheSizeBytes` cap set) — a full year of `dailyLogs` documents is small relative to typical device storage, and capping it risks evicting exactly the recent workout history the Progress Screen (§2.7) needs most.
- **Every screen's primary read is a live `onSnapshot` subscription, not a one-off `getDoc`** (Dashboard, Workout's plan lookup, Coach's messages, Nutrition's daily log) — this is what makes offline persistence actually useful: `onSnapshot` serves the last-cached snapshot instantly when offline, then transparently re-syncs when connectivity returns, with no code change needed in the listening component.
- **`metadata.fromCache` is surfaced, not hidden.** Every `useFirestoreDoc`/`useFirestoreCollection` hook exposes an `isFromCache` boolean alongside the data, which `OfflineBanner` (root layout, global) uses to show a persistent but unobtrusive "Offline — changes will sync when reconnected" strip, rather than letting the user believe stale data is live.
- **Writes made while offline queue automatically** (Firestore SDK default behavior with persistence enabled) — this is why the Workout Screen's "Finish Workout" write (§3.2) requires no custom offline queue of its own; the same guarantee extends to Nutrition's meal-save and Onboarding's final profile write, meaning **all Path A writes in the app are gym-network-safe by construction**.
- **Path B (AI/backend) calls are explicitly NOT covered by Firestore's offline queue** — `useCallBackend` must check `useConnectivityStore`'s online flag before attempting any Path B call, and short-circuit immediately to a clear "You're offline — AI features need a connection" state (distinct from the Phase 2 §7.6 error contract, since this is a client-detected pre-condition, not a backend error response) rather than letting `fetch()` hang and eventually time out.

### 3.4 Connectivity Store

```javascript
// store/useConnectivityStore.js (shape reference, not full implementation)
// Plain JS Zustand store — the object below just documents what state it holds:
{
  isOnline: true,          // boolean, from @react-native-community/netinfo
  pendingWriteCount: 0,    // number, derived from Firestore's waitForPendingWrites()
                           // status, polled/observed to drive "N syncing" UI
}
```

This store backs the single global `OfflineBanner` in `app/_layout.jsx`, so no individual screen needs its own offline-handling logic beyond checking `isOnline` before initiating a Path B call — Path A reads/writes remain fully functional offline by Firestore's own design (§3.3) and need no gating at all.

---

## Summary Reference Card — Phase 3 Additions

|Screen|Route|Primary Data Path|Live Subscription?|
|---|---|---|---|
|Onboarding|`(onboarding)/*`|Path A (single write on submit) + Path B (auto plan-gen)|No|
|Home Dashboard|`(tabs)/index`|Path A (3x `onSnapshot`) + Path B (1x/day motivation)|Yes|
|Workout|`(tabs)/workout/index`|Local state → Path A (1x write on finish); Path B for substitutes|Yes (plan only)|
|AI Coach|`(tabs)/coach/[id]`|Path B (chat) + Path A (message subscription)|Yes|
|Nutrition|`(tabs)/nutrition/index`|Path B (estimate) + Path A (save)|Yes|
|Meal Planner|`(tabs)/nutrition/planner`|Path B (generate) — **requires new Phase 4 endpoint**|Yes (once built)|
|Progress|`(tabs)/progress/index`|Path A (one-shot collection-group query)|No (manual refresh)|

|Global Store|Persists Across Nav?|Backed By|
|---|---|---|
|`useAuthStore`|Yes|Firebase Auth listener|
|`useUserProfileStore`|Yes|`onSnapshot('users/{uid}')`|
|`useActiveWorkoutStore`|Session only|In-memory, cleared on finish/exit|
|`useOnboardingDraftStore`|Onboarding only|In-memory, cleared on submit|
|`useUIStore`|Yes|In-memory|
|`useConnectivityStore`|Yes|NetInfo + Firestore pending-write state|

| Schema Gaps Flagged for Phase 4                              | Reason                                                                           |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `users/{uid}/mealPlans/{planId}` collection                  | Needed by Meal Planner screen; mirrors `workoutPlans` structure                  |
| `POST /api/ai/generate-meal-plan` endpoint                   | `TOKEN_LIMITS.MEAL_PLANNER` already reserved in Phase 1 §3E but unused until now |
| `dailyLogs/{date}.bodyWeightKg` (optional field)             | Needed for Progress Screen's weight chart; not in current Phase 1 schema         |
| Denormalized `primaryMuscleGroup` on logged exercise objects | Needed for Progress Screen's volume chart without a plan-document join           |