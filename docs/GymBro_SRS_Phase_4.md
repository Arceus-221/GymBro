# GymBro — Phase 4 SRS

## Backend Controller Implementation & Audio Pipeline Specs

> **Continuity Note:** This document extends `GymBro_SRS_Phase_1.md` (schema, security, `callGemini`), `GymBro_SRS_Phase_2.md` (system prompts, `callGeminiResilient`, error contract), and `GymBro_SRS_Phase_3.md` (frontend consumption patterns). Every controller below is the concrete implementation behind the routes declared in Phase 1 §3F, using the resilience wrapper from Phase 2 §7.2/7.3 and the prompts from Phase 2 §1–5.

---

## 0. Controller File Conventions

|Convention|Rule|
|---|---|
|Location|All handlers live in `controllers/aiController.js`, one `exports.<name>` per route. Prompt builders (`buildXUserPrompt`) and system prompt constants live in `prompts/` and are imported, not inlined, to keep the controller file readable.|
|Validation-first|Every controller validates `req.body` with a Zod schema (§3) **before** touching Firestore or Gemini. Validation failures short-circuit with `400` and never reach `callGeminiResilient`.|
|Firestore reads before Gemini calls|Any controller that needs server-side context (profile, history) fetches it from Firestore first, then builds the prompt. Never trust client-supplied profile/history for fields that exist in Firestore.|
|Single resilience entry point|Every Gemini call goes through `callGeminiResilient` (Phase 2 §7.2). No controller calls `callGemini` directly.|
|Response shape|Every success response is `{ success: true, data: {...} }`. Every failure is the standardized contract from Phase 2 §7.6.|

---

## 1. Controller: `generateWorkoutPlan`

### 1.1 Responsibilities (in order)

