/* =========================================================================
   db.js — storage layer

   Sessions and exercises live in IndexedDB. Settings live in localStorage
   because they are tiny and we want them synchronously at first paint.

   WARNING (iOS): Safari can evict the storage of a site that has not been
   used in a while — roughly 7 days of no interaction for non-installed
   sites. Adding to the Home Screen and calling navigator.storage.persist()
   both reduce the risk, but neither is a guarantee. This is exactly why
   Export exists and why the app nags you to use it. Export is the backup;
   IndexedDB is only the working copy.
   ========================================================================= */

const DB_NAME = 'flexloop';
const DB_VERSION = 2;
export const SCHEMA_VERSION = 2;

const STORE_EX = 'exercises';
const STORE_SE = 'sessions';
const STORE_RO = 'routines';

let _db = null;

/**
 * Open (and if needed create) the database. Cached after the first call.
 *
 * Every store is created behind a `contains` check, so this upgrade path is
 * additive: a v1 database gains `routines` and keeps its rows.
 */
export function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_EX)) {
        db.createObjectStore(STORE_EX, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_SE)) {
        const s = db.createObjectStore(STORE_SE, { keyPath: 'id' });
        s.createIndex('date', 'date', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_RO)) {
        db.createObjectStore(STORE_RO, { keyPath: 'id' });
      }
      void e;
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode) {
  return openDB().then((db) => db.transaction(store, mode).objectStore(store));
}

function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const get     = (store, id)  => tx(store, 'readonly').then((s) => wrap(s.get(id)));
export const getAll  = (store)      => tx(store, 'readonly').then((s) => wrap(s.getAll()));
export const put     = (store, obj) => tx(store, 'readwrite').then((s) => wrap(s.put(obj)));
export const del     = (store, id)  => tx(store, 'readwrite').then((s) => wrap(s.delete(id)));
export const clear   = (store)      => tx(store, 'readwrite').then((s) => wrap(s.clear()));

export function putMany(store, objs) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readwrite');
    const s = t.objectStore(store);
    objs.forEach((o) => s.put(o));
    t.oncomplete = () => resolve(objs.length);
    t.onerror = () => reject(t.error);
  }));
}

/* ------------------------------------------------------------- exercises */

export const allExercises = () => getAll(STORE_EX);
export const saveExercise = (ex) => put(STORE_EX, ex);
export const deleteExercise = (id) => del(STORE_EX, id);

/* -------------------------------------------------------------- sessions */

/** Sessions, newest first. */
export function allSessions() {
  return getAll(STORE_SE).then((list) =>
    list.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
  );
}
export const getSession = (id) => get(STORE_SE, id);
export const saveSession = (s) => put(STORE_SE, s);
export const deleteSession = (id) => del(STORE_SE, id);

/* -------------------------------------------------------------- routines */

/**
 * A routine is an ordered exercise list and nothing more:
 *   { id, name, items: [{ exerciseId, sets }], createdAt, updatedAt, lastUsedAt }
 *
 * Deliberately no target weights. Sets already prefill from the last time you
 * trained the exercise, so a stored target would be a second, staler source of
 * the same number.
 */
export const allRoutines = () => getAll(STORE_RO);
export const saveRoutine = (r) => put(STORE_RO, r);
export const deleteRoutine = (id) => del(STORE_RO, id);

/* -------------------------------------------------------------- settings */

const SETTINGS_KEY = 'flexloop.settings';

/**
 * The values the Rest timer, Weight step and Averaged over dropdowns offer.
 * They are stored rather than hard-coded because the Settings tab lets you
 * edit all three lists — 3.75 kg plates, a 75 second rest and a 6-session
 * average are perfectly reasonable and nothing in the app should have an
 * opinion about them.
 */
export const DEFAULT_REST_OPTIONS = [60, 90, 120, 150, 180, 240, 300];
export const DEFAULT_WEIGHT_STEPS = [1, 1.25, 2.5, 5];
export const DEFAULT_TREND_PERIODS = [3, 5, 8, 10, 12];

