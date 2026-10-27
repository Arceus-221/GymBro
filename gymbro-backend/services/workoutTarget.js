/** Validate the unit and value before a generated plan is persisted. */
function validWorkoutTarget(exercise) {
  return exercise != null && ['reps', 'seconds', 'meters'].includes(exercise.targetUnit) &&
    Number.isFinite(exercise.targetValue) && exercise.targetValue > 0;
}

module.exports = { validWorkoutTarget };
