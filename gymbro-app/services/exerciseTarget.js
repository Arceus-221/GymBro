/** Preserve units for legacy free-text targets and new structured targets. */
export function exerciseTarget(exercise) {
  const units = ['reps', 'seconds', 'meters'];
  if (units.includes(exercise.targetUnit) && Number.isFinite(exercise.targetValue) && exercise.targetValue >= 0) {
    return { unit: exercise.targetUnit, value: exercise.targetValue };
  }
  const text = String(exercise.repsRange ?? '').toLowerCase().trim();
  const number = Number(text.match(/\d+(?:\.\d+)?/)?.[0] ?? 0);
  if (/\b(?:seconds?|secs?)\b|\d\s*s\b/.test(text)) return { unit: 'seconds', value: number };
  if (/\b(?:minutes?|mins?)\b|\d\s*min\b/.test(text)) return { unit: 'seconds', value: number * 60 };
  if (/\b(?:kilometers?|kilometres?|km)\b/.test(text)) return { unit: 'meters', value: number * 1000 };
  if (/\b(?:meters?|metres?)\b|\d\s*m\b/.test(text)) return { unit: 'meters', value: number };
  return { unit: 'reps', value: number };
}
