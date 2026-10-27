/* global __dirname */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function loadActions(file, initial) {
  let data = structuredClone(initial);
  let counter = 0;
  const context = {
    db: {},
    doc: (...args) => args.length === 1 ? { id: `revision-${++counter}` } : {},
    collection: () => ({}),
    serverTimestamp: () => 'timestamp',
    sumMealTotals: (meals) => ({ calories: meals.reduce((n, m) => n + m.aiEstimate.calories, 0) }),
    runTransaction: async (_db, callback) => callback({
      get: async () => ({ exists: () => Boolean(data), data: () => structuredClone(data) }),
      set: (_ref, value) => { data = { ...data, ...value }; },
      update: (_ref, value) => { data = { ...data, ...value }; },
    }),
  };
  let source = fs.readFileSync(path.join(__dirname, '../services', file), 'utf8');
  source = source.replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  vm.runInNewContext(`${source}\nthis.actions = { ${file === 'mealPlanActions.js' ? 'replaceMeal, cacheMealDetail, mealKey' : 'appendLoggedMeal, removePlannedMealLog'} };`, context);
  return { actions: context.actions, data: () => data };
}

test('meal writes use current log and planned-meal additions are idempotent', async () => {
  const { actions, data } = loadActions('nutritionLogActions.js', { nutritionLog: { meals: [] } });
  const add = (key, calories) => actions.appendLoggedMeal({ uid: 'u', dateId: 'day', existingLog: {}, entry: { plannedMealKey: key, aiEstimate: { calories } } });
  await add('a', 100);
  await add('b', 200);
  await add('a', 100);
  assert.equal(data().nutritionLog.meals.length, 2);
  assert.equal(data().nutritionLog.aiEstimatedTotals.calories, 300);
  await actions.removePlannedMealLog({ uid: 'u', dateId: 'day', existingLog: {}, plannedMealKey: 'a' });
  assert.equal(data().nutritionLog.meals[0].plannedMealKey, 'b');
});

test('late recipe cannot overwrite a swapped meal or another schedule change', async () => {
  const old = { mealType: 'lunch', description: 'old', calories: 10, proteinG: 1, carbsG: 2, fatsG: 3 };
  const other = { ...old, description: 'other' };
  const { actions, data } = loadActions('mealPlanActions.js', { weeklyMealSchedule: [{ dayLabel: 'Monday', meals: [old, other] }] });
  const args = { uid: 'u', planId: 'p', dayLabel: 'Monday', index: 0, expectedMeal: old };
  await actions.replaceMeal({ ...args, replacement: { ...old, description: 'new' } });
  const cached = await actions.cacheMealDetail({ ...args, detail: { steps: ['old recipe'] } });
  assert.equal(cached, false);
  assert.equal(data().weeklyMealSchedule[0].meals[0].description, 'new');
  assert.equal(data().weeklyMealSchedule[0].meals[1].description, 'other');
});

 test('equipment selection keeps bodyweight exclusive in either direction', () => {
  let source = fs.readFileSync(path.join(__dirname, '../constants/equipment.js'), 'utf8').replace(/export /g, '');
  const context = {};
  vm.runInNewContext(`${source}\nthis.toggle = toggleEquipmentSelection;`, context);
  assert.deepEqual(Array.from(context.toggle(['barbell'], 'bodyweight_only')), ['bodyweight_only']);
  assert.deepEqual(Array.from(context.toggle(['bodyweight_only'], 'dumbbells')), ['dumbbells']);
  assert.deepEqual(Array.from(context.toggle(['bodyweight_only'], 'bodyweight_only')), []);
});

 test('profile provisioning preserves an existing onboarded profile', async () => {
  let stored = { uid: 'u', displayName: 'Existing', onboardingComplete: true, profile: { age: 30 } };
  const context = {
    db: {}, doc: () => ({}), serverTimestamp: () => 'timestamp',
    runTransaction: async (_db, callback) => callback({
      get: async () => ({ exists: () => Boolean(stored), data: () => stored }),
      set: (_ref, value) => { stored = value; },
      update: (_ref, value) => { stored = { ...stored, ...value }; },
    }),
  };
  let source = fs.readFileSync(path.join(__dirname, '../services/userProvisioning.js'), 'utf8');
  source = source.replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  vm.runInNewContext(`${source}\nthis.ensure = ensureUserDocument;`, context);
  await context.ensure({ uid: 'u', email: 'a@example.test' }, 'New name');
  assert.equal(stored.displayName, 'Existing');
  assert.equal(stored.onboardingComplete, true);
  assert.equal(stored.profile.age, 30);
  stored = null;
  await context.ensure({ uid: 'u', email: 'a@example.test' }, 'New name');
  assert.equal(stored.uid, 'u');
  assert.equal(stored.displayName, 'New name');
  assert.equal(stored.onboardingComplete, false);
});

