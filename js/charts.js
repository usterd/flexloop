/* =========================================================================
   charts.js — hand-written SVG charts.

   No library, no CDN, ~250 lines. Everything is drawn from measured pixel
   values rather than a stretched viewBox, so text never distorts. Charts
   re-render on resize and on orientation change.
   ========================================================================= */

const NS = 'http://www.w3.org/2000/svg';
let uid = 0;

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
    const pad = { t: 12, r: 10, b: 22, l: 38 };
    const iw = W - pad.l - pad.r;
    const ih = H - pad.t - pad.b;

    const ys = points.map((p) => p.y);
    const { lo, hi, ticks } = niceTicks(Math.min(...ys), Math.max(...ys), 3);
    const xs = points.map((p) => p.x);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const spanX = x1 - x0 || 1;

    const px = (v) => pad.l + (points.length === 1 ? iw / 2 : ((v - x0) / spanX) * iw);
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
      const d = points.map((p, i) => `${i ? 'L' : 'M'}${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`).join('');
      const areaD = `${d}L${px(x1).toFixed(1)},${(pad.t + ih).toFixed(1)}L${px(x0).toFixed(1)},${(pad.t + ih).toFixed(1)}Z`;
      svg.appendChild(svgEl('path', { class: 'area', d: areaD, fill: `url(#${gid})` }));
      svg.appendChild(svgEl('path', { class: 'line', d }));
    }

    // x labels: first, middle, last (only when they won't collide)
    const idxs = points.length > 2 ? [0, Math.floor(points.length / 2), points.length - 1]
      : points.map((_, i) => i);
    [...new Set(idxs)].forEach((i) => {
      const p = points[i];
      const t = svgEl('text', {
        class: 'tick', x: px(p.x), y: H - 6,
        'text-anchor': i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle',
      });
      t.textContent = p.xlab != null ? p.xlab : String(p.label || '');
      svg.appendChild(t);
    });

    const dots = points.map((p) => {
      const c = svgEl('circle', { class: 'dot', cx: px(p.x), cy: py(p.y), r: points.length > 40 ? 2 : 3.5 });
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
      tip.style.left = `${Math.min(Math.max(px(p.x), 46), W - 46)}px`;
      tip.style.top = `${py(p.y)}px`;
    };

    // One wide hit rect per point beats tiny circles under a thumb.
    points.forEach((p, i) => {
      const half = points.length === 1 ? iw / 2 : iw / (points.length - 1) / 2;
      const hit = svgEl('rect', {
        class: 'hit',
        x: Math.max(pad.l, px(p.x) - Math.max(half, 12)),
        y: pad.t,
        width: Math.max(half * 2, 24),
        height: ih,
      });
      hit.addEventListener('pointerdown', (e) => { e.stopPropagation(); select(i); });
      svg.appendChild(hit);
    });

    svg.addEventListener('pointerleave', () => select(null));
    wrap.appendChild(svg);
    wrap.__clear = () => select(null);
  };

  draw();
  observe(wrap, draw);
}

/* ------------------------------------------------------------- bar chart */

/**
 * bars: [{ label, value, sub }]
 * opts: { height, format(v), highlightLast }
 */
export function barChart(wrap, bars, opts = {}) {
  const draw = () => {
    if (!bars || bars.length === 0) return emptyState(wrap, opts.empty || 'Nothing to chart yet.');
    const W = Math.max(240, wrap.clientWidth || 320);
    const H = opts.height || 150;
    const pad = { t: 10, r: 8, b: 20, l: 38 };
    const iw = W - pad.l - pad.r;
    const ih = H - pad.t - pad.b;

    const max = Math.max(...bars.map((b) => b.value), 0);
    const { hi, ticks } = niceTicks(0, max || 1, 2, !!opts.integer);
    const py = (v) => pad.t + ih - (v / (hi || 1)) * ih;

    const slot = iw / bars.length;
    const bw = Math.max(4, Math.min(slot - 4, 26));

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
      const cx = pad.l + slot * i + slot / 2;
      const y = py(b.value);
      const r = svgEl('rect', {
        class: 'bar' + (opts.highlightLast && i === bars.length - 1 ? ' on' : ''),
        x: cx - bw / 2,
        y: b.value > 0 ? y : pad.t + ih - 1,
        width: bw,
        height: b.value > 0 ? Math.max(2, pad.t + ih - y) : 1,
        rx: 3,
      });
      svg.appendChild(r);
      return r;
    });

    // Label roughly every nth bar so they never overlap.
    // Count back from the last bar: the newest one always gets a label and
    // the spacing stays even, so nothing collides at the right edge.
    const every = Math.ceil(bars.length / Math.max(2, Math.floor(iw / 52)));
    bars.forEach((b, i) => {
      if ((bars.length - 1 - i) % every !== 0) return;
      const t = svgEl('text', { class: 'tick', x: pad.l + slot * i + slot / 2, y: H - 6, 'text-anchor': 'middle' });
      t.textContent = b.label;
      svg.appendChild(t);
    });

    const tip = makeTip(wrap);
    const select = (i) => {
      rects.forEach((r, j) => r.classList.toggle('on', j === i || (opts.highlightLast && i == null && j === bars.length - 1)));
      if (i == null) { tip.hidden = true; return; }
      const b = bars[i];
      tip.textContent = `${opts.format ? opts.format(b.value) : b.value}  ·  ${b.sub || b.label}`;
      tip.hidden = false;
      tip.style.left = `${Math.min(Math.max(pad.l + slot * i + slot / 2, 50), W - 50)}px`;
      tip.style.top = `${py(b.value)}px`;
    };

    bars.forEach((b, i) => {
      const hit = svgEl('rect', { class: 'hit', x: pad.l + slot * i, y: pad.t, width: slot, height: ih });
      hit.addEventListener('pointerdown', (e) => { e.stopPropagation(); select(i); });
      svg.appendChild(hit);
    });

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
