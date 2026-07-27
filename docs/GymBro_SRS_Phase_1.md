# GymBro — Phase 1 SRS

## System Architecture & Database Schema Blueprint

> **Stack Lock:** React Native (Expo) · Node.js + Express (Render) · Firebase Firestore + Auth · Gemini 2.5 Flash-Lite · Expo Speech / Whisper API

---

## 1. Data Flow Diagram

There are exactly **two data paths** in GymBro. Every user action belongs to one of them. Understanding this distinction is the single most important architectural decision in the whole app.

### Rule of thumb

|If the action needs…|Use|
|---|---|
|Reading or writing user data (logs, profile, history)|**Path A — Direct Firestore**|
|Intelligence, reasoning, or AI generation|**Path B — Node.js Backend → Gemini**|

---

### Path A — Direct Firestore Operations (No Backend Involved)

**Used for:** User profile read/write, logging a completed workout, logging meals after AI estimation is done, submitting recovery check-in inputs, reading chat history, updating stats/streaks.

```
┌──────────────────────────────────────────────────────────────────────┐
│                        REACT NATIVE APP                              │
│                                                                      │
│  User taps "Save Workout"                                            │
│         │                                                            │
│         ▼                                                            │
│  firebase.auth().currentUser.getIdToken()                            │
│  ── Returns a short-lived Firebase ID Token ──────────────────────── │
│         │                                                            │
│         ▼                                                            │
│  Firestore JS SDK call                                               │
│  firestore()                                                         │
│    .collection('users').doc(uid)                                     │
│    .collection('dailyLogs').doc('2025-11-14')                        │
│    .set({ workoutSession: { ... } }, { merge: true })                │
│         │                                                            │
│         ▼                                                            │
└─────────│────────────────────────────────────────────────────────────┘
          │  SDK sends request with embedded Firebase Auth credentials
          ▼
┌─────────────────────────────┐
│     FIREBASE (Google Cloud) │
│                             │
│  1. Firestore Security      │
│     Rules engine checks:    │
│     request.auth.uid == uid │
│                             │
│  2. ✅ ALLOW → Write stored │
│     ❌ DENY  → 403 returned │
│                             │
│  3. Confirmation sent back  │
└─────────────────────────────┘
          │
          ▼
   React Native App
   updates UI state
   (e.g., "Workout saved ✓")
```

---

### Path B — AI-Powered Operations (Via Node.js Backend)

**Used for:** Generating a workout plan, chatbot message, nutrition macro estimation from food description, recovery score computation, exercise substitution suggestions.

> **Why a backend?** Your Gemini API key must never be in the mobile app bundle. Anyone can decompile an APK and extract hardcoded keys. The Node.js server is the only place the key lives.

