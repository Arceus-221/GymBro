const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function parseDate(id) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(id ?? '')) return null;
  const [year, month, day] = id.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

function scheduledDays(schedule) {
  if (!Array.isArray(schedule) || schedule.length !== 7) return null;
  const days = new Set();
  for (const item of schedule) {
    if (!DAYS.includes(item?.dayLabel) || typeof item.isRestDay !== 'boolean' || days.has(item.dayLabel)) return null;
    days.add(item.dayLabel);
  }
  return new Set(schedule.filter((item) => !item.isRestDay).map((item) => item.dayLabel));
}

/** Today's scheduled workout remains possible until the local day ends. */
export function currentWorkoutStreak(stats, schedule, todayId) {
  const last = parseDate(stats?.lastWorkoutDate);
  const today = parseDate(todayId);
  const scheduled = scheduledDays(schedule);
  if (!last || !today || !scheduled || !scheduled.size || last > today) return 0;
  const cursor = new Date(last);
  cursor.setDate(cursor.getDate() + 1);
  while (cursor < today) {
    if (scheduled.has(DAYS[cursor.getDay()])) return 0;
    cursor.setDate(cursor.getDate() + 1);
  }
  return Math.max(0, stats?.currentStreakDays ?? 0);
}

/** A rest-day workout is logged but does not advance the scheduled-day streak. */
export function streakAfterWorkout(stats, schedule, workoutDate) {
  const day = parseDate(workoutDate);
  const scheduled = scheduledDays(schedule);
  if (!day || !scheduled || !scheduled.size) return null;
  if (!scheduled.has(DAYS[day.getDay()])) return null;
  const last = parseDate(stats?.lastWorkoutDate);
  if (last && last > day) return null; // Do not rewrite newer aggregates with a late save.
  if (stats?.lastWorkoutDate === workoutDate) return Math.max(1, stats.currentStreakDays ?? 0);
  return currentWorkoutStreak(stats, schedule, workoutDate) + 1;
}