1. Validate `req.body` shape (`weekPreference?`, `customInstructions?`) via Zod.
2. Fetch `users/{uid}` document server-side — **never** accept a client-supplied profile for this endpoint (Phase 2 §1.2 already states this; the controller is where it's enforced).
3. Reject with `409 ONBOARDING_INCOMPLETE` if `onboardingComplete !== true` — there's no valid profile to generate a plan from.
4. Build the prompt (Phase 2 §1.4), call Gemini through the resilience wrapper with `validateShape` checking `weeklySchedule.length === 7` and non-rest-day count.
5. Re-number `exerciseId` server-side regardless of what Gemini returned (Phase 2 §1.5 step 4).
6. Batch-write: new plan doc + `isActive: false` on the previously active plan + `currentPlanId` update on the user doc — all three in a single `db.batch()` so a partial failure never leaves two active plans.

### 1.2 Implementation

```javascript
// controllers/aiController.js (excerpt — generateWorkoutPlan)
const admin = require('../config/firebase');
const db = admin.firestore();
const { callGeminiResilient } = require('../services/aiResilienceWrapper');
const { TOKEN_LIMITS } = require('../services/geminiService');
const { PLAN_SYSTEM_PROMPT, buildPlanUserPrompt } = require('../prompts/planPrompts');
const { generatePlanRequestSchema } = require('../schemas/aiSchemas');

const validatePlanShape = (data) =>
  Array.isArray(data.weeklySchedule) &&
  data.weeklySchedule.length === 7 &&
  data.weeklySchedule.every(day =>
    typeof day.isRestDay === 'boolean' &&
    Array.isArray(day.exercises) &&
    (day.isRestDay ? day.exercises.length === 0 : true)
  );

exports.generateWorkoutPlan = async (req, res) => {
  // 1. Validate request shape
  const parsed = generatePlanRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_REQUEST_BODY',
      message: parsed.error.issues[0]?.message || 'Invalid request body.',
    });
  }
  const { weekPreference, customInstructions } = parsed.data;

  try {
    // 2. Server-side profile fetch — source of truth, never client-supplied
    const userRef = db.collection('users').doc(req.user.uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return res.status(404).json({ success: false, error: 'USER_NOT_FOUND', message: 'User document does not exist.' });
    }

    const userData = userSnap.data();

    // 3. Onboarding gate
    if (!userData.onboardingComplete) {
      return res.status(409).json({
        success: false,
        error: 'ONBOARDING_INCOMPLETE',
        message: 'Complete onboarding before generating a plan.',
      });
    }

    const profile = userData.profile;

    // 4. Build prompt + call Gemini
    const userPrompt = buildPlanUserPrompt(profile, weekPreference, customInstructions);

    const result = await callGeminiResilient(
      PLAN_SYSTEM_PROMPT,
      userPrompt,
      TOKEN_LIMITS.PLAN_RESTRUCTURE,
      validatePlanShape
    );

    // Non-rest-day count must match profile.workoutDaysPerWeek exactly (Phase 2 §1.5 step 3)
    const activeDayCount = result.weeklySchedule.filter(d => !d.isRestDay).length;
    if (activeDayCount !== profile.workoutDaysPerWeek) {
      return res.status(502).json({
        success: false,
        error: 'AI_MALFORMED_OUTPUT',
        message: 'AI returned an unexpected response format.',
      });
    }

    // 5. Server-controlled re-numbering — never trust LLM counting
    let exerciseCounter = 1;
    const renumberedSchedule = result.weeklySchedule.map(day => ({
      ...day,
      exercises: day.exercises.map(ex => ({
        ...ex,
        exerciseId: `ex_${String(exerciseCounter++).padStart(3, '0')}`,
      })),
    }));

    // 6. Batch write: new plan + deactivate old + update currentPlanId
    const batch = db.batch();
    const newPlanRef = userRef.collection('workoutPlans').doc();

    const planDoc = {
      planId: newPlanRef.id,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      generatedByModel: 'gemini-2.5-flash-lite',
      planName: result.planName,
      isActive: true,
      durationWeeks: result.durationWeeks,
      weeklySchedule: renumberedSchedule,
      aiGenerationContext: {
        profileSnapshot: profile,
        customInstructions: customInstructions ?? null,
      },
    };

    batch.set(newPlanRef, planDoc);

    if (userData.currentPlanId) {
      const oldPlanRef = userRef.collection('workoutPlans').doc(userData.currentPlanId);
      batch.update(oldPlanRef, { isActive: false });
    }

    batch.update(userRef, {
      currentPlanId: newPlanRef.id,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await batch.commit();

    return res.status(200).json({ success: true, data: { planId: newPlanRef.id, ...planDoc } });

  } catch (error) {
    return res.status(error.httpStatus || 500).json({
      success: false,
      error: error.code || 'AI_UNKNOWN_ERROR',
      message: error.message || 'Something went wrong generating the plan.',
    });
  }
};
```

### 1.3 Retry-on-Schema-Violation Note

`validateShape` inside `callGeminiResilient` already covers the "7 days present, isRestDay/exercises consistent" case (Phase 2 §7.2). The **workoutDaysPerWeek count check** happens _after_ the resilient call returns, because it needs `profile.workoutDaysPerWeek` which isn't available inside the generic `validateShape` closure signature used by the shared wrapper — this is intentional: keep `validateShape` generic (shape-only), keep business-rule checks (count matches profile) in the controller. If this endpoint's failure rate on the count check turns out high in practice, consider passing profile into a plan-specific `validateShape` closure instead of a bare function reference.

---

## 2. Controller: `estimateNutrition`

### 2.1 Responsibilities

1. Validate `mealDescription` (non-empty, reasonable max length) and `mealType` enum via Zod.
2. No Firestore read needed — this endpoint is stateless per Phase 2 §2 (the daily totals resum happens client-side per Phase 2 §2.5).
3. Call Gemini through the resilience wrapper with shape validation.
4. Soft-check `itemBreakdown` sum against top-level `calories` (±10% tolerance) — log only, never block (Phase 2 §2.5).

### 2.2 Implementation

```javascript
// controllers/aiController.js (excerpt — estimateNutrition)
const { NUTRITION_SYSTEM_PROMPT, buildNutritionUserPrompt } = require('../prompts/nutritionPrompts');
const { estimateNutritionRequestSchema } = require('../schemas/aiSchemas');

const validateNutritionShape = (data) =>
  typeof data.calories === 'number' &&
  typeof data.proteinG === 'number' &&
  typeof data.carbsG === 'number' &&
  typeof data.fatsG === 'number' &&
  Array.isArray(data.itemBreakdown) &&
  data.itemBreakdown.every(i => typeof i.item === 'string' && typeof i.calories === 'number');

exports.estimateNutrition = async (req, res) => {
  const parsed = estimateNutritionRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_REQUEST_BODY',
      message: parsed.error.issues[0]?.message || 'Invalid meal description or type.',
    });
  }
  const { mealDescription, mealType } = parsed.data;

  try {
    const userPrompt = buildNutritionUserPrompt(mealDescription, mealType);

    const result = await callGeminiResilient(
      NUTRITION_SYSTEM_PROMPT,
      userPrompt,
      TOKEN_LIMITS.SUBSTITUTE, // reused budget, per Phase 2 §2.2
      validateNutritionShape
    );

    // Soft consistency check — log only, do not block (Phase 2 §2.5)
    const breakdownSum = result.itemBreakdown.reduce((sum, i) => sum + i.calories, 0);
    if (result.calories > 0) {
      const deviation = Math.abs(breakdownSum - result.calories) / result.calories;
      if (deviation > 0.10) {
        console.warn(
          `[estimateNutrition] itemBreakdown sum (${breakdownSum}) deviates >10% from top-level calories (${result.calories}) for uid=${req.user.uid}`
        );
      }
    }

    return res.status(200).json({ success: true, data: result });

  } catch (error) {
    return res.status(error.httpStatus || 500).json({
      success: false,
      error: error.code || 'AI_UNKNOWN_ERROR',
      message: error.message || 'Something went wrong estimating this meal.',
    });
  }
};
```

---

## 3. Controller: `chat`

### 3.1 Responsibilities (in order)

1. Validate `message` (non-empty, max length), `contextType` (optional enum), `conversationId` (optional string) via Zod.
2. If `conversationId` absent → create a new conversation document first (`title` = first ~60 chars of `message`).
3. Fetch last 10 messages from `messages` sub-collection, ordered `timestamp desc`, reverse to chronological (Phase 1 note, Phase 2 §5.2).
4. Build a compact `userProfileSummary` server-side from `users/{uid}.profile` + `.stats` (Phase 2 §5.5) — never the full profile map.
5. Call Gemini through the resilience wrapper.
6. Write **two** message documents (user + assistant) and update the parent conversation (`updatedAt`, `messageCount +2`, `lastMessagePreview`) in a single batch.

### 3.2 Implementation

```javascript
// controllers/aiController.js (excerpt — chat)
const { CHAT_SYSTEM_PROMPT, buildChatUserPrompt } = require('../prompts/chatPrompts');
const { chatRequestSchema } = require('../schemas/aiSchemas');

const validateChatShape = (data) => typeof data.reply === 'string' && data.reply.trim().length > 0;

const buildProfileSummary = (profile, stats) => {
  const planPart = stats?.currentPlanName ? `, active plan: ${stats.currentPlanName}` : '';
  return `goal: ${profile.fitnessGoal}, experience: ${profile.experienceLevel}, ` +
         `current streak: ${stats.currentStreakDays} days${planPart}`;
};

exports.chat = async (req, res) => {
  const parsed = chatRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_REQUEST_BODY',
      message: parsed.error.issues[0]?.message || 'Invalid chat request.',
    });
  }
  const { message, contextType, conversationId } = parsed.data;

  try {
    const userRef = db.collection('users').doc(req.user.uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return res.status(404).json({ success: false, error: 'USER_NOT_FOUND', message: 'User document does not exist.' });
    }
    const { profile, stats } = userSnap.data();

    // 2. Resolve or create the conversation
    let convoRef;
    let isNewConversation = false;

    if (conversationId) {
      convoRef = userRef.collection('aiConversations').doc(conversationId);
      const convoSnap = await convoRef.get();
      if (!convoSnap.exists) {
        return res.status(404).json({ success: false, error: 'CONVERSATION_NOT_FOUND', message: 'Conversation does not exist.' });
      }
    } else {
      convoRef = userRef.collection('aiConversations').doc();
      isNewConversation = true;
    }

    // 3. Fetch last 10 messages for Gemini context (desc, then reverse to chronological)
    let recentHistory = [];
    if (!isNewConversation) {
      const historySnap = await convoRef
        .collection('messages')
        .orderBy('timestamp', 'desc')
        .limit(10)
        .get();

      recentHistory = historySnap.docs
        .map(doc => doc.data())
        .reverse(); // oldest to newest for the prompt
    }

    // 4. Build compact profile summary + prompt
    const userProfileSummary = buildProfileSummary(profile, stats);
    const userPrompt = buildChatUserPrompt(userProfileSummary, recentHistory, contextType, message);

    // 5. Call Gemini
    const result = await callGeminiResilient(
      CHAT_SYSTEM_PROMPT,
      userPrompt,
      TOKEN_LIMITS.CHAT,
      validateChatShape
    );

    // 6. Batch write: conversation doc (create-or-update) + user message + assistant message
    const batch = db.batch();
    const now = admin.firestore.FieldValue.serverTimestamp();

    if (isNewConversation) {
      batch.set(convoRef, {
        conversationId: convoRef.id,
        createdAt: now,
        updatedAt: now,
        title: message.slice(0, 60),
        contextType: contextType ?? 'general',
        messageCount: 2,
        lastMessagePreview: result.reply.slice(0, 100),
        isArchived: false,
      });
    } else {
      batch.update(convoRef, {
        updatedAt: now,
        messageCount: admin.firestore.FieldValue.increment(2),
        lastMessagePreview: result.reply.slice(0, 100),
      });
    }

    const userMsgRef = convoRef.collection('messages').doc();
    batch.set(userMsgRef, { messageId: userMsgRef.id, role: 'user', content: message, timestamp: now });

    const assistantMsgRef = convoRef.collection('messages').doc();
    batch.set(assistantMsgRef, { messageId: assistantMsgRef.id, role: 'assistant', content: result.reply, timestamp: now });

    await batch.commit();

    return res.status(200).json({
      success: true,
      data: { conversationId: convoRef.id, reply: result.reply },
    });

  } catch (error) {
    return res.status(error.httpStatus || 500).json({
      success: false,
      error: error.code || 'AI_UNKNOWN_ERROR',
      message: error.message || 'Something went wrong sending that message.',
    });
  }
};
```

### 3.3 Note on `timestamp: now` Within a Batch

`admin.firestore.FieldValue.serverTimestamp()` resolves to the same server time for every write inside a single batch commit, so the user message and assistant reply will carry **identical** timestamps. The client's `orderBy('timestamp', 'asc')` subscription (Phase 3 §2.4) breaks ties by document ID order, which is not guaranteed to be `user` before `assistant`. **Mitigation:** write the two messages with an explicit 1-millisecond-apart client-side `Date` fallback is unreliable across clock skew; instead, add a monotonic `sequence` field (`0` for the user message, `1` for the assistant message) to each message document and sort by `(timestamp, sequence)` client-side, or simply rely on `messageId` insertion order via a secondary `orderBy('__name__')` only as a last-resort tiebreaker. Flagged here as a small but real correctness gap in the Phase 1 schema — recommend adding an optional `sequence: number` field to the `messages` sub-collection schema.

---

## 4. Voice / Speech-to-Text Pipeline

### 4.1 Where Voice Fits in the Two-Path Model

Voice capture is **never** its own AI endpoint. Per Phase 3 (§2.3 point 3, §2.5 point 2), voice is purely a **client-side transcription step** that feeds its output into an existing text field — either `workoutSession.voiceLogTranscript` (Path A, a raw note, no AI) or `MealInputBar`'s text (which then goes through the normal `/api/ai/estimate-nutrition` Path B call). This section specifies the transcription step itself, which sits entirely between the device microphone and whichever text field consumes it.

### 4.2 Two Supported Transcription Backends

> **Provider note:** OpenAI's Whisper API is not free ($0.36/hr of audio). The server-proxied fallback below targets **Groq's hosted Whisper Large v3 Turbo** instead — same underlying open-source Whisper model, OpenAI-compatible REST endpoint (so the controller shape in §4.4 barely changes vs. a raw OpenAI integration), at **$0.04/hr paid** and a **free tier of 2,000 requests/day** capped at **7,200 audio-seconds/hour and 28,800 audio-seconds/day**. For GymBro's short-clip usage pattern (a few seconds per voice note), the seconds-cap is the more binding free-tier constraint than the request count, but both are generous relative to expected early-stage traffic. If Groq's platform terms or limits shift materially, the OpenAI endpoint remains a drop-in fallback since both expose the same request/response shape.

|Backend|When Used|Cost/Latency Tradeoff|
|---|---|---|
|**Expo Speech (on-device / OS-native STT)**|Default for short utterances (workout notes, single-meal descriptions) on devices where `expo-speech-recognition` or the OS native recognizer is available|Free, low-latency (~1-2s), but lower accuracy in noisy environments and weaker with accents/mixed-language phrases common in meal descriptions|
|**Groq-hosted Whisper (server-proxied)**|Fallback when on-device recognition confidence is low, when the device doesn't support on-device STT, or for longer dictations (multi-sentence workout notes)|Higher accuracy, especially with background noise and code-switching, but requires an audio upload round trip; effectively free at GymBro's expected scale, with a well-defined cheap paid path if the free tier is exceeded|

### 4.3 End-to-End Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                        REACT NATIVE APP                          │
│                                                                    │
│  User taps 🎙 (VoiceLogButton / MealInputBar mic icon)             │
│         │                                                          │
│         ▼                                                          │
│  useVoiceCapture hook                                              │
│    1. Request mic permission (expo-av / expo-audio)                │
│    2. Start recording: format = .m4a (AAC), sampleRate = 16000Hz,  │
│       channels = 1 (mono) — matches Whisper's expected input and   │
│       keeps payload size small over gym Wi-Fi                     │
│    3. Show waveform/pulsing mic UI, max recording length: 60s      │
│         │                                                          │
│         ▼                                                          │
│  User taps 🎙 again (stop) OR auto-stop after 5s of silence         │
│  (silence detection via amplitude threshold, not a fixed timer —   │
│   gyms are loud AND users are winded/thinking mid-dictation, so    │
│   both the amplitude floor and the pause duration are tuned more   │
│   forgiving than a typical quiet-room default; see §4.5)            │
│         │                                                          │
│         ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐      │
│  │  ATTEMPT 1: On-device recognition (Expo Speech)           │      │
│  │  - Fast path, no network required                        │      │
│  │  - Returns { transcript, confidence }                     │      │
│  └─────────────────────────────────────────────────────────┘      │
│         │                                                          │
│         ├── confidence >= 0.6 ──► use transcript directly ────┐   │
│         │                                                      │   │
│         └── confidence < 0.6 OR on-device STT unavailable      │   │
│                     │                                           │   │
│                     ▼                                           │   │
│  ┌─────────────────────────────────────────────────────────┐   │   │
│  │  ATTEMPT 2: Upload audio to backend Groq/Whisper proxy     │   │   │
│  │  POST /api/audio/transcribe (multipart/form-data)          │   │   │
│  │  Body: audio file (.m4a, <=60s, <=5MB)                     │   │   │
│  │  Headers: Authorization: Bearer <idToken>                  │   │   │
│  └─────────────────────────────────────────────────────────┘   │   │
│                     │                                           │   │
│                     ▼                                           │   │
└─────────────────────│───────────────────────────────────────────┘   │
                       ▼                                               │
┌──────────────────────────────────────────────────────────────────┐  │
│               NODE.JS + EXPRESS BACKEND (Render)                  │  │
│                                                                    │  │
│  POST /api/audio/transcribe                                       │  │
│    1. verifyToken middleware (same as all AI routes)              │  │
│    2. multer middleware: validate mimetype (audio/m4a, audio/mp4, │  │
│       audio/wav), reject >5MB, reject >60s (via ffprobe duration  │  │
│       check before forwarding)                                    │  │
│    3. Forward audio buffer to Groq's Whisper endpoint             │  │
│       POST https://api.groq.com/openai/v1/audio/transcriptions     │  │
│       model: whisper-large-v3-turbo, response_format: json         │  │
│    4. Return { transcript: string }                                │  │
│       On failure: standardized error contract (Phase 2 §7.6),     │  │
│       new code AUDIO_TRANSCRIPTION_FAILED, HTTP 502                │  │
└──────────────────────│─────────────────────────────────────────────┘  │
                       ▼                                               │
              transcript returned to app ◄──────────────────────────────┘
                       │
                       ▼
        Transcript populates the target text field
        (voiceLogTranscript note field, OR MealInputBar —
         user can edit before it's used further; nothing is
         auto-submitted to an AI endpoint from voice alone)
```

### 4.4 Backend Route: `POST /api/audio/transcribe`

```javascript
// routes/audio.js
const express = require('express');
const multer = require('multer');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const audioController = require('../controllers/audioController');

const upload = multer({
  storage: multer.memoryStorage(), // never write to disk on Render's ephemeral filesystem
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB hard cap
  fileFilter: (req, file, cb) => {
    const allowed = ['audio/m4a', 'audio/mp4', 'audio/x-m4a', 'audio/wav'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('UNSUPPORTED_AUDIO_FORMAT'));
    }
    cb(null, true);
  },
});