```
┌──────────────────────────────────────────────────────────────────────┐
│                        REACT NATIVE APP                              │
│                                                                      │
│  User sends chat message: "Generate me a 4-day plan"                │
│         │                                                            │
│         ▼                                                            │
│  firebase.auth().currentUser.getIdToken(/* forceRefresh */ true)     │
│  ── Returns fresh Firebase ID Token (JWT, expires in 1 hour) ─────  │
│         │                                                            │
│         ▼                                                            │
│  fetch('https://gymbro-api.onrender.com/api/ai/generate-plan', {    │
│    method: 'POST',                                                   │
│    headers: {                                                        │
│      'Authorization': `Bearer ${idToken}`,   ← Token travels here   │
│      'Content-Type': 'application/json',                            │
│    },                                                                │
│    body: JSON.stringify({ userProfile, weekPreference })             │
│  })                                                                  │
│         │                                                            │
│  [Show loading spinner — no streaming]                               │
└─────────│────────────────────────────────────────────────────────────┘
          │
          ▼
┌──────────────────────────────────────────────────────────────────────┐
│                  NODE.JS + EXPRESS BACKEND (Render)                  │
│                                                                      │
│  POST /api/ai/generate-plan                                          │
│         │                                                            │
│         ▼                                                            │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │              verifyToken Middleware                          │     │
│  │                                                             │     │
│  │  1. Extract token from Authorization header                 │     │
│  │  2. admin.auth().verifyIdToken(token)                       │     │
│  │     → Calls Firebase Auth servers                           │     │
│  │     → Returns decoded { uid, email, name }                  │     │
│  │  3. Attach to req.user = { uid, email }                     │     │
│  │  4. Call next() → proceed to controller                     │     │
│  │                                                             │     │
│  │  On failure → return 401 / 403 immediately                  │     │
│  └─────────────────────────────────────────────────────────────┘     │
│         │                                                            │
│         ▼                                                            │
│  AI Controller (aiController.js)                                     │
│                                                                      │
│  1. Build structured prompt using req.user.uid + req.body            │
│  2. Inject user's full profile + history as context                  │
│  3. Set responseMimeType: 'application/json' in payload              │
│         │                                                            │
│         ▼                                                            │
│  HTTP POST → Gemini API                                              │
│  https://generativelanguage.googleapis.com/                          │
│    v1beta/models/gemini-2.5-flash-lite:generateContent                │
│    ?key=GEMINI_API_KEY           ← Key stored in .env only           │
│         │                                                            │
│         ▼                                                            │
│  Parse JSON from response.candidates[0].content.parts[0].text       │
│  Return HTTP 200 { success: true, data: { workoutPlan: {...} } }     │
└─────────│────────────────────────────────────────────────────────────┘
          │
          ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        REACT NATIVE APP                              │
│                                                                      │
│  1. Receives parsed plan JSON                                         │
│  2. Writes plan to Firestore via SDK (Path A write):                 │
│     users/{uid}/workoutPlans/{planId}.set(planData)                  │
│  3. Updates users/{uid}.currentPlanId = planId                       │
│  4. Hides spinner → renders plan in UI                               │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. Firestore Collections Schema

### Design principles applied

- Everything lives under `users/{uid}/` as sub-collections — security rules become trivial
- `dailyLogs` uses the date string `'YYYY-MM-DD'` as the document ID — one document per day per user, O(1) lookup
- `aiConversations/messages` is a **sub-collection** (not an array) — prevents the 1MB document limit from ever being hit regardless of conversation length
- All timestamps use Firestore `Timestamp` type — never store dates as raw strings except where used as a document ID key

---

### Collection: `users/{uid}`

This is the **root document** for every GymBro user. One document per user. Kept lean — only profile and aggregate stats live here.

```
Document path: users/{uid}

Field                             Type          Notes
─────────────────────────────────────────────────────────────────────
uid                               string        Same as document ID. Redundant but useful in queries.
displayName                       string        From Firebase Auth / Google Sign-In
email                             string        From Firebase Auth
photoURL                          string|null   Google profile photo URL
createdAt                         timestamp     Set once on first sign-in
updatedAt                         timestamp     Updated on any profile edit
onboardingComplete                boolean       false until user finishes onboarding flow
currentPlanId                     string|null   Document ID of active plan in workoutPlans sub-collection

profile (map)
  ├── age                         number        Integer, e.g. 21
  ├── gender                      string        'male' | 'female' | 'other' | 'prefer_not_to_say'
  ├── heightCm                    number        e.g. 175
  ├── weightKg                    number        e.g. 72.5
  ├── targetWeightKg              number|null   Optional goal weight
  ├── fitnessGoal                 string        'fat_loss' | 'muscle_gain' | 'maintenance' | 'endurance'
  ├── experienceLevel             string        'beginner' | 'intermediate' | 'advanced'
  ├── availableEquipment          array<string> ['barbell', 'dumbbells', 'cables', 'machines',
  │                                              'resistance_bands', 'pull_up_bar', 'bodyweight_only']
  ├── dietaryPreference           string        'none' | 'vegetarian' | 'vegan' | 'halal' | 'keto'
  ├── workoutDaysPerWeek          number        Integer 2–6
  ├── preferredDurationMinutes    number        30 | 45 | 60 | 90
  └── medicalNotes                string|null   Free text, e.g. "bad knees, avoid deep squats"

stats (map)
  ├── totalWorkoutsCompleted      number        Incremented on each logged workout session
  ├── currentStreakDays            number        Reset to 0 if a scheduled workout day is missed
  ├── longestStreakDays            number        All-time high
  └── lastWorkoutDate             string|null   'YYYY-MM-DD' of last completed session
