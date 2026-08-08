/* =========================================================================
   importers.js — bring history in from other apps.

   Currently handles the Strongify CSV backup, whose columns are:
     App Version, Routine Name, Exercise Name, Exercise Type,
     Weight, Rep, Duration, Date

   Two quirks that file has, which this parser tolerates:
     1. The header has a leading space before each column name.
     2. Exercise names can contain a raw newline mid-field without being
        quoted, which breaks any naive line-per-row split. We reassemble
        a record until it has all eight fields.
   ========================================================================= */

import { SCHEMA_VERSION } from './db.js';
import { localDate } from './stats.js';

/** Split one CSV line into fields, honouring double quotes. */
function splitFields(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

/** Yield 8-field records, stitching lines back together where needed. */
function records(text, expected = 8) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let buf = '';
  for (const line of lines) {
    buf = buf ? `${buf}\n${line}` : line;
    if (!buf.trim()) { buf = ''; continue; }
    const f = splitFields(buf);
    if (f.length >= expected) {
      out.push(f);
      buf = '';
    }
  }
  if (buf.trim()) out.push(splitFields(buf));
  return out;
}

function slug(name) {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48) || 'exercise';
}

export function looksLikeStrongify(text) {
  const head = text.slice(0, 400).toLowerCase();
  return head.includes('exercise name') && head.includes('routine name');
}

/**
 * Returns a backup-shaped object ready for db.importAll(..., 'merge').
 * Sets from the same calendar day become one session.
 */
export function parseStrongifyCsv(text) {
  const rows = records(text, 8);
  if (!rows.length) throw new Error('That CSV had no rows in it.');

  const head = rows[0].map((h) => h.trim().toLowerCase());
  const hasHeader = head.includes('exercise name');
  const col = (name, fallback) => {
    const i = head.indexOf(name);
    return i === -1 ? fallback : i;
  };
  const cRoutine = hasHeader ? col('routine name', 1) : 1;
  const cName = hasHeader ? col('exercise name', 2) : 2;
  const cWeight = hasHeader ? col('weight', 4) : 4;
  const cReps = hasHeader ? col('rep', 5) : 5;
  const cDur = hasHeader ? col('duration', 6) : 6;
  const cDate = hasHeader ? col('date', 7) : 7;

  const exercises = new Map();   // id -> exercise
  const days = new Map();        // YYYY-MM-DD -> { entries: Map, routines: Set, ts }
  let skipped = 0;

  for (let i = hasHeader ? 1 : 0; i < rows.length; i++) {
    const f = rows[i];
    const rawName = (f[cName] || '').replace(/\s*\n\s*/g, ' ').trim();
    const when = new Date((f[cDate] || '').trim());
    if (!rawName || isNaN(when.getTime())) { skipped++; continue; }

    const weight = parseFloat(f[cWeight]) || 0;
    const reps = parseInt(f[cReps], 10) || 0;
    const duration = parseInt(f[cDur], 10) || 0;
    if (!reps && !duration) { skipped++; continue; }

    const id = `ex_${slug(rawName)}`;
    if (!exercises.has(id)) {
      exercises.set(id, {
        id,
        name: rawName,
        muscleGroup: (f[cRoutine] || 'Imported').trim() || 'Imported',
        unit: 'kg',
        isBodyweight: true, // provisional; cleared below if any load appears
      });
    }
    if (weight > 0) exercises.get(id).isBodyweight = false;

    const date = localDate(when);
    if (!days.has(date)) {
      days.set(date, { entries: new Map(), routines: new Set(), ts: when.getTime(), end: when.getTime() });
    }
    const day = days.get(date);
    day.ts = Math.min(day.ts, when.getTime());
    day.end = Math.max(day.end, when.getTime());
    if (f[cRoutine] && f[cRoutine].trim()) day.routines.add(f[cRoutine].trim());
    if (!day.entries.has(id)) day.entries.set(id, []);
    day.entries.get(id).push({
      weight,
      reps,
      rpe: null,
      isWarmup: false,
      done: true,
      duration: duration || undefined,
      _t: when.getTime(),
    });
  }

  const sessions = [];
  for (const [date, day] of days) {
    const entries = [];
    for (const [exerciseId, sets] of day.entries) {
      sets.sort((a, b) => a._t - b._t);
      entries.push({ exerciseId, sets: sets.map(({ _t, ...s }) => s) });
    }
    sessions.push({
      id: `s_${date.replace(/-/g, '_')}_import`,
      date,
      startedAt: day.ts,
      // Imported sessions are finished by definition — without endedAt the app
      // would treat the newest one as still in progress.
      endedAt: day.end,
      notes: [...day.routines].join(' · '),
      entries,
      source: 'strongify',
    });
  }
  sessions.sort((a, b) => a.startedAt - b.startedAt);

  return {
    schemaVersion: SCHEMA_VERSION,
    app: 'flexloop',
    exercises: [...exercises.values()],
    sessions,
    _report: { sessions: sessions.length, exercises: exercises.size, skipped },
  };
}
