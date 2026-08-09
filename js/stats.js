/* =========================================================================
   stats.js — every number the app shows is computed here.

   Estimated 1RM uses Epley:  weight × (1 + reps / 30)
   It is an estimate, and it drifts optimistic above ~12 reps. The UI always
   labels it, so nobody mistakes it for a tested max.
   ========================================================================= */

export const REP_TARGETS = [1, 3, 5, 8, 10, 12, 15];

/* ------------------------------------------------------------ date utils */

/** Local calendar date as YYYY-MM-DD. Never use toISOString() — that's UTC. */
export function localDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function parseLocalDate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function daysBetween(aIso, bIso) {
  const a = parseLocalDate(aIso), b = parseLocalDate(bIso);
  return Math.round((b - a) / 86400000);
}

/* Dates read the same on every phone. The device locale would otherwise decide
   the month names, so the same chart says "20. Juli" on one handset and
   "20 Jul" on the next; the app is written in English, and its dates are too.
   en-GB keeps the day-first order the rest of the UI assumes. */
export const LOCALE = 'en-GB';

export function fmtDate(iso, opts = { day: 'numeric', month: 'short' }) {
  return parseLocalDate(iso).toLocaleDateString(LOCALE, opts);
}

export function fmtDateLong(iso) {
  return parseLocalDate(iso).toLocaleDateString(LOCALE, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

export function relativeDays(iso, today = localDate()) {
  const n = daysBetween(iso, today);
  if (n === 0) return 'today';
  if (n === 1) return 'yesterday';
  if (n < 7) return `${n} days ago`;
  if (n < 14) return 'last week';
  if (n < 60) return `${Math.round(n / 7)} weeks ago`;
  return `${Math.round(n / 30)} months ago`;
}

/** Monday-anchored start of the week containing `d`. */
export function weekStart(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7; // Mon = 0
  x.setDate(x.getDate() - dow);
  return x;
}

/* ---------------------------------------------------------------- format */

export function fmtNum(n, maxDp = 1) {
  if (!isFinite(n)) return '—';
  const r = Math.round(n * 10 ** maxDp) / 10 ** maxDp;
  return Number.isInteger(r) ? String(r) : r.toFixed(maxDp);
}

export function fmtVolume(n, unit) {
  // 'k' rather than tonnes, so the label stays honest in lb as well as kg.
  if (n >= 10000) return `${fmtNum(n / 1000, 1)}k ${unit}`;
  return `${fmtNum(n, 0)} ${unit}`;
}

/* ------------------------------------------------------------------ core */

export function epley(weight, reps) {
  const w = Number(weight) || 0;
  const r = Number(reps) || 0;
  if (w <= 0 || r <= 0) return 0;
  return w * (1 + r / 30);
}

/** Sets that count: completed, and not flagged as a warmup. */
export function countedSets(entry) {
  if (!entry || !Array.isArray(entry.sets)) return [];
  return entry.sets.filter((s) => s.done && !s.isWarmup);
}

export function volumeOfSets(sets) {
  return sets.reduce((t, s) => t + (Number(s.weight) || 0) * (Number(s.reps) || 0), 0);
}

export function bestE1rmSet(sets) {
  let best = null, bestVal = -1;
  for (const s of sets) {
    const v = epley(s.weight, s.reps);
    if (v > bestVal) { bestVal = v; best = s; }
  }
  return best ? { set: best, value: bestVal } : null;
}

export function topWeightSet(sets) {
  let best = null;
  for (const s of sets) {
    if (!best || (Number(s.weight) || 0) > (Number(best.weight) || 0)) best = s;
  }
  return best;
}

/** Total volume of a whole session across all exercises. */
export function sessionVolume(session) {
  return (session.entries || []).reduce((t, e) => t + volumeOfSets(countedSets(e)), 0);
}

export function sessionSetCount(session) {
  return (session.entries || []).reduce((t, e) => t + countedSets(e).length, 0);
}

/* ---------------------------------------------------------- per exercise */

/**
 * One data point per session in which the exercise was trained.
 * Ascending by time — charts and PR scans both want it that way.
 */
export function exerciseSeries(sessions, exerciseId) {
  const out = [];
  for (const s of sessions) {
    const entry = (s.entries || []).find((e) => e.exerciseId === exerciseId);
    if (!entry) continue;
    const sets = countedSets(entry);
    if (!sets.length) continue;
    const be = bestE1rmSet(sets);
    const tw = topWeightSet(sets);
    out.push({
      sessionId: s.id,
      date: s.date,
      ts: s.startedAt || parseLocalDate(s.date).getTime(),
      e1rm: be ? be.value : 0,
      e1rmSet: be ? be.set : null,
      topWeight: tw ? Number(tw.weight) || 0 : 0,
      topWeightReps: tw ? Number(tw.reps) || 0 : 0,
      volume: volumeOfSets(sets),
      reps: sets.reduce((t, x) => t + (Number(x.reps) || 0), 0),
      setCount: sets.length,
      sets,
    });
  }
  return out.sort((a, b) => a.ts - b.ts);
}

/** True when nothing in the history for this exercise carries a load. */
export function seriesIsBodyweight(series) {
  return series.length > 0 && series.every((p) => p.topWeight === 0);
}

/**
 * Best e1RM, best single weight, and best reps achieved at (or above) each
 * common rep count. "at each rep count" means: heaviest set that hit ≥ n reps.
 */
export function personalRecords(series) {
  const pr = { e1rm: null, weight: null, volume: null, byReps: {}, totalSets: 0, sessions: series.length };
  for (const p of series) {
    pr.totalSets += p.setCount;
    if (!pr.e1rm || p.e1rm > pr.e1rm.value) pr.e1rm = { value: p.e1rm, date: p.date, set: p.e1rmSet };
    if (!pr.volume || p.volume > pr.volume.value) pr.volume = { value: p.volume, date: p.date };
    for (const s of p.sets) {
      const w = Number(s.weight) || 0;
      const r = Number(s.reps) || 0;
      if (!pr.weight || w > pr.weight.value) pr.weight = { value: w, reps: r, date: p.date };
      for (const t of REP_TARGETS) {
        if (r >= t && (!pr.byReps[t] || w > pr.byReps[t].value)) {
          pr.byReps[t] = { value: w, reps: r, date: p.date };
        }
      }
    }
  }
  return pr;
}

/** Most recent completed set of an exercise — the source of the ghost line. */
export function lastPerformance(sessions, exerciseId, excludeSessionId = null) {
  const sorted = sessions
    .filter((s) => s.id !== excludeSessionId)
    .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
  for (const s of sorted) {
    const entry = (s.entries || []).find((e) => e.exerciseId === exerciseId);
    if (!entry) continue;
    const sets = entry.sets.filter((x) => x.done);
    if (!sets.length) continue;
    const top = topWeightSet(sets) || sets[sets.length - 1];
    return {
      date: s.date,
      sessionId: s.id,
      sets,
      top,
      weight: Number(top.weight) || 0,
      reps: Number(top.reps) || 0,
      volume: volumeOfSets(countedSets(entry)),
    };
  }
  return null;
}

/** Last date each exercise was trained, newest first; nulls last. */
export function lastTrainedMap(sessions) {
  const map = new Map();
  for (const s of sessions) {
    for (const e of s.entries || []) {
      const cur = map.get(e.exerciseId);
      if (!cur || s.date > cur) map.set(e.exerciseId, s.date);
    }
  }
  return map;
}

/* ----------------------------------------------------------- motivation */

/**
 * The metric a "beat it" target is measured in. `off` is a real option rather
 * than an absence, so the setting always holds one of these ids — the same
 * shape MA_MODES uses for the trend line.
 *
 * `reps` is the odd one out: it means reps *at a given load*, so everything
 * below takes the working weight alongside the metric id. At a weight of 0 it
 * reads as "reps in the best set", which is what a bodyweight lift wants.
 */
export const BOOST_METRICS = [
  { id: 'off', label: 'None', short: '' },
  { id: 'e1rm', label: 'Estimated 1RM', short: 'e1RM' },
  { id: 'weight', label: 'Heaviest set', short: 'top set' },
  { id: 'reps', label: 'Reps at your working weight', short: 'reps' },
  { id: 'volume', label: 'Volume this session', short: 'volume' },
];

export function boostMetric(id) {
  return BOOST_METRICS.find((m) => m.id === id) || BOOST_METRICS[0];
}

/** One session's worth of `metricId`, over sets that already count. */
export function metricOfSets(sets, metricId, atWeight = 0) {
  const list = Array.isArray(sets) ? sets : [];
  switch (metricId) {
    case 'e1rm': { const b = bestE1rmSet(list); return b ? b.value : 0; }
    case 'weight': { const t = topWeightSet(list); return t ? Number(t.weight) || 0 : 0; }
    case 'volume': return volumeOfSets(list);
    case 'reps':
      return list.reduce((m, s) => ((Number(s.weight) || 0) >= atWeight
        ? Math.max(m, Number(s.reps) || 0) : m), 0);
    default: return 0;
  }
}

const metricSeries = (series, metricId, atWeight) =>
  series.map((p) => metricOfSets(p.sets, metricId, atWeight));

/** The next multiple of `step` strictly above `v`. */
function stepAbove(v, step) {
  const s = Number(step) > 0 ? Number(step) : 2.5;
  return Math.round((Math.floor(v / s + 1e-9) + 1) * s * 100) / 100;
}

/** Past this many reps a suggestion stops being a target and starts being a joke. */
const BOOST_MAX_REPS = 20;
/** Likewise for volume: more than this many extra sets is not today's problem. */
const BOOST_MAX_SETS = 12;

/**
 * What it would take to beat your own number on this exercise, today.
 *
 * `series` is the exercise's history with the session being logged left out.
 * Leaving it in would raise the target the moment you cleared it, and the line
 * could never read "done".
 *
 * The target is the nearer of two: last session's number while you are still
 * under it, your all-time best once you are past it. That keeps the figure
 * reachable after a layoff without letting it go slack once you are climbing.
 *
 * Returns null when there is nothing useful to say — metric off, no history,
 * or a load-based metric on a lift that has never carried a load.
 */
export function boostTarget(series, liveSets, opts = {}) {
  const metric = boostMetric(opts.metricId);
  if (metric.id === 'off' || !series || !series.length) return null;

  const w = Number(opts.weight) || 0;
  const r = Math.max(1, Math.round(Number(opts.reps) || 0) || 1);
  const step = Number(opts.step) > 0 ? Number(opts.step) : 2.5;

  const values = metricSeries(series, metric.id, w);
  const best = values.reduce((m, v) => Math.max(m, v), 0);
  const last = values[values.length - 1] || 0;
  if (best <= 0) return null;

  const current = metricOfSets(liveSets || [], metric.id, w);
  // opts.basis === 'best' skips the nearer-of-two rule. The Progress tab uses
  // it: with no session in progress, "beat last time" would be the answer for
  // every exercise forever, and there the milestone is the point.
  const target = opts.basis !== 'best' && last > 0 && current <= last ? last : best;
  const out = {
    metric,
    target,
    current,
    best,
    achieved: current > target,
    // Which of the two the target came from. `best` is carried alongside so a
    // set that clears last session and the all-time best in one go can be
    // called what it is.
    basis: target < best ? 'last' : 'best',
    reps: null, sets: null, weight: null, atWeight: w, atReps: r,
  };
  if (out.achieved) return out;

  switch (metric.id) {
    case 'e1rm':
      if (w > 0) {
        // Epley inverted: the smallest whole rep count that clears the target.
        const need = Math.max(1, Math.floor(30 * (target / w - 1) + 1e-9) + 1);
        if (need <= BOOST_MAX_REPS) out.reps = need;
        out.weight = stepAbove(target / (1 + r / 30), step);
      }
      break;
    case 'weight':
      out.weight = stepAbove(target, step);
      break;
    case 'reps':
      out.reps = Math.round(target) + 1;
      break;
    case 'volume':
      if (w > 0) {
        const need = Math.floor((target - current) / w + 1e-9) + 1;
        const sets = Math.max(1, Math.ceil(need / r));
        if (sets <= BOOST_MAX_SETS) { out.reps = need; out.sets = sets; }
      }
      break;
    default:
      break;
  }
  // Nothing actionable to print is the same as having no target at all.
  if (out.reps == null && out.weight == null) return null;
  return out;
}

/**
 * Consecutive session-to-session improvements in `metricId`, counting back
 * from the most recent. One improvement spans two sessions, so callers that
 * want to say "n sessions climbing" print this plus one.
 */
export function improvementStreak(series, metricId, atWeight = 0) {
  const metric = boostMetric(metricId);
  if (metric.id === 'off' || !series || series.length < 2) return 0;
  const v = metricSeries(series, metric.id, atWeight);
  let n = 0;
  for (let i = v.length - 1; i > 0; i--) {
    if (v[i] > v[i - 1] && v[i] > 0) n += 1;
    else break;
  }
  return n;
}

/**
 * How one finished exercise compares with its own past. `series` must exclude
 * the session being judged, for the same reason boostTarget's does.
 */
export function sessionVerdict(series, sets, metricId, atWeight = 0) {
  const metric = boostMetric(metricId);
  const value = metricOfSets(sets, metric.id, atWeight);
  if (!series || !series.length) return { value, best: 0, last: 0, delta: 0, verdict: 'first' };
  const v = metricSeries(series, metric.id, atWeight);
  const best = v.reduce((m, x) => Math.max(m, x), 0);
  const last = v[v.length - 1] || 0;
  let verdict = 'down';
  if (value > best) verdict = 'pr';
  else if (value > last) verdict = 'up';
  else if (value === last) verdict = 'level';
  return { value, best, last, delta: value - last, verdict };
}

/* --------------------------------------------------------------- weekly */

/**
 * `weeks` Monday-anchored buckets ending with the current week.
 * Returns [{ start: Date, label, sessions, volume, byGroup: {group: volume} }]
 */
export function weeklyBuckets(sessions, exercisesById, weeks = 12) {
  const thisWeek = weekStart(new Date());
  const buckets = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = new Date(thisWeek);
    start.setDate(start.getDate() - i * 7);
    buckets.push({
      start,
      key: localDate(start),
      label: start.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' }),
      sessions: 0,
      volume: 0,
      byGroup: {},
    });
  }
  const first = buckets[0].start.getTime();
  for (const s of sessions) {
    const d = parseLocalDate(s.date);
    if (d.getTime() < first) continue;
    // round, not floor: a DST week is 23 or 25 hours long
    const idx = Math.round((weekStart(d).getTime() - first) / (7 * 86400000));
    const b = buckets[idx];
    if (!b) continue;
    b.sessions += 1;
    for (const e of s.entries || []) {
      const v = volumeOfSets(countedSets(e));
      b.volume += v;
      const g = (exercisesById.get(e.exerciseId) || {}).muscleGroup || 'Other';
      b.byGroup[g] = (b.byGroup[g] || 0) + v;
    }
  }
  return buckets;
}

/** Consecutive weeks, counting back from this one, containing ≥1 session. */
export function weekStreak(sessions) {
  if (!sessions.length) return 0;
  const trained = new Set(sessions.map((s) => weekStart(parseLocalDate(s.date)).getTime()));
  const cursor = weekStart(new Date());
  let streak = 0;
  // This week not yet trained doesn't break a streak that's alive from last week.
  if (!trained.has(cursor.getTime())) cursor.setDate(cursor.getDate() - 7);
  while (trained.has(cursor.getTime())) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 7);
  }
  return streak;
}

