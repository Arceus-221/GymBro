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
