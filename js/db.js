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
const DB_VERSION = 1;
export const SCHEMA_VERSION = 1;

const STORE_EX = 'exercises';
const STORE_SE = 'sessions';

let _db = null;

/** Open (and if needed create) the database. Cached after the first call. */
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

/* -------------------------------------------------------------- settings */

const SETTINGS_KEY = 'flexloop.settings';

const DEFAULT_SETTINGS = {
  unit: 'kg',              // display unit for every weight
  theme: 'dark',
  restTimerSeconds: 120,
  restTimerAuto: true,     // start the timer when a set is marked done
  weightStep: 2.5,
  repStep: 1,
  lastExportAt: 0,
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return Object.assign({}, DEFAULT_SETTINGS, raw ? JSON.parse(raw) : {});
  } catch (err) {
    console.warn('settings unreadable, using defaults', err);
    return Object.assign({}, DEFAULT_SETTINGS);
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
  const [exercises, sessions] = await Promise.all([allExercises(), allSessions()]);
  return {
    schemaVersion: SCHEMA_VERSION,
    app: 'flexloop',
    exportedAt: new Date().toISOString(),
    exercises,
    sessions: sessions.slice().sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0)),
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
  return true;
}

/**
 * mode 'replace' wipes first; mode 'merge' keeps anything already stored and
 * lets the incoming file win on id collisions.
 */
export async function importAll(data, mode = 'replace') {
  validateBackup(data);
  if (mode === 'replace') {
    await clear(STORE_EX);
    await clear(STORE_SE);
  }
  await putMany(STORE_EX, data.exercises);
  await putMany(STORE_SE, data.sessions);
  if (data.settings && mode === 'replace') {
    saveSettings(Object.assign({}, DEFAULT_SETTINGS, data.settings));
  }
  return { exercises: data.exercises.length, sessions: data.sessions.length };
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

export { STORE_EX, STORE_SE };