// POST /api/audio/transcribe
// multipart/form-data, field name: "audio"
router.post('/transcribe', verifyToken, upload.single('audio'), audioController.transcribe);

module.exports = router;
```

```javascript
// controllers/audioController.js
const FormData = require('form-data');
const axios = require('axios');

const MAX_DURATION_SECONDS = 60;

exports.transcribe = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'MISSING_AUDIO_FILE',
      message: 'No audio file was provided.',
    });
  }

  try {
    // Duration is validated client-side (recording is capped at 60s in useVoiceCapture),
    // but re-validated server-side defensively using a lightweight duration probe
    // (e.g. music-metadata or ffprobe) rather than trusting the client cap.
    const durationSeconds = await probeAudioDuration(req.file.buffer);
    if (durationSeconds > MAX_DURATION_SECONDS) {
      return res.status(400).json({
        success: false,
        error: 'AUDIO_TOO_LONG',
        message: `Audio exceeds the ${MAX_DURATION_SECONDS}s limit.`,
      });
    }

    const form = new FormData();
    form.append('file', req.file.buffer, {
      filename: 'voice-note.m4a',
      contentType: req.file.mimetype,
    });
    form.append('model', 'whisper-large-v3-turbo'); // Groq-hosted; swap to 'whisper-large-v3'
                                                     // if Turbo's accuracy ever proves insufficient
    form.append('response_format', 'json');
    // No language pinned — GymBro's user base is multilingual/code-switching;
    // let Whisper auto-detect rather than forcing 'en' and mangling mixed-language meals

    const response = await axios.post(
      'https://api.groq.com/openai/v1/audio/transcriptions', // OpenAI-compatible endpoint —
      form,                                                   // swapping back to api.openai.com
      {                                                        // is a one-line change if ever needed
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        timeout: 20000,
      }
    );

    return res.status(200).json({ success: true, data: { transcript: response.data.text } });

  } catch (error) {
    if (error.message === 'UNSUPPORTED_AUDIO_FORMAT') {
      return res.status(400).json({ success: false, error: 'UNSUPPORTED_AUDIO_FORMAT', message: 'Audio format not supported.' });
    }

    const status = error.response?.status;
    if (status >= 500 || error.code === 'ECONNABORTED') {
      return res.status(502).json({
        success: false,
        error: 'AUDIO_TRANSCRIPTION_FAILED',
        message: 'Transcription service is temporarily unavailable.',
      });
    }

    return res.status(500).json({
      success: false,
      error: 'AUDIO_UNKNOWN_ERROR',
      message: 'Something went wrong transcribing that audio.',
    });
  }
};
```

### 4.5 Handling Noise in Gym Environments

This is the single biggest practical UX risk in the voice pipeline — gyms have music, clanging weights, and multiple overlapping conversations. Concrete mitigations, client and server side:

|Concern|Mitigation|
|---|---|
|Silence-detection auto-stop triggers falsely on ambient noise|Amplitude threshold for "silence" is tuned significantly higher than a quiet-room default (empirically, gym ambient noise floor runs 55-65dB vs. ~30-40dB for a quiet room); `useVoiceCapture` should expose this threshold as a tunable constant, not hardcode a value borrowed from a generic STT tutorial.|
|Silence-detection auto-stop clips natural mid-sentence pauses|Users dictating workout/meal notes are frequently winded (just finished a set) or thinking under mild stress — both produce longer-than-conversational pauses. The pause duration required to trigger auto-stop is set to **5 seconds**, not the more typical 1-2s used for quiet-room dictation apps, specifically to tolerate this. Manual tap-to-stop remains the primary/reliable path; auto-stop is a convenience fallback, not something the UX depends on. A shorter flat value trades faster perceived responsiveness for a real risk of cutting off legitimate speech — not a good trade for a fitness-logging app where a clipped rep count is worse than a half-second of extra wait.|
|On-device STT confidence degrades in noise|The `confidence >= 0.6` gate (§4.3) is the primary defense — low-confidence on-device results are never silently accepted, they always fall through to the Groq-hosted Whisper proxy which handles noisy audio meaningfully better.|
|User shouting over gym noise produces clipped/distorted audio|Record at a fixed gain rather than auto-gain-control where the platform allows it, since AGC tends to overcorrect for sudden loud gym sounds (a dropped weight) and clip the user's actual speech immediately after.|
|Background music with lyrics gets partially transcribed as speech|Not solvable reliably client-side; mitigate by always showing the transcript in an **editable** text field before it's used (never auto-submit), so a garbled fragment is a quick edit, not a silent bad data point.|
|Network dropout mid-upload to Whisper proxy|`useCallBackend`-equivalent wrapper for the audio route retries once with the same resilience posture as Phase 2 §7.2 (one retry, no more — this is a foreground user-waiting interaction, not a background job).|
|User speaks in a mix of languages (e.g. Bengali + English food names)|Whisper's auto-detect (no `language` param pinned, §4.4) handles code-switching far better than most on-device recognizers; this is the primary reason the Whisper fallback exists at all, not just as a noise fallback.|

### 4.6 Payload & Format Constraints Summary

|Constraint|Value|Enforced Where|
|---|---|---|
|Silence duration before auto-stop|5 seconds|Client (`useVoiceCapture` amplitude+timer logic)|
|Max recording length|60 seconds|Client (`useVoiceCapture` hard stop) + server (duration probe)|
|Max upload size|5MB|`multer` limits (server)|
|Format|`.m4a` (AAC), 16kHz, mono|Client recording config|
|Allowed MIME types|`audio/m4a`, `audio/mp4`, `audio/x-m4a`, `audio/wav`|`multer` fileFilter|
|On-device confidence threshold for accepting without Whisper|`>= 0.6`|Client (`useVoiceCapture`)|

---

## 5. Input Validation & Request Sanitization (Zod)

### 5.1 Why Zod, and Where It Sits in the Request Lifecycle

Every AI route validates `req.body` with a Zod schema **before** any Firestore read or Gemini call. This is a separate, earlier layer than the prompt-level injection resistance already specified in Phase 2 §0 (`<<<USER_INPUT>>>` delimiters) — Zod's job is structural (types, lengths, enums, required fields), not semantic. A message can pass Zod validation and still contain a prompt-injection attempt; that's what the delimiter pattern is for. A message can fail Zod validation without ever being a security concern at all (e.g. `mealType` is misspelled). Both layers are required; neither substitutes for the other.

### 5.2 Shared Schema File

```javascript
// schemas/aiSchemas.js
const { z } = require('zod');

