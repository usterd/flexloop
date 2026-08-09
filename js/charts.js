/* =========================================================================
   charts.js — hand-written SVG charts.

   No library, no CDN, ~250 lines. Everything is drawn from measured pixel
   values rather than a stretched viewBox, so text never distorts. Charts
   re-render on resize and on orientation change.
   ========================================================================= */

const NS = 'http://www.w3.org/2000/svg';
let uid = 0;

/* Shared horizontal geometry -------------------------------------------------
   Charts stacked on a screen are all the same width, so one set of horizontal
   constants is what makes them line up: a session plotted on the 1RM line sits
   directly above its bar in the volume chart. Bars are positioned from their
   x value like line points are — never spread evenly by index — otherwise two
   sessions a day apart look as far apart as two a month apart. */
const PAD_L = 38;       // room for the y tick labels
const PAD_R = 38;       // matched, so a chart with a right-hand axis still lines up
const X_INSET = 20;     // ≥ half the widest bar or set group, so edges never clip
const BAR_MAX = 26;
const LABEL_GAP = 52;   // minimum px between two x labels

/**
 * Map data x values onto the inner band. Identical for every chart type, so
 * equal x values land on equal pixels.
 * xs: Number[] — ascending. Returns { pos: px per point, a, b } band edges.
 */
function xLayout(xs, W) {
  const a = PAD_L + X_INSET;
  const b = W - PAD_R - X_INSET;
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  const span = hi - lo;
  const pos = xs.map((v) => (span > 0 ? a + ((v - lo) / span) * (b - a) : (a + b) / 2));
  return { pos, a, b };
}

/** Widest bar that still leaves a gap at the tightest pair of points. */
function barWidth(pos, band) {
  let gap = pos.length > 1 ? Infinity : band;
  for (let i = 1; i < pos.length; i++) gap = Math.min(gap, pos[i] - pos[i - 1]);
  return Math.max(3, Math.min(gap - 3, BAR_MAX));
}

/**
 * Which points get an x label. Walks back from the newest — that one is always
 * labelled — and keeps whatever clears LABEL_GAP, so labels never collide and
 * two charts sharing an x scale label the same points.
 */
function xTickIndices(pos) {
  const keep = [];
  let last = Infinity;
  for (let i = pos.length - 1; i >= 0; i--) {
    if (last - pos[i] < LABEL_GAP) continue;
    keep.push(i);
    last = pos[i];
  }
  return keep.reverse();
}

/** One hit region per point, bounded by the midpoints to its neighbours. */
function addHits(svg, pos, W, top, height, select) {
  pos.forEach((x, i) => {
    const l = i === 0 ? PAD_L : (pos[i - 1] + x) / 2;
    const r = i === pos.length - 1 ? W - PAD_R : (x + pos[i + 1]) / 2;
    const hit = svgEl('rect', { class: 'hit', x: l, y: top, width: Math.max(1, r - l), height });
    hit.addEventListener('pointerdown', (e) => { e.stopPropagation(); select(i); });
    svg.appendChild(hit);
  });
}

function svgEl(tag, attrs = {}) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}

/** Round axis bounds outward to human-friendly ticks. */
function niceTicks(min, max, count = 4, integer = false) {
  if (!isFinite(min) || !isFinite(max)) return { lo: 0, hi: 1, ticks: [0, 1] };
  if (min === max) { min = Math.max(0, min - 1); max = max + 1; }
  const raw = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  let step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  // Counts of things have no half-values; forcing a whole step stops the
  // axis printing "1, 1, 0" when the maximum is 1.
  if (integer) step = Math.max(1, Math.round(step));
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 1000; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { lo, hi, ticks };
}

/**
 * Two axes, one set of gridlines. Nice-ticks each side independently, then
 * stretch whichever ended up with fewer intervals until both have the same
 * count — so every gridline is a real tick on both scales and the chart never
 * grows a second, contradictory grid.
 * a, b: { min, max, integer }
 */
