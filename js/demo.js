/* =========================================================================
   demo.js — the sample dataset behind "Load sample data".

   Six months of a Push / Pull / Legs split, two sessions one week and one
   the next, generated backwards from the most recent Monday so the newest
   session is always a few days old and every chart has something recent to
   draw.

   Two rules this file lives by:

     1. Every id is deterministic (`ex_demo_…`, `s_demo_…`, `r_demo_…`).
        Loading twice in the same week overwrites rather than duplicates,
        and "Remove sample data" can find its own records again later.
     2. Nothing here touches settings. The returned object has no `settings`
        key at all, and it goes in through db.importAll(…, 'merge'), which
        would ignore one anyway.

   Weights are built on a kg scale and converted on the way out if the app
   is set to lb, so the numbers read plausibly either way.
   ========================================================================= */

import { SCHEMA_VERSION } from './db.js';
import { localDate } from './stats.js';

const WEEKS = 26;

/**
 * Which weeks get deloaded, counted from the oldest. Around month four, and
 * two weeks rather than one because a fortnight is exactly one turn of the
 * split — so every lift takes the dip, not just whichever one fell that week.
 * A straight line up for six months would make every PR look free, and the
 * finish-session read-out would never once say you were down on last time.
 */
const DELOAD_WEEKS = [17, 18];

/**
 * Day-of-week and clock time for each session, indexed by week parity: two
 * sessions one week, one the next. The current week is always a two.
 */
const SLOTS = [
  [[0, 18, 30], [3, 18, 15]],   // Monday, Thursday
  [[1, 19, 0]],                 // Tuesday
];

/**
 * The split. `load` and `step` are kilograms; `steps` is how many increments
 * the lift earns across the whole six months, spent fastest at the start.
 * `repSteps` does the same job for a lift carrying no load.
 */
const PLAN = [
  {
    split: 'Push',
    exercises: [
      { key: 'bench_press',      name: 'Bench Press',           load: 60,   step: 2.5,  steps: 5, sets: 3, reps: 6 },
      { key: 'overhead_press',   name: 'Overhead Press',        load: 35,   step: 2.5,  steps: 4, sets: 3, reps: 6 },
      { key: 'incline_db_press', name: 'Incline Dumbbell Press', load: 22.5, step: 2.5, steps: 4, sets: 3, reps: 10 },
      { key: 'cable_fly',        name: 'Cable Fly',             load: 15,   step: 2.5,  steps: 3, sets: 3, reps: 12 },
      { key: 'triceps_pushdown', name: 'Triceps Pushdown',      load: 25,   step: 2.5,  steps: 4, sets: 3, reps: 12 },
    ],
  },
  {
    split: 'Pull',
    exercises: [
      { key: 'deadlift',    name: 'Deadlift',       load: 90,   step: 5,    steps: 4, sets: 3, reps: 5 },
      { key: 'barbell_row', name: 'Barbell Row',    load: 55,   step: 2.5,  steps: 5, sets: 3, reps: 8 },
      { key: 'pull_up',     name: 'Pull-Up',        load: 0,    step: 0,    steps: 0, sets: 3, reps: 6, repSteps: 5 },
      { key: 'face_pull',   name: 'Face Pull',      load: 20,   step: 2.5,  steps: 3, sets: 3, reps: 15 },
      { key: 'db_curl',     name: 'Dumbbell Curl',  load: 12.5, step: 1.25, steps: 4, sets: 3, reps: 10 },
    ],
  },
  {
    split: 'Legs',
    exercises: [
      { key: 'back_squat',        name: 'Back Squat',          load: 75,  step: 5,   steps: 4, sets: 3, reps: 5 },
      { key: 'romanian_deadlift', name: 'Romanian Deadlift',   load: 60,  step: 2.5, steps: 5, sets: 3, reps: 8 },
      { key: 'leg_press',         name: 'Leg Press',           load: 120, step: 10,  steps: 3, sets: 3, reps: 10 },
      { key: 'leg_curl',          name: 'Seated Leg Curl',     load: 35,  step: 5,   steps: 3, sets: 3, reps: 12 },
      { key: 'calf_raise',        name: 'Standing Calf Raise', load: 50,  step: 5,   steps: 4, sets: 3, reps: 15 },
    ],
  },
];

const exerciseId = (key) => `ex_demo_${key}`;

const roundTo = (v, q) => (q > 0 ? Math.round(v / q) * q : Math.round(v));

/**
 * Increments earned after n exposures. Saturating rather than linear: most
 * of the progress lands in the first two months and then flattens, which is
 * what novice progress actually looks like and what makes the trend line
 * worth drawing.
 */