```

---

### Sub-Collection: `users/{uid}/workoutPlans/{planId}`

Stores AI-generated workout plans. A user can have multiple plans (history), but only one is `isActive: true` at a time. When a new plan is generated, the old one is set to `isActive: false`.

```
Document path: users/{uid}/workoutPlans/{planId}
Document ID:   Auto-generated by Firestore (firestore().collection(...).doc())

Field                             Type          Notes
─────────────────────────────────────────────────────────────────────
planId                            string        Same as document ID
createdAt                         timestamp
generatedByModel                  string        'gemini-2.5-flash-lite' | 'openrouter/llama-3'
planName                          string        e.g. "4-Day Upper/Lower Split"
isActive                          boolean       Only one plan should be true at a time
durationWeeks                     number        How many weeks this plan is designed for

weeklySchedule                    array<map>    Array of 7 day-objects (one per day of week)
  Each day-object:
  ├── dayLabel                    string        'Monday' | 'Tuesday' | ... | 'Sunday'
  ├── isRestDay                   boolean       If true, exercises array is empty
  ├── sessionName                 string        'Upper Body Push' | 'Rest & Recovery' | etc.
  ├── targetMuscleGroups          array<string> ['chest', 'triceps', 'shoulders']
  ├── estimatedDurationMinutes    number        e.g. 55
  └── exercises                   array<map>
        Each exercise-object:
        ├── exerciseId            string        Unique within plan, e.g. 'ex_001'. Used for logging.
        ├── name                  string        'Barbell Bench Press'
        ├── category              string        'compound' | 'isolation' | 'cardio' | 'mobility'
        ├── primaryMuscleGroup    string        'chest'
        ├── sets                  number        e.g. 4
        ├── repsRange             string        '8-12' | '5' | 'AMRAP' | '30s'
        ├── restSeconds           number        e.g. 90
        ├── formCue               string        Brief tip: "Tuck elbows 45°, full ROM"
        └── substituteExercises   array<string> ['Dumbbell Bench Press', 'Push-Up', 'Cable Fly']

aiGenerationContext               map           Snapshot of inputs used — useful for re-generating
  ├── profileSnapshot             map           Copy of profile map at time of generation
  └── customInstructions          string|null   Any extra instructions user gave ("no leg press")
```

---

### Sub-Collection: `users/{uid}/dailyLogs/{date}`

**The most important collection in the app.** One document per calendar day per user. Document ID is the date string `'YYYY-MM-DD'` — this makes lookups trivial and ensures no duplicates.

All three logs (workout, nutrition, recovery) live in the same daily document for that day. Any section can be `null` if not logged.

```
Document path: users/{uid}/dailyLogs/{date}
Document ID:   Date string, e.g. '2025-11-14'

Field                             Type          Notes
─────────────────────────────────────────────────────────────────────
date                              string        'YYYY-MM-DD' — same as document ID
uid                               string        Redundant copy — useful for Collection Group queries
createdAt                         timestamp     First time any section of this log was written
updatedAt                         timestamp     Updated on every subsequent write

─── WORKOUT SESSION ──────────────────────────────────────────────────

workoutSession                    map|null      null if no workout logged today
  ├── planId                      string|null   null if it was a spontaneous/unplanned workout
  ├── sessionName                 string        'Upper Body Push'
  ├── startTime                   timestamp
  ├── endTime                     timestamp|null  null if user forgot to stop timer
  ├── durationMinutes             number|null
  ├── perceivedExertion           number        1–10 RPE scale (user self-rates)
  ├── completionStatus            string        'completed' | 'partial' | 'skipped'
  ├── notes                       string|null   Free text post-workout note
  ├── voiceLogTranscript          string|null   Raw Whisper/Expo Speech transcript if voice was used
  └── exercises                   array<map>
        Each exercise-log-object:
        ├── exerciseId            string        Matches exerciseId from the plan
        ├── name                  string        Denormalized for easy display without plan lookup
        └── sets                  array<map>
              Each set-object:
              ├── setNumber       number        1, 2, 3...
              ├── repsCompleted   number
              ├── weightKg        number        0 for bodyweight exercises
              ├── isWarmupSet     boolean
              └── completed       boolean       false if set was skipped

─── NUTRITION LOG ────────────────────────────────────────────────────