test('manual meal retry with the same operation ID does not duplicate a log', async () => {
  const { actions, data } = loadActions('nutritionLogActions.js', { nutritionLog: { meals: [] } });
  const args = { uid: 'u', dateId: 'day', entry: { operationId: 'op-1', aiEstimate: { calories: 150 } } };
  await actions.appendLoggedMeal(args);
  await actions.appendLoggedMeal(args);
  await actions.appendLoggedMeal({ ...args, entry: { ...args.entry, operationId: 'op-2' } });
  assert.equal(data().nutritionLog.meals.length, 2);
  assert.equal(data().nutritionLog.aiEstimatedTotals.calories, 300);
});

test('exercise targets retain repetitions, durations and distances', () => {
  const source = fs.readFileSync(path.join(__dirname, '../services/exerciseTarget.js'), 'utf8').replace(/export /g, '');
  const context = {};
  vm.runInNewContext(`${source}\nthis.target = exerciseTarget;`, context);
  const check = (input, unit, value) => {
    const result = context.target(input);
    assert.equal(result.unit, unit);
    assert.equal(result.value, value);
  };
  check({ repsRange: '8-12' }, 'reps', 8);
  check({ repsRange: '30s' }, 'seconds', 30);
  check({ repsRange: '2 minutes' }, 'seconds', 120);
  check({ repsRange: '1 km' }, 'meters', 1000);
  check({ repsRange: '30s', targetUnit: 'seconds', targetValue: 45 }, 'seconds', 45);
});


test('plan and revision distinguish logged meals, including legacy plans', async () => {
  const old = { mealId: 'meal-1', revision: 'original', mealType: 'lunch', description: 'rice', calories: 10, proteinG: 1, carbsG: 2, fatsG: 3 };
  const { actions, data } = loadActions('mealPlanActions.js', { weeklyMealSchedule: [{ dayLabel: 'Monday', meals: [old] }] });
  const key = actions.mealKey('plan-1', 'Monday', 0, old);
  assert.notEqual(key, actions.mealKey('plan-2', 'Monday', 0, old));
  await actions.replaceMeal({ uid: 'u', planId: 'plan-1', dayLabel: 'Monday', index: 0, expectedMeal: old, replacement: { ...old, description: 'beans' } });
  const replacement = data().weeklyMealSchedule[0].meals[0];
  assert.equal(replacement.mealId, old.mealId);
  assert.notEqual(key, actions.mealKey('plan-1', 'Monday', 0, replacement));
  const legacy = { mealType: 'lunch' };
  assert.notEqual(actions.mealKey('plan-1', 'Monday', 0, legacy), actions.mealKey('plan-2', 'Monday', 0, legacy));
  assert.notEqual(actions.mealKey('plan-1', 'Monday', 0, legacy), 'Monday:lunch:0');
});

test('request versions discard late results after edits, newer requests or closing', () => {
  const source = fs.readFileSync(path.join(__dirname, '../services/requestVersion.js'), 'utf8').replace(/export /g, '');
  const context = {};
  vm.runInNewContext(`${source}\nthis.create = createRequestVersion;`, context);
  const gate = context.create();
  const first = gate.next();
  gate.invalidate();
  assert.equal(gate.isCurrent(first), false);
  const second = gate.next();
  const third = gate.next();
  assert.equal(gate.isCurrent(second), false);
  assert.equal(gate.isCurrent(third), true);
  gate.invalidate();
  assert.equal(gate.isCurrent(third), false);
});