// ── Shared building blocks ──────────────────────────────────────────

const nonEmptyTrimmedString = (maxLen, fieldName) =>
  z.string()
    .trim()
    .min(1, { message: `${fieldName} must not be empty.` })
    .max(maxLen, { message: `${fieldName} must be ${maxLen} characters or fewer.` });

// ── POST /api/ai/generate-plan ──────────────────────────────────────

const generatePlanRequestSchema = z.object({
  weekPreference: z.number().int().min(1).max(12).optional(),
  customInstructions: nonEmptyTrimmedString(500, 'customInstructions').nullable().optional(),
});

// ── POST /api/ai/estimate-nutrition ─────────────────────────────────

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack', 'pre_workout', 'post_workout'];

const estimateNutritionRequestSchema = z.object({
  mealDescription: nonEmptyTrimmedString(300, 'mealDescription'),
  mealType: z.enum(MEAL_TYPES, {
    errorMap: () => ({ message: `mealType must be one of: ${MEAL_TYPES.join(', ')}` }),
  }),
});

// ── POST /api/ai/recovery-score ─────────────────────────────────────

const recoveryScoreRequestSchema = z.object({
  sleepHours: z.number().min(0).max(12),
  sleepQuality: z.number().int().min(1).max(5),
  muscleSoreness: z.number().int().min(1).max(5),
  energyLevel: z.number().int().min(1).max(5),
  stressLevel: z.number().int().min(1).max(5),
  moodRating: z.number().int().min(1).max(5),
});

