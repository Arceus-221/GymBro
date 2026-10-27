const { randomUUID } = require('crypto');

/** Assign server-owned identities; never trust IDs supplied by a model. */
function identifyMeals(schedule) {
  return schedule.map(day => ({
    ...day,
    meals: day.meals.map(meal => ({ ...meal, mealId: randomUUID(), revision: 'original' })),
  }));
}

module.exports = { identifyMeals };