nutritionLog                      map|null      null if no meals logged today
  ├── waterIntakeMl               number|null   Optional hydration tracking
  ├── aiEstimatedTotals           map           Summed across all meals by the app (not AI)
  │     ├── calories              number
  │     ├── proteinG              number
  │     ├── carbsG                number
  │     ├── fatsG                 number
  │     └── fiberG                number
  └── meals                       array<map>
        Each meal-object:
        ├── mealType              string        'breakfast' | 'lunch' | 'dinner' |
        │                                       'snack' | 'pre_workout' | 'post_workout'
        ├── userDescription       string        Raw input: "1 cup rice, chicken curry, 1 banana"
        ├── loggedAt              timestamp
        └── aiEstimate            map           Populated after backend AI call
              ├── calories        number
              ├── proteinG        number
              ├── carbsG          number
              ├── fatsG           number
              └── itemBreakdown   array<map>    AI-parsed line items
                    Each item:
                    ├── item      string        'Rice (1 cup cooked, ~180g)'
                    └── calories  number        206

─── RECOVERY LOG ─────────────────────────────────────────────────────

recoveryLog                       map|null      null if no recovery check-in done today
  ├── loggedAt                    timestamp
  ├── inputs                      map           User-provided slider values
  │     ├── sleepHours            number        0.0–12.0 (support half hours)
  │     ├── sleepQuality          number        1–5 integer
  │     ├── muscleSoreness        number        1–5 (1=none, 5=can barely move)
  │     ├── energyLevel           number        1–5
  │     ├── stressLevel           number        1–5
  │     └── moodRating            number        1–5
  └── aiOutput                    map           Populated after backend AI call
        ├── recoveryScore         number        0–100 composite score
        ├── recommendation        string        'full_rest' | 'light_activity' |
        │                                       'train_normally' | 'train_hard'
        ├── reasoning             string        AI's natural language explanation (2–3 sentences)
        └── suggestedActivities   array<string> ['30-min walk', 'foam rolling', 'yoga']
```

---

### Sub-Collection: `users/{uid}/aiConversations/{conversationId}`

### Sub-Sub-Collection: `users/{uid}/aiConversations/{conversationId}/messages/{messageId}`

Conversations are split into two levels to avoid the 1MB document limit. A conversation with 500 messages would never fit in a single document — the messages sub-collection has no size ceiling.

```
Document path: users/{uid}/aiConversations/{conversationId}
Document ID:   Auto-generated

Field                             Type          Notes
─────────────────────────────────────────────────────────────────────
conversationId                    string        Same as document ID
createdAt                         timestamp
updatedAt                         timestamp     Updated on every new message (for sorting in history)
title                             string        Auto-set from first user message, max 60 chars
contextType                       string        'general' | 'workout_advice' | 'nutrition' |
                                                'recovery' | 'motivation'
messageCount                      number        Increment on each new message — cheap counter for UI
lastMessagePreview                string        Last message content truncated to 100 chars
isArchived                        boolean       User can archive old conversations

─── MESSAGES SUB-COLLECTION ──────────────────────────────────────────

Document path: users/{uid}/aiConversations/{conversationId}/messages/{messageId}
Document ID:   Auto-generated (Firestore orders by creation time for free)