test('streaks follow scheduled days, not calendar-day gaps', () => {
  const source = fs.readFileSync(path.join(__dirname, '../services/workoutStreak.js'), 'utf8').replace(/export /g, '');
  const context = {};
  vm.runInNewContext(`${source}\nthis.current = currentWorkoutStreak; this.next = streakAfterWorkout;`, context);
  const schedule = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((dayLabel) => ({ dayLabel, isRestDay: !['Monday', 'Wednesday', 'Friday'].includes(dayLabel) }));
  const stats = { lastWorkoutDate: '2026-10-26', currentStreakDays: 3 };
  assert.equal(context.current(stats, schedule, '2026-10-28'), 3);
  assert.equal(context.next(stats, schedule, '2026-10-28'), 4);
  assert.equal(context.current(stats, schedule, '2026-10-29'), 0);
  assert.equal(context.next(stats, schedule, '2026-10-30'), 1);
  assert.equal(context.next(stats, schedule, '2026-10-27'), null);
  assert.equal(context.next(stats, schedule, '2026-10-26'), 3);
  assert.equal(context.next(stats, schedule, '2026-10-23'), null);
});

test('voice timers belong to a recording and auto-stop transcribes once', async () => {
  let callback;
  let stops = 0;
  let auto = null;
  const recorder = { uri: 'recording', record() {}, prepareToRecordAsync: async () => {}, stop: async () => { stops += 1; } };
  const user = { getIdToken: async () => 'test-token' };
  const context = {
    AudioModule: { requestRecordingPermissionsAsync: async () => ({ granted: true }) },
    RecordingPresets: { HIGH_QUALITY: {} }, setAudioModeAsync: async () => {},
    useAudioRecorder: () => recorder, useCallback: (fn) => fn,
    useState: (initial) => [initial, () => {}], useRef: (value) => ({ current: value }),
    useEffect: (fn) => { fn(); },
    useUIStore: (selector) => selector({ showError: () => {} }), auth: { currentUser: user },
    setTimeout: (fn) => { callback = fn; return 1; }, clearTimeout: () => {},
    AbortController, FormData: class { append() {} },
    fetch: async () => ({ ok: true, json: async () => ({ data: { transcript: 'hello' } }) }),
    process: { env: {} },
  };
  let source = fs.readFileSync(path.join(__dirname, '../hooks/useVoiceCapture.js'), 'utf8');
  source = source.replace(/^import[\s\S]*?from '[^']+';\r?\n/gm, '').replace(/export /g, '');
  vm.runInNewContext(`${source}\nthis.useVoice = useVoiceCapture;`, context);
  const voice = context.useVoice({ onAutoTranscript: (value) => { auto = value; } });
  assert.equal(await voice.startRecording(), true);
  const oldTimer = callback;
  assert.equal(await voice.stopAndTranscribe(), 'hello');
  assert.equal(await voice.startRecording(), true);
  oldTimer();
  assert.equal(stops, 1);
  callback();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(stops, 2);
  assert.equal(auto, 'hello');
  assert.equal(await voice.stopAndTranscribe(), null);
});

test('local date refreshes when a suspended app returns after midnight', () => {
  let now = new Date(2026, 9, 26, 23, 59, 59);
  let stored;
  let foreground;
  class FakeDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now.getTime()])); }
  }
  const context = {
    Date: FakeDate,
    useState: (initial) => { stored = initial(); return [stored, (value) => { stored = value; }]; },
    useEffect: (fn) => { fn(); },
    AppState: { addEventListener: (_event, listener) => { foreground = listener; return { remove() {} }; } },
    setTimeout: () => 1, clearTimeout: () => {}, setInterval: () => 1, clearInterval: () => {},
  };
  let source = fs.readFileSync(path.join(__dirname, '../hooks/useToday.js'), 'utf8');
  source = source.replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  vm.runInNewContext(`${source}\nthis.useToday = useToday;`, context);
  context.useToday();
  assert.equal(stored, '2026-10-26');
  now = new Date(2026, 9, 27, 0, 1);
  foreground('active');
  assert.equal(stored, '2026-10-27');
});

