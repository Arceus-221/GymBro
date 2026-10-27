const { identifyMeals } = require('../services/mealIdentity');

test('generated meals receive distinct server-owned identities', () => {
  const schedule = [{ dayLabel: 'Monday', meals: [
    { description: 'Rice', mealId: 'untrusted', revision: 'untrusted' },
    { description: 'Rice' },
  ] }];
  const meals = identifyMeals(schedule)[0].meals;
  expect(meals[0].mealId).not.toBe('untrusted');
  expect(meals[0].mealId).not.toBe(meals[1].mealId);
  expect(meals[0].revision).toBe('original');
  expect(schedule[0].meals[0].mealId).toBe('untrusted');
});