function pairTicks(a, b, count = 3) {
  const A = niceTicks(a.min, a.max, count, a.integer);
  const B = niceTicks(b.min, b.max, count, b.integer);
  const grow = (t) => {
    const step = t.ticks[1] - t.ticks[0];
    t.hi = Math.round((t.hi + step) * 1e6) / 1e6;
    t.ticks.push(t.hi);
  };
  while (A.ticks.length < B.ticks.length) grow(A);
  while (B.ticks.length < A.ticks.length) grow(B);
  return [A, B];
}

function emptyState(wrap, message) {
  // Nothing is selectable any more, so let go of the previous drawing's
  // listeners and its seat in the sync group.
  if (wrap.__unbind) wrap.__unbind();
  wrap.__unbind = null;
  wrap.__clear = null;
  leaveGroup(wrap);
  wrap.innerHTML = '';
  const d = document.createElement('div');
  d.className = 'empty';
  d.style.padding = '28px 10px';
  d.innerHTML = `<div class="glyph"></div><p style="margin:0">${message}</p>`;
  wrap.appendChild(d);
}

function makeTip(wrap) {
  let tip = wrap.querySelector('.tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'tip';
    tip.hidden = true;
    wrap.appendChild(tip);
  }
  return tip;
}

/* ----------------------------------------------------- selection and sync */

/* Charts stacked in one view read as a single figure, so they share a
   selection: pick a session in any of them and the others mark the same
   session. Membership is by group key, passed in as `opts.sync`. Entries are
   dropped when their wrap leaves the document — a re-render builds fresh
   wraps rather than reusing the old ones — so nothing has to be torn down by
   hand when the view changes. */
const syncGroups = new Map();
const NONE = new Set();

function joinGroup(key, entry) {
  // A redraw replaces the wrap's entry instead of stacking a second one on it.
  leaveGroup(entry.wrap);
  if (!key) return;
  let members = syncGroups.get(key);
  if (!members) syncGroups.set(key, (members = []));
  members.push(entry);
  entry.wrap.__syncKey = key;
}

function leaveGroup(wrap) {
  const key = wrap.__syncKey;
  if (!key) return;
  const members = syncGroups.get(key) || [];
  const i = members.findIndex((m) => m.wrap === wrap);
  if (i >= 0) members.splice(i, 1);
  wrap.__syncKey = null;
}

function broadcast(key, x, from) {
  const members = syncGroups.get(key);
  if (!members) return;
  for (let i = members.length - 1; i >= 0; i--) {
    const m = members[i];
    if (!m.wrap.isConnected) { members.splice(i, 1); continue; }
    if (m !== from) m.follow(x);
  }
}

/**
 * Hit regions, tooltip lifecycle and cross-chart highlighting for one chart.
 *
 * cfg: {
 *   svg, W, top, height        — plot geometry
 *   pos:  Number[]             — px centre of every selectable item
 *   xs:   Number[]             — the session x behind each item. Items sharing
 *                                an x light up together when a sibling chart
 *                                selects that session — one session is several
 *                                bars in the per-set chart.
 *   paint(Set<Number>)         — highlight exactly these item indices
 *   describe(i) -> { text, left, top }  — tooltip content and anchor
 *   sync: String|null          — group key, or null for a standalone chart
 * }
 */
function bindSelection(wrap, cfg) {
  const { svg, W, top, height, pos, xs, paint, describe, sync } = cfg;
  const tip = makeTip(wrap);

  const clear = () => { paint(NONE); tip.hidden = true; };

  // Chosen here: highlight, show the tooltip, and tell the rest of the group.
  const select = (i) => {
    if (i == null) { clear(); broadcast(sync, null, entry); return; }
    paint(new Set([i]));
    const d = describe(i);
    tip.textContent = d.text;
    tip.hidden = false;
    tip.style.left = `${d.left}px`;
    tip.style.top = `${d.top}px`;
    broadcast(sync, xs[i], entry);
  };

  // Chosen in a sibling chart: mark the same session, but only the chart under
  // the thumb carries a tooltip.
  const follow = (x) => {
    tip.hidden = true;
    if (x == null) return paint(NONE);
    const sel = new Set();
    xs.forEach((v, j) => { if (v === x) sel.add(j); });
    paint(sel);
  };

  const entry = { wrap, follow };
  joinGroup(sync, entry);

  // Hit regions rather than the marks themselves — a thumb is wider than a dot.
  addHits(svg, pos, W, top, height, select);

  if (wrap.__unbind) wrap.__unbind();
  // A touch ends by lifting off the chart, which is nothing like a mouse
  // leaving it: on a phone the point stays selected until something else is
  // picked or tapped, so the reading survives the thumb being lifted out of
  // the way. A cancel is the browser taking the gesture over for a scroll —
  // that was never a selection, so it drops.
  const onLeave = (e) => { if (e.pointerType === 'mouse') select(null); };
  const onCancel = () => select(null);
  wrap.addEventListener('pointerleave', onLeave);
  wrap.addEventListener('pointercancel', onCancel);
  wrap.__unbind = () => {
    wrap.removeEventListener('pointerleave', onLeave);
    wrap.removeEventListener('pointercancel', onCancel);
  };
  wrap.__clear = clear;
}