function stepsAt(n, max) {
  if (!max) return 0;
  return Math.round(max * (1 - Math.exp(-n / 4)));
}

/** Midnight on the most recent Monday, local time. */
function lastMonday(now) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/** Every session slot in the six months, oldest first, nothing in the future. */
function sessionSlots(now) {
  const monday = lastMonday(now);
  const out = [];
  for (let w = 0; w < WEEKS; w++) {
    for (const [dow, h, m] of SLOTS[(w + 1) % 2]) {
      const at = new Date(monday);
      at.setDate(at.getDate() - (WEEKS - 1 - w) * 7 + dow);
      at.setHours(h, m, 0, 0);
      if (at.getTime() <= now.getTime()) out.push({ at, week: w });
    }
  }
  return out;
}

/**
 * A backup-shaped object, ready for db.importAll(data, 'merge') — same
 * envelope parseStrongifyCsv returns, so validateBackup and putMany do the
 * work. Deliberately has no `settings` key.
 */
export function buildDemoData({ unit = 'kg', now = new Date() } = {}) {
  // Stored weights are unit-agnostic; only the reading changes. Nearest 5 lb
  // keeps the figures looking like plates rather than a conversion.
  const scale = unit === 'lb' ? (v) => Math.round((v * 2.20462) / 5) * 5 : (v) => v;

  const exercises = PLAN.flatMap((p) => p.exercises.map((ex) => ({
    id: exerciseId(ex.key),
    name: ex.name,
    muscleGroup: p.split,
    unit,
    isBodyweight: !ex.load,
  })));

  const slots = sessionSlots(now);
  const sessions = [];
  const lastUsed = new Map();

  slots.forEach((slot, i) => {
    const plan = PLAN[i % PLAN.length];
    // Each split comes round every third session, so that is its exposure count.
    const n = Math.floor(i / PLAN.length);
    const deload = DELOAD_WEEKS.includes(slot.week);
    const startedAt = slot.at.getTime();

    const entries = plan.exercises.map((ex, idx) => {
      const count = deload ? Math.max(2, ex.sets - 1) : ex.sets;
      const grown = ex.load + stepsAt(n, ex.steps) * ex.step;
      const weight = ex.load ? (deload ? roundTo(grown * 0.9, ex.step) : grown) : 0;
      const reps = ex.reps + stepsAt(n, ex.repSteps) - (deload && ex.repSteps ? 1 : 0);

      const sets = [];
      // One warmup on the day's opener, so the warmup rendering has something
      // to show. Warmups are excluded from every stat either way.
      if (idx === 0 && weight > 0) {
        sets.push({ weight: scale(roundTo(weight * 0.5, ex.step)), reps: 8, rpe: null, isWarmup: true, done: true });
      }
      for (let j = 0; j < count; j++) {
        // The last set of a short-rep lift gives one rep back.
        const drop = j === count - 1 && count > 2 && reps <= 8 ? 1 : 0;
        sets.push({
          weight: scale(weight),
          reps: Math.max(1, reps - drop),
          rpe: null,
          isWarmup: false,
          // Anything but true contributes nothing to volume, PRs or charts.
          done: true,
        });
      }
      return { exerciseId: exerciseId(ex.key), sets };
    });

    const totalSets = entries.reduce((sum, e) => sum + e.sets.length, 0);
    const date = localDate(slot.at);
    sessions.push({
      id: `s_demo_${date.replace(/-/g, '_')}`,
      date,
      startedAt,
      // Never null: a session without an end reads as still in progress and
      // the Log would open mid-workout.
      endedAt: startedAt + (10 + totalSets * 3.5) * 60000,
      notes: plan.split,
      entries,
      source: 'demo',
    });
    lastUsed.set(plan.split, startedAt);
  });

  const createdAt = sessions.length ? sessions[0].startedAt : Date.now();
  const routines = PLAN.map((p) => ({
    id: `r_demo_${p.split.toLowerCase()}`,
    name: p.split,
    items: p.exercises.map((ex) => ({ exerciseId: exerciseId(ex.key), sets: ex.sets })),
    createdAt,
    updatedAt: createdAt,
    lastUsedAt: lastUsed.get(p.split) || null,
  }));

  return {
    schemaVersion: SCHEMA_VERSION,
    app: 'flexloop',
    exercises,
    sessions,
    routines,
  };
}

/** True if a record came from here. Used by "Remove sample data". */
export const isDemoExercise = (id) => String(id).startsWith('ex_demo_');
export const isDemoRoutine = (id) => String(id).startsWith('r_demo_');
