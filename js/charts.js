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
const PAD_R = 12;
const X_INSET = 14;     // ≥ half the widest bar, so the edge bars never clip
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

function emptyState(wrap, message) {
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

/* ------------------------------------------------------------ line chart */

/**
 * points: [{ x: Number (ms timestamp or index), y: Number, label: String }]
 * opts:   { height, format(y) -> String, xLabel(point) -> String }
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

    const tip = makeTip(wrap);
    const select = (i) => {
      dots.forEach((d, j) => d.classList.toggle('on', j === i));
      if (i == null) { tip.hidden = true; return; }
      const p = points[i];
      tip.textContent = `${opts.format ? opts.format(p.y) : p.y}  ·  ${p.label}`;
      tip.hidden = false;
      tip.style.left = `${Math.min(Math.max(pos[i], 46), W - 46)}px`;
      tip.style.top = `${py(p.y)}px`;
    };

    // Hit regions rather than the tiny circles themselves — a thumb is wider
    // than a dot.
    addHits(svg, pos, W, pad.t, ih, select);

    svg.addEventListener('pointerleave', () => select(null));
    wrap.appendChild(svg);
    wrap.__clear = () => select(null);
  };

  draw();
  observe(wrap, draw);
}

/* ------------------------------------------------------------- bar chart */

/**
 * bars: [{ x: Number (ms timestamp or index, optional), label, value, sub }]
 *       Pass `x` whenever the bars share a timeline with a line chart above or
 *       below them; without it the bars fall back to evenly spaced indices.
 * opts: { height, format(v), highlightLast }
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

    const tip = makeTip(wrap);
    const select = (i) => {
      rects.forEach((r, j) => r.classList.toggle('on', j === i || (opts.highlightLast && i == null && j === bars.length - 1)));
      if (i == null) { tip.hidden = true; return; }
      const b = bars[i];
      tip.textContent = `${opts.format ? opts.format(b.value) : b.value}  ·  ${b.sub || b.label}`;
      tip.hidden = false;
      tip.style.left = `${Math.min(Math.max(pos[i], 50), W - 50)}px`;
      tip.style.top = `${py(b.value)}px`;
    };

    addHits(svg, pos, W, pad.t, ih, select);

    svg.addEventListener('pointerleave', () => select(null));
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

/** Tapping anywhere else dismisses any open tooltip. */
document.addEventListener('pointerdown', () => {
  document.querySelectorAll('.tip').forEach((t) => { t.hidden = true; });
  document.querySelectorAll('.chart .dot.on').forEach((d) => d.classList.remove('on'));
});