/* ------------------------------------------------------------ line chart */

/**
 * points: [{ x: Number (ms timestamp or index), y: Number, label: String }]
 * opts:   { height, format(y) -> String, xLabel(point) -> String, sync }
 *         `sync` is a group key: charts sharing one highlight the same x.
 */
export function lineChart(wrap, points, opts = {}) {
  const draw = () => {
    if (!points || points.length === 0) {
      return emptyState(wrap, opts.empty || 'No sessions in this window yet. Log one and the line starts here.');
    }
    const W = Math.max(240, wrap.clientWidth || 320);
    const H = opts.height || 190;
    const pad = { t: 12, r: PAD_R, b: 22, l: PAD_L };
    const ih = H - pad.t - pad.b;

    const ys = points.map((p) => p.y);
    const { lo, hi, ticks } = niceTicks(Math.min(...ys), Math.max(...ys), 3);
    const { pos } = xLayout(points.map((p, i) => (p.x == null ? i : p.x)), W);

    const py = (v) => pad.t + ih - ((v - lo) / (hi - lo || 1)) * ih;

    wrap.innerHTML = '';
    const svg = svgEl('svg', {
      class: 'chart', width: W, height: H,
      viewBox: `0 0 ${W} ${H}`, role: 'img',
      'aria-label': opts.aria || 'Line chart',
    });

    const gid = `loopfade${++uid}`;
    const defs = svgEl('defs');
    const grad = svgEl('linearGradient', { id: gid, x1: '0', y1: '0', x2: '0', y2: '1' });
    grad.appendChild(svgEl('stop', { offset: '0', 'stop-color': '#FFB020', 'stop-opacity': '.22' }));
    grad.appendChild(svgEl('stop', { offset: '1', 'stop-color': '#FFB020', 'stop-opacity': '0' }));
    defs.appendChild(grad);
    svg.appendChild(defs);

    // gridlines + y ticks
    ticks.forEach((t) => {
      const y = py(t);
      svg.appendChild(svgEl('line', { class: 'grid', x1: pad.l, x2: W - pad.r, y1: y, y2: y }));
      const lab = svgEl('text', { class: 'tick', x: pad.l - 6, y: y + 3.5, 'text-anchor': 'end' });
      lab.textContent = opts.tickFormat ? opts.tickFormat(t) : String(t);
      svg.appendChild(lab);
    });

    if (points.length > 1) {
      const d = points.map((p, i) => `${i ? 'L' : 'M'}${pos[i].toFixed(1)},${py(p.y).toFixed(1)}`).join('');
      const base = (pad.t + ih).toFixed(1);
      const areaD = `${d}L${pos[pos.length - 1].toFixed(1)},${base}L${pos[0].toFixed(1)},${base}Z`;
      svg.appendChild(svgEl('path', { class: 'area', d: areaD, fill: `url(#${gid})` }));
      svg.appendChild(svgEl('path', { class: 'line', d }));
    }

    xTickIndices(pos).forEach((i) => {
      const p = points[i];
      const t = svgEl('text', { class: 'tick', x: pos[i], y: H - 6, 'text-anchor': 'middle' });
      t.textContent = p.xlab != null ? p.xlab : String(p.label || '');
      svg.appendChild(t);
    });

    const dots = points.map((p, i) => {
      const c = svgEl('circle', { class: 'dot', cx: pos[i], cy: py(p.y), r: points.length > 40 ? 2 : 3.5 });
      svg.appendChild(c);
      return c;
    });

    bindSelection(wrap, {
      svg, W, top: pad.t, height: ih, pos, sync: opts.sync,
      xs: points.map((p, i) => (p.x == null ? i : p.x)),
      paint: (sel) => dots.forEach((d, j) => d.classList.toggle('on', sel.has(j))),
      describe: (i) => {
        const p = points[i];
        return {
          text: `${opts.format ? opts.format(p.y) : p.y}  ·  ${p.label}`,
          left: Math.min(Math.max(pos[i], 46), W - 46),
          top: py(p.y),
        };
      },
    });

    wrap.appendChild(svg);
  };

  draw();
  observe(wrap, draw);
}