Field                             Type          Notes
─────────────────────────────────────────────────────────────────────
messageId                         string        Same as document ID
role                              string        'user' | 'assistant'
content                           string        Full message text. No size limit at document level.
timestamp                         timestamp     Used for ordering messages in the chat UI
```

> **Note on chat history for Gemini context:** When a user sends a new message, your backend fetches the last N messages (e.g., last 10) from the messages sub-collection ordered by `timestamp desc`, reverses them, and sends them as a conversation history array to Gemini. You do **not** send the entire conversation history — this controls token cost.

---

## 3. Node.js Middleware & Security Rules

### 3A. Project Folder Structure (Backend)

```
gymbro-backend/
├── .env                          ← NEVER commit this file
├── .gitignore                    ← Must include .env and serviceAccountKey.json
├── index.js                      ← Express app entry point
├── config/
│   └── firebase.js               ← Firebase Admin SDK initialization
├── middleware/
│   └── verifyToken.js            ← Token verification middleware
├── controllers/
│   └── aiController.js           ← All AI feature handlers
├── services/
│   └── geminiService.js          ← Reusable Gemini API call wrapper
├── routes/
│   └── ai.js                     ← All /api/ai/* routes
└── package.json
```

---

### 3B. Environment Variables (`.env`)

```bash
# .env — backend root

PORT=3000

# Firebase Admin SDK (Service Account)
# Get from Firebase Console → Project Settings → Service Accounts → Generate new private key
FIREBASE_PROJECT_ID=gymbro-xxxxx
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxx@gymbro-xxxxx.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----\n"
# NOTE: The \n characters in the private key MUST be preserved as literal \n in .env
# The config/firebase.js file handles the .replace(/\\n/g, '\n') conversion

# AI APIs
GEMINI_API_KEY=AIzaSy...
OPENROUTER_API_KEY=sk-or-...    # Optional fallback
```

---

### 3C. Firebase Admin SDK Initialization (`config/firebase.js`)

```javascript
// config/firebase.js
const admin = require('firebase-admin');

// Guard: only initialize once (important on hot-reload in development)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // The private key in .env stores \n as a literal string — convert it back
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

module.exports = admin;
```

---

### 3D. Token Verification Middleware (`middleware/verifyToken.js`)

This is the **security backbone** of the entire backend. Every AI route is wrapped with this middleware. It ensures that no unauthenticated or spoofed request ever reaches your Gemini API key.

```javascript
// middleware/verifyToken.js
const admin = require('../config/firebase');

const verifyToken = async (req, res, next) => {
  // 1. Extract the Authorization header
  const authHeader = req.headers['authorization'];

  // 2. Header must exist and follow the 'Bearer <token>' format
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'MISSING_TOKEN',
      message: 'Authorization header is missing or malformed. Expected: Bearer <idToken>',
    });
  }

  // 3. Isolate the token string
  const idToken = authHeader.split('Bearer ')[1].trim();

  try {
    // 4. Verify the token against Firebase Auth servers
    //    This call also checks: token not expired, not revoked, signature valid
    const decodedToken = await admin.auth().verifyIdToken(idToken);

    // 5. Attach useful identity info to req.user for downstream controllers
    req.user = {
      uid: decodedToken.uid,           // The user's Firebase UID — use this as Firestore key
      email: decodedToken.email,
      name: decodedToken.name || null,
    };

    // 6. All checks passed — proceed to the controller
    next();

  } catch (error) {
    // Handle specific Firebase Auth error codes
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

    // Catch-all for invalid tokens (wrong project, tampered, malformed)
    return res.status(403).json({
      success: false,
      error: 'INVALID_TOKEN',
      message: 'Token verification failed. Access denied.',
    });
  }
};

module.exports = verifyToken;
```

---

### 3E. Gemini API Service Wrapper (`services/geminiService.js`)

A single reusable function for all Gemini calls. Forces JSON output via `responseMimeType`.

```javascript
// services/geminiService.js
const axios = require('axios');

// NOTE: Gemini 2.0 Flash and Flash-Lite were fully shut down by Google on
// June 1, 2026 — API calls to those model IDs now fail outright. GymBro uses
// gemini-2.5-flash-lite instead: same free-tier cost profile, no publicly
// announced shutdown date (unlike gemini-2.5-flash, which is already
// scheduled to retire October 16, 2026). Keep the model ID isolated in this
// one constant so a future forced migration is a one-line change, not a
// project-wide find-and-replace.
const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';

/**
 * Per-feature token budgets. Always pass one of these constants as the
 * third argument to callGemini() — never a raw number.
 *
 * Rationale for each ceiling:
 *   CHAT             — conversational replies, 1–3 paragraphs, well under 600 tokens in practice
 *   SUBSTITUTE       — compact JSON: 2–3 alternatives with name, sets, reps, notes
 *   RECOVERY         — compact JSON: score (number) + recommendation + reasoning + activity list
 *   PLAN_RESTRUCTURE — full weeklySchedule array (7 days × ~6 exercises); easily exceeds 1500
 *   MEAL_PLANNER     — 7 days × 4 meals × per-meal macros; largest payload in the app
 *
 * Undershooting PLAN_RESTRUCTURE or MEAL_PLANNER will silently truncate the
 * JSON mid-structure, causing JSON.parse() to throw and the controller to 500.
 */