/* --------------------------------------------------------- moving average */

/**
 * The trend overlay offered on the per-session volume chart.
 * `off` is a real option rather than an absence, so the setting always holds
 * one of these ids and the Data tab can round-trip it.
 */
export const MA_MODES = [
  { id: 'off', label: 'None', short: '' },
  { id: 'sma', label: 'Simple moving average', short: 'SMA' },
  { id: 'ema', label: 'Exponential moving average', short: 'EMA' },
];

/**
 * Sessions per average. The lengths on offer are an editable list, held in
 * settings (db.DEFAULT_TREND_PERIODS seeds it), so all that is fixed here is
 * the range a length may fall in: two sessions is the shortest thing that
 * averages anything, and past sixty the line is flat for any real history.
 */
export const MA_PERIOD_MIN = 2;
export const MA_PERIOD_MAX = 60;

export const MA_DEFAULT_PERIOD = 5;

export function maMode(id) {
  return MA_MODES.find((m) => m.id === id) || MA_MODES[0];
}

/** Clamp whatever came out of storage into the allowed range. */
export function maPeriod(n) {
  const v = parseInt(n, 10);
  if (!isFinite(v)) return MA_DEFAULT_PERIOD;
  return Math.min(Math.max(v, MA_PERIOD_MIN), MA_PERIOD_MAX);
}