test('nutrition writes preserve daily-log creation metadata', async () => {
  const { actions, data } = loadActions('nutritionLogActions.js', { createdAt: 'original', nutritionLog: { meals: [] } });
  await actions.appendLoggedMeal({ uid: 'u', dateId: 'day', entry: { aiEstimate: { calories: 100 } } });
  assert.equal(data().createdAt, 'original');
  assert.equal(data().updatedAt, 'timestamp');
});

test('document reads hide old-path data and retry reads the server', async () => {
  const values = [];
  let cursor = 0;
  let effects = [];
  let snapshot;
  let serverReads = 0;
  const context = {
    db: {}, doc: (_db, path) => ({ path }),
    getDocFromServer: async () => { serverReads += 1; },
    onSnapshot: (_ref, _options, next) => { snapshot = next; return () => {}; },
    useCallback: (fn) => fn,
    useState: (initial) => {
      const slot = cursor++;
      if (!(slot in values)) values[slot] = initial;
      return [values[slot], (update) => { values[slot] = typeof update === 'function' ? update(values[slot]) : update; }];
    },
    useEffect: (fn) => effects.push(fn),
  };
  let source = fs.readFileSync(path.join(__dirname, '../hooks/useFirestoreDoc.js'), 'utf8');
  source = source.replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  vm.runInNewContext(`${source}\nthis.read = useFirestoreDoc;`, context);
  const render = (path) => { cursor = 0; effects = []; return context.read(path); };
  render('users/a');
  effects.forEach((effect) => effect());
  snapshot({ exists: () => true, id: 'a', data: () => ({ value: 'old' }), metadata: { fromCache: false } });
  assert.equal(render('users/a').data.value, 'old');
  const changed = render('users/b');
  assert.equal(changed.data, null);
  assert.equal(changed.isLoading, true);
  await changed.retry();
  assert.equal(serverReads, 1);
});

test('collection reads isolate query keys and surface listener failures', async () => {
  const values = [];
  let cursor = 0;
  let effects = [];
  let onNext;
  let onError;
  let serverReads = 0;
  const context = {
    db: {}, collection: (_db, path) => path, query: (...args) => args,
    getDocsFromServer: async () => { serverReads += 1; },
    onSnapshot: (_query, _options, next, error) => { onNext = next; onError = error; return () => {}; },
    useCallback: (fn) => fn,
    useRef: (value) => { const slot = cursor++; if (!(slot in values)) values[slot] = { current: value }; return values[slot]; },
    useState: (initial) => { const slot = cursor++; if (!(slot in values)) values[slot] = initial; return [values[slot], (update) => { values[slot] = typeof update === 'function' ? update(values[slot]) : update; }]; },
    useEffect: (fn) => effects.push(fn),
  };
  let source = fs.readFileSync(path.join(__dirname, '../hooks/useFirestoreCollection.js'), 'utf8');
  source = source.replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  vm.runInNewContext(`${source}\nthis.read = useFirestoreCollection;`, context);
  const render = (key) => { cursor = 0; effects = []; return context.read('users/a/dailyLogs', [], key); };
  render('week-1');
  effects.forEach((effect) => effect());
  onNext({ docs: [{ id: '1', data: () => ({ value: 'old' }) }], metadata: { fromCache: false } });
  assert.equal(render('week-1').data[0].value, 'old');
  const changed = render('week-2');
  assert.equal(changed.data.length, 0);
  assert.equal(changed.isLoading, true);
  effects.forEach((effect) => effect());
  onError(new Error('denied'));
  assert.equal(render('week-2').error.message, 'denied');
  await render('week-2').retry();
  assert.equal(serverReads, 1);
});

test('new nutrition logs receive creation metadata', async () => {
  const { actions, data } = loadActions('nutritionLogActions.js', null);
  await actions.appendLoggedMeal({ uid: 'u', dateId: 'day', entry: { aiEstimate: { calories: 50 } } });
  assert.equal(data().createdAt, 'timestamp');
  assert.equal(data().updatedAt, 'timestamp');
});