const TOKEN_LIMITS = {
  CHAT:             1200,
  SUBSTITUTE:       1000,
  RECOVERY:         1000,
  PLAN_RESTRUCTURE: 2500,
  MEAL_PLANNER:     4500,
};

/**
 * Calls the Gemini 2.5 Flash-Lite API.
 *
 * @param {string} systemPrompt - Instructions defining AI behavior and output format
 * @param {string} userPrompt   - The actual user request with injected context
 * @param {number} maxTokens    - Max output tokens — pass a TOKEN_LIMITS constant, not a raw number
 * @returns {Object}            - Parsed JSON object from Gemini's response
 */
const callGemini = async (systemPrompt, userPrompt, maxTokens = TOKEN_LIMITS.CHAT) => {
  const payload = {
    system_instruction: {
      parts: [{ text: systemPrompt }],
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: userPrompt }],
      },
    ],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: maxTokens,
      responseMimeType: 'application/json', // Force structured JSON output — no markdown fences
    },
  };

  const response = await axios.post(
    `${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`,
    payload,
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000, // 30 second timeout — important for Render's cold starts
    }
  );

  const rawText = response.data.candidates[0].content.parts[0].text;

  // Even with responseMimeType: 'application/json', defensively parse
  try {
    return JSON.parse(rawText);
  } catch (e) {
    // Strip markdown fences as a fallback
    const cleaned = rawText.replace(/```json\n?|```\n?/g, '').trim();
    return JSON.parse(cleaned);
  }
};

module.exports = { callGemini, TOKEN_LIMITS };
```

---

### 3F. AI Routes (`routes/ai.js`)

All routes are protected. `verifyToken` runs before every controller.

```javascript
// routes/ai.js
const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const aiController = require('../controllers/aiController');

// POST /api/ai/generate-plan
// Body: { weekPreference, customInstructions }
// Reads user profile from Firestore internally using req.user.uid
router.post('/generate-plan', verifyToken, aiController.generateWorkoutPlan);

// POST /api/ai/chat
// Body: { conversationId, message, contextType }
// Backend fetches last 10 messages from Firestore to build conversation history
router.post('/chat', verifyToken, aiController.chat);

// POST /api/ai/estimate-nutrition
// Body: { mealDescription, mealType }
// Returns { calories, proteinG, carbsG, fatsG, fiberG, itemBreakdown[] }
router.post('/estimate-nutrition', verifyToken, aiController.estimateNutrition);

// POST /api/ai/recovery-score
// Body: { sleepHours, sleepQuality, muscleSoreness, energyLevel, stressLevel, moodRating }
// Returns { recoveryScore, recommendation, reasoning, suggestedActivities[] }
router.post('/recovery-score', verifyToken, aiController.computeRecoveryScore);

// POST /api/ai/substitute-exercise
// Body: { exerciseName, reason, availableEquipment[] }
// Returns { substitutes: [{ name, sets, repsRange, notes }] }
router.post('/substitute-exercise', verifyToken, aiController.substituteExercise);

module.exports = router;
```

---

### 3G. Express Entry Point (`index.js`)

```javascript
// index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const aiRoutes = require('./routes/ai');

const app = express();

// Middleware
app.use(cors({
  origin: '*', // Tighten this in production to your app's domain if using a web build
}));
app.use(express.json({ limit: '10kb' })); // Limit body size to prevent abuse

// Health check (unauthenticated — used by Render to confirm the server is alive)
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