/* ------------------------------------------------------------- bar chart */

/**
 * bars: [{ x: Number (ms timestamp or index, optional), label, value, sub }]
 *       Pass `x` whenever the bars share a timeline with a line chart above or
 *       below them; without it the bars fall back to evenly spaced indices.
 * opts: { height, format(v), highlightLast, sync }
 */
export function barChart(wrap, bars, opts = {}) {
  const draw = () => {
    if (!bars || bars.length === 0) return emptyState(wrap, opts.empty || 'Nothing to chart yet.');
    const W = Math.max(240, wrap.clientWidth || 320);
    const H = opts.height || 150;
    const pad = { t: 10, r: PAD_R, b: 20, l: PAD_L };
    const ih = H - pad.t - pad.b;

    const max = Math.max(...bars.map((b) => b.value), 0);
    const { hi, ticks } = niceTicks(0, max || 1, 2, !!opts.integer);
    const py = (v) => pad.t + ih - (v / (hi || 1)) * ih;

    const { pos, a, b: bandEnd } = xLayout(bars.map((b, i) => (b.x == null ? i : b.x)), W);
    const bw = barWidth(pos, bandEnd - a);

    wrap.innerHTML = '';
    const svg = svgEl('svg', {
      class: 'chart', width: W, height: H, viewBox: `0 0 ${W} ${H}`,
      role: 'img', 'aria-label': opts.aria || 'Bar chart',
    });

    ticks.forEach((t) => {
      const y = py(t);
      svg.appendChild(svgEl('line', { class: 'grid', x1: pad.l, x2: W - pad.r, y1: y, y2: y }));
      const lab = svgEl('text', { class: 'tick', x: pad.l - 6, y: y + 3.5, 'text-anchor': 'end' });
      lab.textContent = opts.tickFormat ? opts.tickFormat(t) : String(t);
      svg.appendChild(lab);
    });

    const rects = bars.map((b, i) => {
      const y = py(b.value);
      const r = svgEl('rect', {
        class: 'bar' + (opts.highlightLast && i === bars.length - 1 ? ' on' : ''),
        x: pos[i] - bw / 2,
        y: b.value > 0 ? y : pad.t + ih - 1,
        width: bw,
        height: b.value > 0 ? Math.max(2, pad.t + ih - y) : 1,
        rx: Math.min(3, bw / 2),
      });
      svg.appendChild(r);
      return r;
    });

    xTickIndices(pos).forEach((i) => {
      const t = svgEl('text', { class: 'tick', x: pos[i], y: H - 6, 'text-anchor': 'middle' });
      t.textContent = bars[i].label;
      svg.appendChild(t);
    });

    bindSelection(wrap, {
      svg, W, top: pad.t, height: ih, pos, sync: opts.sync,
      xs: bars.map((b, i) => (b.x == null ? i : b.x)),
      // With nothing picked the newest bar keeps its standing highlight.
      paint: (sel) => rects.forEach((r, j) => r.classList.toggle(
        'on', sel.has(j) || (opts.highlightLast && sel.size === 0 && j === bars.length - 1))),
      describe: (i) => {
        const b = bars[i];
        return {
          text: `${opts.format ? opts.format(b.value) : b.value}  ·  ${b.sub || b.label}`,
          left: Math.min(Math.max(pos[i], 50), W - 50),
          top: py(b.value),
        };
      },
    });

    wrap.appendChild(svg);
  };

  draw();
  observe(wrap, draw);
}

