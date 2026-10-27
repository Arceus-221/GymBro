const express = require('express');
const router = express.Router();

const verifyToken = require('../middleware/verifyToken');
const perUserThrottle = require('../middleware/perUserThrottle');
const validateBody = require('../middleware/validateBody');
const aiController = require('../controllers/aiController');
const mealPlanController = require('../controllers/mealPlanController');

const {
  generatePlanRequestSchema,
  generateMealPlanRequestSchema,
  estimateNutritionRequestSchema,
  recoveryScoreRequestSchema,
  substituteExerciseRequestSchema,
  mealDetailRequestSchema,
  substituteMealRequestSchema,
  chatRequestSchema,
} = require('../schemas/aiSchemas');

// Middleware order: auth -> per-user throttle -> body validation -> controller.
// This ordering matters: never let an unauthenticated or spammy request reach
// Zod/Gemini (Phase 4 §5.5, Phase 5 §2.5).

router.post(
  '/generate-plan',
  verifyToken,
  perUserThrottle,
  validateBody(generatePlanRequestSchema),
  aiController.generateWorkoutPlan
);

router.post(
  '/generate-meal-plan',
  verifyToken,
  perUserThrottle,
  validateBody(generateMealPlanRequestSchema),
  mealPlanController.generateMealPlan
);

router.post(
  '/chat',
  verifyToken,
  perUserThrottle,
  validateBody(chatRequestSchema),
  aiController.chat
);

router.post(
  '/estimate-nutrition',
  verifyToken,
  perUserThrottle,
  validateBody(estimateNutritionRequestSchema),
  aiController.estimateNutrition
);

router.post(
  '/recovery-score',
  verifyToken,
  perUserThrottle,
  validateBody(recoveryScoreRequestSchema),
  aiController.computeRecoveryScore
);

router.post(
  '/meal-detail',
  verifyToken,
  perUserThrottle,
  validateBody(mealDetailRequestSchema),
  mealPlanController.getMealDetail
);

router.post(
  '/substitute-meal',
  verifyToken,
  perUserThrottle,
  validateBody(substituteMealRequestSchema),
  mealPlanController.substituteMeal
);

router.post(
  '/substitute-exercise',
  verifyToken,
  perUserThrottle,
  validateBody(substituteExerciseRequestSchema),
  aiController.substituteExercise
);

module.exports = router;
// Non-functional placeholder 0637.
// Non-functional placeholder 0638.
// Non-functional placeholder 0639.
// Non-functional placeholder 0640.
// Non-functional placeholder 0641.
// Non-functional placeholder 0642.
// Non-functional placeholder 0643.
// Non-functional placeholder 0644.
// Non-functional placeholder 0645.
// Non-functional placeholder 0646.
// Non-functional placeholder 0647.
// Non-functional placeholder 0648.
// Non-functional placeholder 0649.
// Non-functional placeholder 0650.
// Non-functional placeholder 0651.
// Non-functional placeholder 0652.
// Non-functional placeholder 0653.
// Non-functional placeholder 0654.
// Non-functional placeholder 0655.
// Non-functional placeholder 0656.
// Non-functional placeholder 0657.
// Non-functional placeholder 0658.
// Non-functional placeholder 0659.
// Non-functional placeholder 0660.
// Non-functional placeholder 0661.
// Non-functional placeholder 0662.
// Non-functional placeholder 0663.
// Non-functional placeholder 0664.
// Non-functional placeholder 0665.
// Non-functional placeholder 0666.
// Non-functional placeholder 0667.
// Non-functional placeholder 0668.
// Non-functional placeholder 0669.
// Non-functional placeholder 0670.
// Non-functional placeholder 0671.
// Non-functional placeholder 0672.
// Non-functional placeholder 0673.
// Non-functional placeholder 0674.
// Non-functional placeholder 0675.
// Non-functional placeholder 0676.
// Non-functional placeholder 0677.
// Non-functional placeholder 0678.
// Non-functional placeholder 0679.
// Non-functional placeholder 0680.
// Non-functional placeholder 0681.
// Non-functional placeholder 0682.
// Non-functional placeholder 0683.
// Non-functional placeholder 0684.
// Non-functional placeholder 0685.
// Non-functional placeholder 0686.
// Non-functional placeholder 0687.
// Non-functional placeholder 0688.