// AI Routes (all protected by verifyToken middleware inside the router)
app.use('/api/ai', aiRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`GymBro API running on port ${PORT}`));
```

---

### 3H. Firestore Security Rules

Deploy these in the Firebase Console → Firestore → Rules tab. They enforce that every user can only read and write their own data — no cross-user access is possible, even if someone figures out another user's UID.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // ── USERS ROOT DOCUMENT ──────────────────────────────────────────────
    match /users/{uid} {

      // A user may only read or write their own document
      allow read, delete: if request.auth != null && request.auth.uid == uid;

      // On create: ensure the uid field in the document matches the authenticated user
      allow create: if request.auth != null
                    && request.auth.uid == uid
                    && request.resource.data.uid == uid;

      // On update: prevent the uid field from ever being changed
      allow update: if request.auth != null
                    && request.auth.uid == uid
                    && request.resource.data.uid == uid;

      // ── WORKOUT PLANS ─────────────────────────────────────────────────
      match /workoutPlans/{planId} {
        allow read, create, update, delete: if request.auth != null
                                            && request.auth.uid == uid;
      }

      // ── DAILY LOGS ────────────────────────────────────────────────────
      match /dailyLogs/{date} {
        allow read, create, update, delete: if request.auth != null
                                            && request.auth.uid == uid;
      }

      // ── AI CONVERSATIONS ──────────────────────────────────────────────
      match /aiConversations/{conversationId} {
        allow read, create, update, delete: if request.auth != null
                                            && request.auth.uid == uid;

        // ── MESSAGES (SUB-COLLECTION) ──────────────────────────────────
        match /messages/{messageId} {

          // Allow read for the conversation owner
          allow read: if request.auth != null && request.auth.uid == uid;

          // Allow create with data validation:
          //   - role must be 'user' or 'assistant'
          //   - content must be a non-empty string under 10,000 characters
          //   - timestamp must be present
          allow create: if request.auth != null
                        && request.auth.uid == uid
                        && request.resource.data.role in ['user', 'assistant']
                        && request.resource.data.content is string
                        && request.resource.data.content.size() > 0
                        && request.resource.data.content.size() <= 10000;

          // Messages are immutable — no edits or deletes after creation
          allow update, delete: if false;
        }
      }
    }
  }
}
```

---

### 3I. How to Send the Token from React Native (Frontend Reference)

```javascript
// utils/apiClient.js — reusable helper for all backend AI calls

import auth from '@react-native-firebase/auth';

const BASE_URL = 'https://gymbro-api.onrender.com';

export const callBackend = async (endpoint, body) => {
  // Always get a fresh token — it auto-refreshes if near expiry
  const idToken = await auth().currentUser.getIdToken(/* forceRefresh */ false);

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Backend request failed');
  }

  return response.json();
};

// Usage in any screen component:
// const result = await callBackend('/api/ai/estimate-nutrition', {
//   mealDescription: 'rice, dal, one egg',
//   mealType: 'lunch',
// });
```

---

## Summary Reference Card

|Layer|Technology|Purpose|
|---|---|---|
|Mobile App|React Native (Expo)|UI, Firestore SDK calls, token management|
|Auth Token|Firebase ID Token (JWT)|Passed as `Bearer` header to backend|
|Backend|Node.js + Express on Render|AI orchestration, API key protection|
|Token Verification|Firebase Admin SDK|`verifyIdToken()` in middleware|
|AI Engine|Google Gemini 2.5 Flash-Lite|Plan generation, chat, nutrition, recovery|
|Database|Firebase Firestore|All user data in `users/{uid}/` sub-collections|
|Security|Firestore Security Rules|Enforces per-user data isolation|

|Firestore Path|Document ID|Contains|
|---|---|---|
|`users/{uid}`|Firebase UID|Profile, stats, currentPlanId|
|`users/{uid}/workoutPlans/{planId}`|Auto-generated|Full weekly schedule with exercises|
|`users/{uid}/dailyLogs/{date}`|`'YYYY-MM-DD'`|Workout session + nutrition + recovery|
|`users/{uid}/aiConversations/{id}`|Auto-generated|Conversation metadata|
|`users/{uid}/aiConversations/{id}/messages/{id}`|Auto-generated|Individual chat messages|

|Backend Route|Auth|Purpose|
|---|---|---|
|`GET /health`|❌ Public|Server liveness check|
|`POST /api/ai/generate-plan`|✅ verifyToken|Generate personalized workout plan|
|`POST /api/ai/chat`|✅ verifyToken|AI coach conversation turn|
|`POST /api/ai/estimate-nutrition`|✅ verifyToken|Macro estimation from meal description|
|`POST /api/ai/recovery-score`|✅ verifyToken|Compute recovery score + recommendation|
|`POST /api/ai/substitute-exercise`|✅ verifyToken|Suggest exercise alternatives|