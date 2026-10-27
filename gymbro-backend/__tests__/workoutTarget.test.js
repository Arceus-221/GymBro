const { validWorkoutTarget } = require('../services/workoutTarget');

test('generated targets require a supported unit and positive numeric value', () => {
  expect(validWorkoutTarget({ targetUnit: 'seconds', targetValue: 30 })).toBe(true);
  expect(validWorkoutTarget({ targetUnit: 'meters', targetValue: 500 })).toBe(true);
  expect(validWorkoutTarget({ targetUnit: 'reps', targetValue: 8 })).toBe(true);
  expect(validWorkoutTarget({ targetUnit: 'minutes', targetValue: 2 })).toBe(false);
  expect(validWorkoutTarget({ targetUnit: 'seconds', targetValue: -1 })).toBe(false);
  expect(validWorkoutTarget({ targetUnit: 'seconds', targetValue: '30' })).toBe(false);
  expect(validWorkoutTarget(null)).toBe(false);
});