/* ------------------------------------------------- sets: weight and reps */

/**
 * Every set of every session in one figure: a bar per set on the right-hand
 * weight axis, and the reps of those same sets as a line on the left. Sets
 * within a session are joined solid; the jump to the next session is dashed,
 * because nothing was lifted in between.
 *
 * groups: [{ x: Number (ms timestamp), label, sets: [{ weight, reps }] }]
 * opts:   { height, weightFormat(v), repFormat(v), empty, sync }
 */
export function setChart(wrap, groups, opts = {}) {
  const draw = () => {
    const live = (groups || []).filter((g) => g.sets && g.sets.length);
    if (!live.length) return emptyState(wrap, opts.empty || 'Nothing to chart yet.');

    const W = Math.max(240, wrap.clientWidth || 320);
    const H = opts.height || 190;
    const pad = { t: 12, r: PAD_R, b: 22, l: PAD_L };
    const ih = H - pad.t - pad.b;

    const sets = live.flatMap((g) => g.sets);
    const weights = sets.map((s) => Number(s.weight) || 0);
    const reps = sets.map((s) => Number(s.reps) || 0);
    // The weight axis starts near the lightest set, not at zero: across a
    // working range of 40–60 a zero baseline flattens every bar to the same
    // height and the chart says nothing. The floor is printed on the axis, and
    // sits a margin below the lightest set so that set still reads as a bar
    // rather than a sliver on the baseline.
    const kMin = Math.min(...weights), kMax = Math.max(...weights);
    const floor = Math.max(0, kMin - ((kMax - kMin) || kMax * 0.1 || 1) * 0.2);
    const [R, K] = pairTicks(
      { min: Math.min(...reps), max: Math.max(...reps), integer: true },
      { min: floor, max: kMax },
    );
    const pyR = (v) => pad.t + ih - ((v - R.lo) / (R.hi - R.lo || 1)) * ih;
    const pyK = (v) => pad.t + ih - ((v - K.lo) / (K.hi - K.lo || 1)) * ih;

    const gxs = live.map((g, i) => (g.x == null ? i : g.x));
    const { pos, a, b } = xLayout(gxs, W);

    // One pitch for every set in the chart, so a bar means the same width
    // everywhere. Bounded twice: by the tightest session gap, so neighbouring
    // groups never merge, and by the inset, so the first and last groups stay
    // clear of the tick labels either side.
    let gap = b - a;
    for (let i = 1; i < pos.length; i++) gap = Math.min(gap, pos[i] - pos[i - 1]);
    const maxSets = Math.max(...live.map((g) => g.sets.length));
    const pitch = Math.max(2, Math.min((gap * 0.8) / maxSets, (X_INSET * 2) / maxSets, 14));
    const bw = Math.max(1.5, pitch - 1.5);

    // Absolute set positions, flattened alongside their source set.
    const marks = [];
    live.forEach((g, i) => {
      const start = pos[i] - (g.sets.length * pitch) / 2;
      g.sets.forEach((s, j) => {
        marks.push({
          cx: start + pitch * (j + 0.5),
          x: gxs[i],
          set: s,
          group: g,
          setNo: j + 1,
          first: j === 0,
        });
      });
    });

    wrap.innerHTML = '';
    const svg = svgEl('svg', {
      class: 'chart', width: W, height: H, viewBox: `0 0 ${W} ${H}`,
      role: 'img', 'aria-label': opts.aria || 'Weight and reps per set',
    });

    R.ticks.forEach((t, i) => {
      const y = pyR(t);
      svg.appendChild(svgEl('line', { class: 'grid', x1: pad.l, x2: W - pad.r, y1: y, y2: y }));
      const l = svgEl('text', { class: 'tick', x: pad.l - 6, y: y + 3.5, 'text-anchor': 'end' });
      l.textContent = opts.repFormat ? opts.repFormat(t) : String(t);
      svg.appendChild(l);
      const r = svgEl('text', { class: 'tick', x: W - pad.r + 6, y: y + 3.5, 'text-anchor': 'start' });
      r.textContent = opts.weightFormat ? opts.weightFormat(K.ticks[i]) : String(K.ticks[i]);
      svg.appendChild(r);
    });

    const rects = marks.map((m) => {
      const y = pyK(Number(m.set.weight) || 0);
      const r = svgEl('rect', {
        class: 'bar', x: m.cx - bw / 2, y,
        width: bw, height: Math.max(1.5, pad.t + ih - y), rx: Math.min(3, bw / 2),
      });
      svg.appendChild(r);
      return r;
    });

    // Dashed across the rest between sessions, solid through a session's sets.
    for (let i = 1; i < marks.length; i++) {
      if (!marks[i].first) continue;
      const p = marks[i - 1], q = marks[i];
      svg.appendChild(svgEl('line', {
        class: 'link',
        x1: p.cx, y1: pyR(Number(p.set.reps) || 0),
        x2: q.cx, y2: pyR(Number(q.set.reps) || 0),
      }));
    }
    live.forEach((g) => {
      const own = marks.filter((m) => m.group === g);
      if (own.length < 2) return;
      svg.appendChild(svgEl('path', {
        class: 'line',
        d: own.map((m, j) => `${j ? 'L' : 'M'}${m.cx.toFixed(1)},${pyR(Number(m.set.reps) || 0).toFixed(1)}`).join(''),
      }));
    });

    // Dots track the bar pitch — one per set, so they crowd exactly when bars do.
    const dr = Math.max(1.5, Math.min(pitch / 3.5, 3.5));
    const dots = marks.map((m) => {
      const c = svgEl('circle', {
        class: 'dot', cx: m.cx, cy: pyR(Number(m.set.reps) || 0), r: dr,
      });
      svg.appendChild(c);
      return c;
    });

    // Label the session, not the set — one date under the middle of its group.
    xTickIndices(pos).forEach((i) => {
      const t = svgEl('text', { class: 'tick', x: pos[i], y: H - 6, 'text-anchor': 'middle' });
      t.textContent = live[i].label;
      svg.appendChild(t);
    });

    // Selected from a sibling chart the unit is the session, so every set of
    // that session lights up; selected here it is the one set under the thumb.
    bindSelection(wrap, {
      svg, W, top: pad.t, height: ih,
      pos: marks.map((m) => m.cx),
      xs: marks.map((m) => m.x),
      sync: opts.sync,
      paint: (sel) => {
        dots.forEach((d, j) => d.classList.toggle('on', sel.has(j)));
        rects.forEach((r, j) => r.classList.toggle('on', sel.has(j)));
      },
      describe: (i) => {
        const m = marks[i];
        const w = opts.format ? opts.format(Number(m.set.weight) || 0) : m.set.weight;
        return {
          text: `${w} × ${m.set.reps}  ·  set ${m.setNo}  ·  ${m.group.label}`,
          left: Math.min(Math.max(m.cx, 60), W - 60),
          top: Math.min(pyR(Number(m.set.reps) || 0), pyK(Number(m.set.weight) || 0)),
        };
      },
    });

    wrap.appendChild(svg);
  };

  draw();
  observe(wrap, draw);
}

/* --------------------------------------------------------------- resize */

function observe(wrap, draw) {
  if (wrap.__ro) wrap.__ro.disconnect();
  if (typeof ResizeObserver === 'undefined') return;
  let w = wrap.clientWidth;
  const ro = new ResizeObserver(() => {
    if (Math.abs(wrap.clientWidth - w) < 2) return;
    w = wrap.clientWidth;
    draw();
  });
  ro.observe(wrap);
  wrap.__ro = ro;
}

/** Tapping anywhere else dismisses any open tooltip and its highlight. */
document.addEventListener('pointerdown', () => {
  document.querySelectorAll('.chart-wrap').forEach((w) => { if (w.__clear) w.__clear(); });
  document.querySelectorAll('.tip').forEach((t) => { t.hidden = true; });
});