const DEFAULT_SETTINGS = {
  unit: 'kg',              // display unit for every weight
  theme: 'dark',           // 'dark' | 'light' | 'auto' (follow the system)
  // Tab bar height: 'comfortable' | 'compact'. See --tab-row in app.css.
  tabBarDensity: 'comfortable',
  restTimerSeconds: 120,
  restTimerOptions: DEFAULT_REST_OPTIONS,
  restTimerAuto: true,     // start the timer when a set is marked done
  weightStep: 2.5,
  weightStepOptions: DEFAULT_WEIGHT_STEPS,
  repStep: 1,
  lastExportAt: 0,
  // Trend line drawn over "Volume per session": 'off' | 'sma' | 'ema',
  // averaged over this many sessions. See stats.movingAverage.
  volumeTrend: 'sma',
  volumeTrendPeriod: 5,
  volumeTrendPeriodOptions: DEFAULT_TREND_PERIODS,
  // The metric the Log's "beat it" line targets: 'off' | 'e1rm' | 'weight' |
  // 'reps' | 'volume'. See stats.boostTarget.
  boostMetric: 'e1rm',
};

/**
 * Fill in anything the stored object is missing.
 *
 * The three list settings are copied, never shared: Object.assign would hand
 * out the very array held by DEFAULT_SETTINGS, and the first edit in the
 * option editor would then rewrite the defaults for the rest of the session.
 */
function withDefaults(stored) {
  const s = Object.assign({}, DEFAULT_SETTINGS, stored || {});
  s.restTimerOptions = Array.isArray(s.restTimerOptions)
    ? s.restTimerOptions.slice() : DEFAULT_REST_OPTIONS.slice();
  s.weightStepOptions = Array.isArray(s.weightStepOptions)
    ? s.weightStepOptions.slice() : DEFAULT_WEIGHT_STEPS.slice();
  s.volumeTrendPeriodOptions = Array.isArray(s.volumeTrendPeriodOptions)
    ? s.volumeTrendPeriodOptions.slice() : DEFAULT_TREND_PERIODS.slice();
  return s;
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return withDefaults(raw ? JSON.parse(raw) : null);
  } catch (err) {
    console.warn('settings unreadable, using defaults', err);
    return withDefaults(null);
  }
}

export function saveSettings(s) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch (err) {
    console.warn('settings could not be written', err);
  }
  return s;
}

/* --------------------------------------------------------- export/import */

/** The whole database as one plain object — the shape written to .json. */
export async function exportAll() {
  const [exercises, sessions, routines] = await Promise.all([
    allExercises(), allSessions(), allRoutines(),
  ]);
  return {
    schemaVersion: SCHEMA_VERSION,
    app: 'flexloop',
    exportedAt: new Date().toISOString(),
    exercises,
    sessions: sessions.slice().sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0)),
    routines,
    settings: loadSettings(),
  };
}

/** Throws a human-readable Error if the file isn't something we can restore. */
export function validateBackup(data) {
  if (!data || typeof data !== 'object') throw new Error('That file is not a flexloop backup.');
  if (typeof data.schemaVersion !== 'number') throw new Error('Missing schemaVersion — not a flexloop backup.');
  if (data.schemaVersion > SCHEMA_VERSION) {
    throw new Error(`Backup is schema v${data.schemaVersion}; this build reads up to v${SCHEMA_VERSION}. Update the app first.`);
  }
  if (!Array.isArray(data.sessions) || !Array.isArray(data.exercises)) {
    throw new Error('Backup is missing its sessions or exercises list.');
  }
  // Routines arrived in schema v2. A v1 file simply has none, which is fine.
  if (data.routines != null && !Array.isArray(data.routines)) {
    throw new Error('Backup has a routines field that is not a list.');
  }
  return true;
}

/**
 * mode 'replace' wipes first; mode 'merge' keeps anything already stored and
 * lets the incoming file win on id collisions.
 */
export async function importAll(data, mode = 'replace') {
  validateBackup(data);
  const routines = Array.isArray(data.routines) ? data.routines : [];
  if (mode === 'replace') {
    await clear(STORE_EX);
    await clear(STORE_SE);
    await clear(STORE_RO);
  }
  await putMany(STORE_EX, data.exercises);
  await putMany(STORE_SE, data.sessions);
  if (routines.length) await putMany(STORE_RO, routines);
  if (data.settings && mode === 'replace') {
    saveSettings(withDefaults(data.settings));
  }
  return {
    exercises: data.exercises.length,
    sessions: data.sessions.length,
    routines: routines.length,
  };
}

/** Ask the browser not to evict us. Safe to call on every start. */
export async function requestPersistence() {
  if (!navigator.storage || !navigator.storage.persist) return null;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch (err) {
    console.warn('persistence request failed', err);
    return null;
  }
}

export async function storageEstimate() {
  if (!navigator.storage || !navigator.storage.estimate) return null;
  try { return await navigator.storage.estimate(); } catch { return null; }
}

export { STORE_EX, STORE_SE, STORE_RO };