// ── POST /api/ai/substitute-exercise ────────────────────────────────

const substituteExerciseRequestSchema = z.object({
  exerciseName: nonEmptyTrimmedString(100, 'exerciseName'),
  reason: nonEmptyTrimmedString(300, 'reason'),
  availableEquipment: z.array(z.string()).max(10).optional().default([]),
});

// ── POST /api/ai/chat ────────────────────────────────────────────────

const CONTEXT_TYPES = ['general', 'workout_advice', 'nutrition', 'recovery', 'motivation'];

const chatRequestSchema = z.object({
  message: nonEmptyTrimmedString(2000, 'message'),
  contextType: z.enum(CONTEXT_TYPES).optional(),
  conversationId: z.string().min(1).max(128).optional(),
});

module.exports = {
  generatePlanRequestSchema,
  estimateNutritionRequestSchema,
  recoveryScoreRequestSchema,
  substituteExerciseRequestSchema,
  chatRequestSchema,
};
```

### 5.3 Reusable Validation Middleware (Alternative to Inline `safeParse`)

For controllers that prefer middleware-style validation over inline `safeParse` calls (both are used interchangeably across this codebase; pick one convention per route file and stay consistent):

```javascript
// middleware/validateBody.js
const validateBody = (schema) => (req, res, next) => {
  const parsed = schema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_REQUEST_BODY',
      message: parsed.error.issues[0]?.message || 'Request body failed validation.',
    });
  }

  req.body = parsed.data; // replace with the parsed/coerced/defaulted version
  next();
};

