import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/**
 * Date helpers shared by every screen that touches dailyLogs, whose document
 * IDs are local-date strings (Phase 1 §2). Using toISOString() here would be a
 * bug: it converts to UTC, so anyone east/west of GMT would write to the wrong
 * day's document near midnight.
 */

export function toDateId(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const DAY_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export function todayLabel(date = new Date()) {
  return DAY_LABELS[date.getDay()];
}

/** Monday-first list of the 7 date IDs for the week containing `date`. */
export function currentWeekDateIds(date = new Date()) {
  const dayOfWeek = date.getDay();
  const offsetToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(date);
  monday.setDate(date.getDate() + offsetToMonday);

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return toDateId(d);
  });
}

/** Local calendar date refreshed at midnight, on foreground, and after clock/timezone changes. */
export function useToday() {
  const [dateId, setDateId] = useState(() => toDateId());
  useEffect(() => {
    let timer;
    const refresh = () => {
      setDateId(toDateId());
      clearTimeout(timer);
      const now = new Date();
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = setTimeout(refresh, midnight.getTime() - now.getTime() + 50);
    };
    refresh();
    // Foreground refresh handles background suspension; the periodic check also
    // notices time-zone or clock changes while the app stays open.
    const interval = setInterval(refresh, 60000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => { clearTimeout(timer); clearInterval(interval); subscription.remove(); };
  }, []);
  const [year, month, day] = dateId.split('-').map(Number);
  return { dateId, date: new Date(year, month - 1, day, 12), dayLabel: todayLabel(new Date(year, month - 1, day, 12)) };
}
