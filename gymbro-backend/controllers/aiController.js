// Implements all five AI routes per Phase 2 (prompts) + Phase 4 (controller
// logic). Every Gemini call goes through callGeminiResilient; every response
// follows the standardized { success, data } / { success:false, error, message }
// contract (Phase 2 §7.6).

const admin = require('../config/firebase');
const db = admin.firestore();
const { callGeminiResilient } = require('../services/aiResilienceWrapper');
const { TOKEN_LIMITS } = require('../services/geminiService');
const { MODEL_ID } = require('../services/aiProviders/geminiAdapter');
const { validWorkoutTarget } = require('../services/workoutTarget');

const { PLAN_SYSTEM_PROMPT, buildPlanUserPrompt } = require('../prompts/planPrompts');
const { NUTRITION_SYSTEM_PROMPT, buildNutritionUserPrompt } = require('../prompts/nutritionPrompts');
const { RECOVERY_SYSTEM_PROMPT, buildRecoveryUserPrompt } = require('../prompts/recoveryPrompts');
const { SUBSTITUTE_SYSTEM_PROMPT, buildSubstituteUserPrompt } = require('../prompts/substitutePrompts');
const { CHAT_SYSTEM_PROMPT, buildChatUserPrompt } = require('../prompts/chatPrompts');


const validatePlanShape = (data) =>
  Array.isArray(data?.weeklySchedule) &&
  data.weeklySchedule.length === 7 &&
  data.weeklySchedule.every(day =>
    day != null && typeof day.isRestDay === 'boolean' &&
    Array.isArray(day.exercises) &&
    (day.isRestDay ? day.exercises.length === 0 : day.exercises.every(validWorkoutTarget))
  );