module.exports = validateBody;
```

```javascript
// routes/ai.js (updated to use validateBody middleware)
const validateBody = require('../middleware/validateBody');
const {
  generatePlanRequestSchema,
  estimateNutritionRequestSchema,
  recoveryScoreRequestSchema,
  substituteExerciseRequestSchema,
  chatRequestSchema,
} = require('../schemas/aiSchemas');

router.post('/generate-plan', verifyToken, validateBody(generatePlanRequestSchema), aiController.generateWorkoutPlan);
router.post('/chat', verifyToken, validateBody(chatRequestSchema), aiController.chat);
router.post('/estimate-nutrition', verifyToken, validateBody(estimateNutritionRequestSchema), aiController.estimateNutrition);
router.post('/recovery-score', verifyToken, validateBody(recoveryScoreRequestSchema), aiController.computeRecoveryScore);
router.post('/substitute-exercise', verifyToken, validateBody(substituteExerciseRequestSchema), aiController.substituteExercise);
```

> **Note:** if the middleware form is adopted, remove the duplicate inline `safeParse` block from each controller shown in §1–3 above — the two are shown separately in this document only to illustrate both patterns, not to be used together on the same route.

### 5.4 Sanitization Beyond Type/Length Validation

Zod handles shape; a few additional sanitization steps happen after validation, before the string ever reaches a prompt template:

|Step|Purpose|
|---|---|
|`.trim()` on all free-text fields (already in `nonEmptyTrimmedString`)|Prevents whitespace-only strings from passing `.min(1)` and prevents leading/trailing whitespace from padding token counts|
|Collapse repeated whitespace/newlines (`str.replace(/\s+/g, ' ')`) on `message` and `mealDescription`|A user pasting a huge block of repeated newlines is a cheap way to pad token usage without adding content; collapsing internal whitespace mitigates this without touching the substantive text|
|Length caps chosen conservatively relative to `TOKEN_LIMITS`|`message` capped at 2000 chars (~500 tokens) leaves comfortable headroom under `TOKEN_LIMITS.CHAT` (1200) for the reply itself plus profile summary and history; `mealDescription` at 300 chars is generous for a meal description and still cheap|
|Delimiter injection is still the prompt-layer's job (Phase 2 §0), not Zod's|Zod does **not** attempt to detect or strip prompt-injection phrases — that would be brittle pattern-matching prone to false positives on legitimate text (e.g. a user genuinely describing a meal that happens to contain the word "ignore"). The `<<<USER_INPUT>>>` delimiter + system-prompt instruction is the correct layer for that concern and is left unchanged from Phase 2.|

### 5.5 Validation Error Response Consistency

`INVALID_REQUEST_BODY` (400) joins the standardized error contract from Phase 2 §7.6 as an additional code, always returned **before** any Gemini call is attempted — this keeps the 15 RPM budget (Phase 2 §7.4) reserved for requests that are actually well-formed enough to be worth spending a Gemini call on.

|`error` code|HTTP status|Suggested client UX|
|---|---|---|
|`INVALID_REQUEST_BODY`|400|Inline form validation error, not a toast — mirrors `INVALID_INPUT_RANGE` handling from Phase 2 §7.6|
|`AUDIO_TOO_LONG`|400|Inline message near the mic button: "Recording too long — try a shorter note"|
|`UNSUPPORTED_AUDIO_FORMAT`|400|Toast: "Couldn't process that recording — please try again"|
|`AUDIO_TRANSCRIPTION_FAILED`|502|Toast: "Voice transcription is temporarily unavailable"|
|`MISSING_AUDIO_FILE`|400|Client bug indicator if it ever fires — recording flow should always attach a file|

---

## Summary Reference Card — Phase 4 Additions

|Controller|Endpoint|Firestore Reads|Firestore Writes|Gemini Call|
|---|---|---|---|---|
|`generateWorkoutPlan`|`POST /api/ai/generate-plan`|`users/{uid}` (profile, currentPlanId)|Batch: new plan, deactivate old, update `currentPlanId`|✅ `PLAN_RESTRUCTURE`|
|`estimateNutrition`|`POST /api/ai/estimate-nutrition`|None|None (client saves on confirm, per Phase 3 §2.5)|✅ `SUBSTITUTE` budget|
|`chat`|`POST /api/ai/chat`|`users/{uid}`, last 10 `messages` docs|Batch: conversation doc + 2 message docs|✅ `CHAT`|
|`transcribe`|`POST /api/audio/transcribe`|None|None|❌ (Groq-hosted Whisper, not Gemini)|

|New Route|Auth|Purpose|
|---|---|---|
|`POST /api/audio/transcribe`|✅ verifyToken|Server-proxied Groq/Whisper fallback for low-confidence on-device transcriptions|

|New Error Codes|HTTP Status|
|---|---|
|`INVALID_REQUEST_BODY`|400|
|`ONBOARDING_INCOMPLETE`|409|
|`USER_NOT_FOUND`|404|
|`CONVERSATION_NOT_FOUND`|404|
|`AUDIO_TOO_LONG`|400|
|`UNSUPPORTED_AUDIO_FORMAT`|400|
|`AUDIO_TRANSCRIPTION_FAILED`|502|
|`MISSING_AUDIO_FILE`|400|

|Schema Gap Flagged for Phase 5|Reason|
|---|---|
|`messages/{messageId}.sequence` (optional number field)|Needed to deterministically order same-millisecond user/assistant message pairs written in one batch (§3.3)|
|`GROQ_API_KEY` in `.env`|New environment variable required for the Groq-hosted Whisper proxy route, alongside existing `GEMINI_API_KEY`. Free tier: 2,000 requests/day, capped at 7,200 audio-sec/hour and 28,800 audio-sec/day — both generous for GymBro's short-clip usage but worth monitoring as user count grows.|