/**
 * Moving average over `values`, index-aligned with them.
 *
 * The first `period - 1` entries are null: an average of fewer sessions than
 * asked for is a different, noisier statistic, and drawing it would make the
 * left edge of the line look like a trend that isn't there. Callers skip nulls
 * rather than plotting a zero.
 *
 * Both kinds start at the same index and from the same number — the EMA is
 * seeded with the simple average of its first window rather than with the
 * first value — so switching between them in settings moves the shape of the
 * line without moving where it begins.
 *
 * kind: 'sma' | 'ema'. Anything else (including 'off') returns all nulls.
 */
export function movingAverage(values, period = MA_DEFAULT_PERIOD, kind = 'sma') {
  const n = values.length;
  const p = Math.max(1, Math.round(period));
  const out = new Array(n).fill(null);
  if ((kind !== 'sma' && kind !== 'ema') || n < p) return out;

  let sum = 0;
  for (let i = 0; i < p; i++) sum += Number(values[i]) || 0;
  const seed = sum / p;

  if (kind === 'sma') {
    out[p - 1] = seed;
    for (let i = p; i < n; i++) {
      sum += (Number(values[i]) || 0) - (Number(values[i - p]) || 0);
      out[i] = sum / p;
    }
    return out;
  }

  const k = 2 / (p + 1);
  let prev = seed;
  out[p - 1] = prev;
  for (let i = p; i < n; i++) {
    prev = (Number(values[i]) || 0) * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/* ------------------------------------------------------------ time windows */

export const WINDOWS = [
  { id: '1m', label: '1M', days: 31 },
  { id: '3m', label: '3M', days: 92 },
  { id: '6m', label: '6M', days: 183 },
  { id: '1y', label: '1Y', days: 366 },
  { id: 'all', label: 'All', days: null },
];

export function filterWindow(series, windowId) {
  const w = WINDOWS.find((x) => x.id === windowId);
  if (!w || !w.days) return series;
  const cutoff = Date.now() - w.days * 86400000;
  return series.filter((p) => p.ts >= cutoff);
}