exports.generateWorkoutPlan = async (req, res) => {
  const { weekPreference, customInstructions } = req.body;

  try {
    const userRef = db.collection('users').doc(req.user.uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return res.status(404).json({ success: false, error: 'USER_NOT_FOUND', message: 'User document does not exist.' });
    }

    const userData = userSnap.data();

    if (!userData.onboardingComplete) {
      return res.status(409).json({
        success: false,
        error: 'ONBOARDING_INCOMPLETE',
        message: 'Complete onboarding before generating a plan.',
      });
    }

    const profile = userData.profile;
    const userPrompt = buildPlanUserPrompt(profile, weekPreference, customInstructions);

    const result = await callGeminiResilient(
      PLAN_SYSTEM_PROMPT,
      userPrompt,
      TOKEN_LIMITS.PLAN_RESTRUCTURE,
      validatePlanShape
    );

    const activeDayCount = result.weeklySchedule.filter(d => !d.isRestDay).length;
    if (activeDayCount !== profile.workoutDaysPerWeek) {
      return res.status(502).json({
        success: false,
        error: 'AI_MALFORMED_OUTPUT',
        message: 'AI returned an unexpected response format.',
      });
    }

    // Server-controlled re-numbering — never trust LLM counting
    let exerciseCounter = 1;
    const renumberedSchedule = result.weeklySchedule.map(day => ({
      ...day,
      exercises: day.exercises.map(ex => ({
        ...ex,
        exerciseId: `ex_${String(exerciseCounter++).padStart(3, '0')}`,
      })),
    }));

    const batch = db.batch();
    const newPlanRef = userRef.collection('workoutPlans').doc();

    const planDoc = {
      planId: newPlanRef.id,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      generatedByModel: MODEL_ID,
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
      const oldPlanSnap = await oldPlanRef.get();
      if (oldPlanSnap.exists) batch.update(oldPlanRef, { isActive: false });
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


const validateNutritionShape = (data) =>
  typeof data.calories === 'number' &&
  typeof data.proteinG === 'number' &&
  typeof data.carbsG === 'number' &&
  typeof data.fatsG === 'number' &&
  Array.isArray(data.itemBreakdown) &&
  data.itemBreakdown.every(i => typeof i.item === 'string' && typeof i.calories === 'number');

exports.estimateNutrition = async (req, res) => {
  const { mealDescription, mealType } = req.body;

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


const validateRecoveryShape = (data) =>
  typeof data.recoveryScore === 'number' &&
  data.recoveryScore >= 0 && data.recoveryScore <= 100 &&
  ['full_rest', 'light_activity', 'train_normally', 'train_hard'].includes(data.recommendation) &&
  typeof data.reasoning === 'string' &&
  Array.isArray(data.suggestedActivities);

exports.computeRecoveryScore = async (req, res) => {
  const { sleepHours, sleepQuality, muscleSoreness, energyLevel, stressLevel, moodRating } = req.body;

  try {
    const result = await callGeminiResilient(
      RECOVERY_SYSTEM_PROMPT,
      buildRecoveryUserPrompt({ sleepHours, sleepQuality, muscleSoreness, energyLevel, stressLevel, moodRating }),
      TOKEN_LIMITS.RECOVERY,
      validateRecoveryShape
    );

    return res.status(200).json({ success: true, data: result });

  } catch (error) {
    return res.status(error.httpStatus || 500).json({
      success: false,
      error: error.code || 'AI_UNKNOWN_ERROR',
      message: error.message || 'Something went wrong computing your recovery score.',
    });
  }
};


const validateSubstituteShape = (data) =>
  Array.isArray(data.substitutes) &&
  data.substitutes.length >= 2 && data.substitutes.length <= 3 &&
  data.substitutes.every(s =>
    typeof s.name === 'string' &&
    typeof s.sets === 'number' &&
    typeof s.repsRange === 'string' &&
    typeof s.notes === 'string'
  );

exports.substituteExercise = async (req, res) => {
  const { exerciseName, reason, availableEquipment } = req.body;

  try {
    const userPrompt = buildSubstituteUserPrompt(exerciseName, availableEquipment, reason);

    const result = await callGeminiResilient(
      SUBSTITUTE_SYSTEM_PROMPT,
      userPrompt,
      TOKEN_LIMITS.SUBSTITUTE,
      validateSubstituteShape
    );

    return res.status(200).json({ success: true, data: result });

  } catch (error) {
    return res.status(error.httpStatus || 500).json({
      success: false,
      error: error.code || 'AI_UNKNOWN_ERROR',
      message: error.message || 'Something went wrong finding a substitute.',
    });
  }
};


const validateChatShape = (data) => typeof data.reply === 'string' && data.reply.trim().length > 0;

const buildProfileSummary = (profile, stats) => {
  const planPart = stats?.currentPlanName ? `, active plan: ${stats.currentPlanName}` : '';
  return `goal: ${profile.fitnessGoal}, experience: ${profile.experienceLevel}, ` +
         `current streak: ${stats.currentStreakDays} days${planPart}`;
};

exports.chat = async (req, res) => {
  const { message, contextType, conversationId } = req.body;

  try {
    const userRef = db.collection('users').doc(req.user.uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return res.status(404).json({ success: false, error: 'USER_NOT_FOUND', message: 'User document does not exist.' });
    }
    const { profile, stats } = userSnap.data();

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

    let recentHistory = [];
    if (!isNewConversation) {
      const historySnap = await convoRef
        .collection('messages')
        .orderBy('timestamp', 'desc')
        .limit(10)
        .get();

      recentHistory = historySnap.docs.map(doc => doc.data()).reverse();
    }

    const userProfileSummary = buildProfileSummary(profile, stats);
    const userPrompt = buildChatUserPrompt(userProfileSummary, recentHistory, contextType, message);

    const result = await callGeminiResilient(
      CHAT_SYSTEM_PROMPT,
      userPrompt,
      TOKEN_LIMITS.CHAT,
      validateChatShape
    );

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

    // NOTE (Phase 4 §3.3): both writes share the same serverTimestamp() value
    // within this batch. A `sequence` field (0 = user, 1 = assistant) is
    // included so the client can break same-millisecond ties deterministically
    // — see Phase 4 §3.3 and the flagged schema gap in Phase 4's summary card.
    const userMsgRef = convoRef.collection('messages').doc();
    batch.set(userMsgRef, { messageId: userMsgRef.id, role: 'user', content: message, timestamp: now, sequence: 0 });

    const assistantMsgRef = convoRef.collection('messages').doc();
    batch.set(assistantMsgRef, { messageId: assistantMsgRef.id, role: 'assistant', content: result.reply, timestamp: now, sequence: 1 });

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
