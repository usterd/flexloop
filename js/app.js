/* =========================================================================
   app.js — routing, view rendering, and all user interaction.

   Everything is a hash route. Views render into #view as HTML strings and
   are wired with delegated listeners, so there is no component framework
   and no diffing: a mutation writes to IndexedDB immediately, then either
   patches the affected node in place (typing, steppers) or re-renders the
   whole view (structural changes).
   ========================================================================= */

// Side-effect import: version.js is shared with sw.js, which loads it through
// importScripts and so cannot read exports. It sets self.APP_VERSION and
// self.APP_CHANGELOG, read below.
import './version.js';
import * as db from './db.js';
import * as S from './stats.js';
import { lineChart, barChart, setChart } from './charts.js';
import { parseStrongifyCsv, looksLikeStrongify, toStrongifyCsv } from './importers.js';
import { buildDemoData, isDemoExercise, isDemoRoutine } from './demo.js';
import { LANGS, t, plural, list, variants, getLang, setLang } from './i18n.js';

/** The string the service worker caches under. */
const APP_VERSION = self.APP_VERSION || 'flexloop';
const CHANGELOG = self.APP_CHANGELOG || [];

/**
 * The same version without the app name, for the Settings footer — which
 * already says "flexloop" one word earlier and does not need to say it twice.
 */
const VERSION_SHORT = APP_VERSION.replace(/^flexloop-/, '');

/**
 * Days without an export before Settings starts asking for one. iOS clears
 * the storage of a site it considers unused after roughly a week, so the
 * reminder has to arrive inside that week to be of any use.
 */
const EXPORT_NAG_DAYS = 6;

/* ------------------------------------------------------------------ state */

const state = {
  settings: db.loadSettings(),
  exercises: [],
  byId: new Map(),
  sessions: [],
  routines: [],
  activeId: null,
  progressTab: localStorage.getItem('flexloop.progressTab') || 'overview',
  progressEx: localStorage.getItem('flexloop.progressEx') || null,
  progressWindow: localStorage.getItem('flexloop.progressWindow') || '6m',
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const uid = (p) => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
const unit = () => state.settings.unit;

/* ------------------------------------------------------------------ theme

   Two palettes, one set of CSS variable names — see the header of app.css.
   The stored preference is 'dark' | 'light' | 'auto'; 'auto' is resolved
   here rather than in CSS so that one attribute on <html> always states
   which palette is actually live, and the topbar toggle has something
   definite to flip. index.html repeats this resolution inline so the first
   paint is already in the right theme.                                     */

const THEMES = ['dark', 'light', 'auto']
  .map((id) => ({ id, get label() { return t(`theme.${id}`); } }));

/* Must match --ink in each palette: this is the colour iOS paints behind
   the status bar and around the safe areas. */
const THEME_INK = { dark: '#08090B', light: '#F6F7F9' };

const ICON_SUN = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.4v2.3M12 19.3v2.3M2.4 12h2.3M19.3 12h2.3M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6"/></svg>`;
const ICON_MOON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.6A8.6 8.6 0 0 1 9.4 3.5a8.7 8.7 0 1 0 11.1 11.1z"/></svg>`;
/* For info buttons rendered into a view. The topbar's own ⓘ is inline in
   index.html so it paints before this file loads — keep the two in step. */
const ICON_INFO = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16.5"/><circle cx="12" cy="7.6" r="0.75" fill="currentColor" stroke="none"/></svg>`;

const lightMedia = window.matchMedia('(prefers-color-scheme: light)');

const systemTheme = () => (lightMedia.matches ? 'light' : 'dark');

/** The palette actually on screen — never 'auto'. */
function effectiveTheme() {
  const t = state.settings.theme;
  if (t === 'auto') return systemTheme();
  return t === 'light' ? 'light' : 'dark';
}

function applyTheme() {
  // `mode`, not `t`: t() is the translator, and every function in this file
  // needs to be able to call it.
  const mode = effectiveTheme();
  document.documentElement.dataset.theme = mode;
  const meta = $('#theme-color');
  if (meta) meta.setAttribute('content', THEME_INK[mode]);
  // iOS only reads this one while parsing the head — index.html sets it there
  // too. Kept in step here so the next launch starts from the right value.
  const bar = $('#ios-status-bar');
  if (bar) bar.setAttribute('content', mode === 'light' ? 'default' : 'black');
  const btn = $('#theme-btn');
  if (btn) {
    // The button shows the theme you would get, not the one you are in.
    btn.innerHTML = mode === 'dark' ? ICON_SUN : ICON_MOON;
    btn.setAttribute('aria-label', mode === 'dark' ? t('theme.toLight') : t('theme.toDark'));
  }
}

function setTheme(id) {
  state.settings.theme = THEMES.some((x) => x.id === id) ? id : 'dark';
  db.saveSettings(state.settings);
  applyTheme();
}

// Following the system means following it as it changes, not only at launch.
lightMedia.addEventListener('change', () => {
  if (state.settings.theme === 'auto') applyTheme();
});

/* --------------------------------------------------------------- language

   The twin of the theme block above, and deliberately shaped like it: the
   stored preference is 'en' | 'de', the topbar prints the language you would
   get rather than the one you are in, and everything the app says is rebuilt
   from i18n.js on the next render.

   Only the static markup of index.html needs patching by hand — every view
   is a string built fresh — so applyLang() fills the handful of nodes
   carrying data-i18n, plus the two toggles' own labels.                    */

function applyLang() {
  document.documentElement.lang = getLang();
  const desc = $('#app-description');
  if (desc) desc.setAttribute('content', t('app.description'));

  $$('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });

  const btn = $('#lang-btn');
  if (btn) {
    $('span', btn).textContent = t('lang.otherShort');
    btn.setAttribute('aria-label', t('lang.toggle'));
  }
  const mark = $('.wordmark-link');
  if (mark) mark.setAttribute('aria-label', t('app.wordmarkLink'));
  // The theme button's label is a sentence, so it moves with the language too.
  applyTheme();
}

function switchLang(id) {
  state.settings.lang = setLang(id);
  db.saveSettings(state.settings);
  applyLang();
  render();
}

/* ------------------------------------------------------------------ toast */

let toastTimer = null;
function toast(message, actionLabel, onAction, ms = 3200) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(message)}</span>`;
  if (actionLabel) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = actionLabel;
    b.addEventListener('click', () => { el.hidden = true; onAction && onAction(); });
    el.appendChild(b);
  }
  el.hidden = false;
  clearTimeout(toastTimer);
  if (ms) toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

/* ------------------------------------------------------------------ sheet */

/**
 * Runs when the sheet closes, however it closed. There are four ways out — the
 * scrim, a [data-close] control, dragging the handle, and a sheet's own buttons
 * — and confirmSheet/promptSheet have to settle their promise on all of them.
 * Before this existed only their own buttons resolved, so a scrim tap left the
 * await pending forever and the caller was abandoned mid-function: harmless
 * where the next line is `if (!ok) return`, not harmless in doImportJson and
 * doImportCsv, whose `finally { input.value = '' }` then never ran and left the
 * file input unable to re-fire change for the same file.
 */
let sheetDismiss = null;

function openSheet(html, wire, onDismiss) {
  const sheet = $('#sheet');
  const old = $('#sheet-body');
  // Sheets delegate their clicks from #sheet-body, and closing only emptied it,
  // so every sheet used to leave its listener behind on a node the next sheet
  // reused. Two menus opened in a row then both acted on one tap — with stale
  // indices, which quietly deleted the wrong set. Swap in a fresh node instead.
  const body = old.cloneNode(false);
  body.innerHTML = html;
  old.replaceWith(body);
  sheetDismiss = onDismiss || null;
  resetPanel();
  sheet.hidden = false;
  if (wire) wire(body);
}
function closeSheet() {
  // Cleared before the call, not after: the callback is free to open a sheet of
  // its own, and would otherwise have its dismiss handler wiped by this one.
  const fn = sheetDismiss;
  sheetDismiss = null;
  $('#sheet').hidden = true;
  $('#sheet-body').innerHTML = '';
  resetPanel();
  if (fn) fn();
}
/** Drop whatever the drag left inline, so the next sheet opens clean. */
function resetPanel() {
  const p = $('.sheet-panel');
  p.style.transform = '';
  p.style.transition = '';
  p.style.animation = '';
}
$('#sheet').addEventListener('click', (e) => {
  if (e.target.hasAttribute('data-close') || e.target.closest('[data-close]')) closeSheet();
});

/* Drag the grab handle down to dismiss. The handle is static markup — openSheet
   only ever swaps #sheet-body — so this is wired once, here. */
(function wireSheetDrag() {
  const grab = $('.sheet-grab');
  const panel = $('.sheet-panel');
  let startY = 0;
  let startedAt = 0;
  let dy = 0;
  let dragging = false;

  grab.addEventListener('pointerdown', (e) => {
    dragging = true;
    startY = e.clientY;
    startedAt = e.timeStamp;
    dy = 0;
    grab.setPointerCapture(e.pointerId);
    // The open animation is a transform too, and would fight the inline one.
    panel.style.animation = 'none';
    panel.style.transition = 'none';
  });

  grab.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    dy = Math.max(0, e.clientY - startY);   // this sheet only travels downwards
    panel.style.transform = `translateY(${dy}px)`;
  });

  const end = (e) => {
    if (!dragging) return;
    dragging = false;
    const elapsed = Math.max(1, e.timeStamp - startedAt);
    const far = dy > Math.max(60, panel.getBoundingClientRect().height * 0.25);
    const flick = dy > 12 && dy / elapsed > 0.5;
    // A tap is a drag that went nowhere. The handle looks like a control, so
    // let it behave as one rather than springing back to no effect.
    const tap = dy < 4 && elapsed < 250;
    panel.style.transition = 'transform .18s ease-out';
    if (far || flick || tap) {
      panel.style.transform = 'translateY(100%)';
      // On a timer rather than transitionend: a dropped event would strand the
      // sheet open and translated off-screen, with no way back to it.
      setTimeout(closeSheet, 180);
    } else {
      panel.style.transform = 'translateY(0)';
    }
  };
  grab.addEventListener('pointerup', end);
  grab.addEventListener('pointercancel', end);
})();

function confirmSheet({ title, body, confirm = t('action.confirm'), danger = false }) {
  return new Promise((resolve) => {
    // Dismissing any other way — scrim, handle — leaves this false, which is
    // the same answer Cancel gives.
    let answer = false;
    openSheet(`
      <h2>${esc(title)}</h2>
      <p class="sub">${esc(body)}</p>
      <div class="btn-row" style="margin-top:18px">
        <button class="btn" data-x="no">${esc(t('action.cancel'))}</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-x="yes">${esc(confirm)}</button>
      </div>`, (root) => {
      root.addEventListener('click', (e) => {
        const b = e.target.closest('[data-x]');
        if (!b) return;
        // Record, then close. Resolving here as well would race the dismiss
        // callback closeSheet fires, and the cancelled value would win.
        answer = b.dataset.x === 'yes';
        closeSheet();
      });
    }, () => resolve(answer));
  });
}

/**
 * confirmSheet with two ways to say yes. Resolves 'merge', 'replace', or
 * null for every kind of dismissal.
 */
function chooseImportModeSheet({ title, body }) {
  return new Promise((resolve) => {
    let answer = null;
    openSheet(`
      <h2>${esc(title)}</h2>
      <p class="sub">${esc(body)}</p>
      <div class="rows" style="margin-top:14px">
        <button class="row" data-x="merge"><span class="grow"><span class="t">${esc(t('io.merge'))}</span>
          <span class="s">${esc(t('io.mergeSub'))}</span></span></button>
        <button class="row" data-x="replace"><span class="grow"><span class="t" style="color:var(--danger)">${esc(t('io.replace'))}</span>
          <span class="s">${esc(t('io.replaceSub'))}</span></span></button>
      </div>
      <button class="btn btn-block" style="margin-top:14px" data-x="no">${esc(t('action.cancel'))}</button>`, (root) => {
      root.addEventListener('click', (e) => {
        const b = e.target.closest('[data-x]');
        if (!b) return;
        // Record, then close — resolving here would race the dismiss callback.
        answer = b.dataset.x === 'no' ? null : b.dataset.x;
        closeSheet();
      });
    }, () => resolve(answer));
  });
}

/** Resolves to the trimmed string, or null if cancelled or left empty. */
function promptSheet({ title, body, label, value = '', placeholder = '', confirm = t('action.save') }) {
  return new Promise((resolve) => {
    // Dismissed any other way and nothing was entered: same as Cancel.
    let answer = null;
    openSheet(`
      <h2>${esc(title)}</h2>
      ${body ? `<p class="sub">${esc(body)}</p>` : ''}
      <div class="field" style="margin-top:14px">
        <label for="pr-in">${esc(label)}</label>
        <input class="input" id="pr-in" value="${esc(value)}" placeholder="${esc(placeholder)}"
               autocapitalize="words" autocomplete="off" enterkeyhint="done">
      </div>
      <div class="btn-row" style="margin-top:16px">
        <button class="btn" data-x="no">${esc(t('action.cancel'))}</button>
        <button class="btn btn-primary" data-x="yes">${esc(confirm)}</button>
      </div>`, (root) => {
      const input = $('#pr-in', root);
      const done = (ok) => {
        // Read before closing: closeSheet empties #sheet-body and the input
        // with it. Then close, and let the dismiss callback do the resolving.
        const v = input.value.trim();
        answer = ok && v ? v : null;
        closeSheet();
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(true); });
      root.addEventListener('click', (e) => {
        const b = e.target.closest('[data-x]');
        if (b) done(b.dataset.x === 'yes');
      });
      // iOS only raises the keyboard for a focus inside the current task.
      setTimeout(() => input.focus(), 60);
    }, () => resolve(answer));
  });
}

/* ------------------------------------------------------------------- data */

/** Most recently used first, then the never-used ones alphabetically. */
function sortRoutines(list) {
  return list.slice().sort((a, b) =>
    (b.lastUsedAt || 0) - (a.lastUsedAt || 0) || a.name.localeCompare(b.name));
}

async function reload() {
  const [exercises, sessions, routines] = await Promise.all([
    db.allExercises(), db.allSessions(), db.allRoutines(),
  ]);
  state.exercises = exercises.sort((a, b) => a.name.localeCompare(b.name));
  state.byId = new Map(exercises.map((e) => [e.id, e]));
  state.sessions = sessions;
  state.routines = sortRoutines(routines);
  historyCache.clear();
  // A session left open overnight is finished, not in progress. Close anything
  // older than 18h so the Log screen never reopens last week's workout.
  const open = sessions.find((s) => !s.endedAt);
  if (open && Date.now() - (open.startedAt || 0) > 18 * 3600 * 1000) {
    open.endedAt = open.startedAt + 3600 * 1000;
    await db.saveSession(open);
    state.activeId = null;
  } else {
    state.activeId = open ? open.id : null;
  }
}

const activeSession = () => state.sessions.find((s) => s.id === state.activeId) || null;
const sessionById = (id) => state.sessions.find((s) => s.id === id) || null;

async function persist(session) {
  session.updatedAt = Date.now();
  await db.saveSession(session);
}

function exName(id) {
  const e = state.byId.get(id);
  return e ? e.name : t('exercise.removed');
}

/* ==========================================================================
   ROUTER
   ========================================================================== */

const routes = [
  [/^#\/log$/,              () => viewLog()],
  [/^#\/history$/,          () => viewHistory()],
  [/^#\/session\/(.+)$/,    (m) => viewSession(m[1])],
  [/^#\/progress$/,         () => viewProgress()],
  [/^#\/settings$/,         () => viewSettings()],
  [/^#\/exercises$/,        () => viewExercises()],
  [/^#\/routines$/,         () => viewRoutines()],
  [/^#\/routine\/(.+)$/,    (m) => viewRoutine(m[1])],
];

function currentTab() {
  const h = location.hash;
  if (h.startsWith('#/history') || h.startsWith('#/session')) return 'history';
  if (h.startsWith('#/progress')) return 'progress';
  if (h.startsWith('#/settings') || h.startsWith('#/exercises') || h.startsWith('#/routine')) return 'settings';
  return 'log';
}

/**
 * What counts as "the same screen" for the purpose of keeping the scroll
 * position. Progress holds its sub-tab and its exercise in state rather than in
 * the hash, so switching either of those is a different screen and belongs at
 * the top; changing a preference or adding a set is not.
 */
function screenKey() {
  const h = location.hash;
  return h.startsWith('#/progress')
    ? `${h}|${state.progressTab}|${state.progressEx || ''}`
    : h;
}

let renderedKey = null;

async function render() {
  if (!location.hash || location.hash === '#') { location.replace('#/log'); return; }
  // The Data tab became Settings. Old bookmarks, and the Home Screen icon of
  // anyone who left the app on that tab, still point at #/data.
  if (location.hash === '#/data') { location.replace('#/settings'); return; }
  const hash = location.hash;
  const hit = routes.find(([re]) => re.test(hash));
  const view = $('#view');
  // Every view rebuilds #view from a string, which drops the scroll position.
  // Arriving somewhere new should start at the top; re-rendering the screen you
  // are already on — a new set, a changed preference — should not move you.
  const key = screenKey();
  const keepScroll = key === renderedKey ? view.scrollTop : 0;
  historyCache.clear();
  $('#topbar-action').innerHTML = '';
  if (hit) {
    const m = hash.match(hit[0]);
    await hit[1](m);
  } else {
    view.innerHTML = `<div class="empty"><div class="glyph"></div>
      <h3>${esc(t('nav.notFound'))}</h3><p>${esc(t('nav.notFoundBody'))}</p>
      <a class="btn" href="#/log">${esc(t('nav.goToLog'))}</a></div>`;
  }
  renderedKey = key;
  // After the await, so the new markup is in place; a taller offset than the
  // fresh content simply clamps.
  view.scrollTop = keepScroll;
  const tab = currentTab();
  $$('.tab').forEach((t) => {
    if (t.dataset.tab === tab) t.setAttribute('aria-current', 'page');
    else t.removeAttribute('aria-current');
  });
  // The info button explains whatever is on screen, so its label moves too.
  const info = $('#info-btn');
  if (info) info.setAttribute('aria-label', t('nav.about', { title: infoFor(tab).title }));
}

window.addEventListener('hashchange', render);

/* ==========================================================================
   VIEW: LOG
   ========================================================================== */

/**
 * Stands in for the date on the idle Log. The date was the least useful thing
 * on the screen — the phone's clock says it, and every row below is stamped
 * with its own — so the largest text on the tab may as well push you into the
 * session instead.
 */
/* Rolled once per page load, not once per render: the idle Log rebuilds
   whenever you come back to the tab or discard a session, and a line that
   reshuffled underneath you would read as a glitch rather than a greeting.

   The index is held rather than the line itself, so switching language keeps
   the greeting you were given and only changes what it is written in. */
let motivation = null;
function motivationLine() {
  const lines = list('log.motivations');
  if (motivation === null) motivation = Math.floor(Math.random() * lines.length);
  return lines[motivation % lines.length];
}

function viewLog() {
  const session = activeSession();
  const view = $('#view');

  if (!session) {
    const last = state.sessions[0];
    const today = S.localDate();
    const todays = state.sessions.filter((s) => s.date === today);
    view.innerHTML = `
      ${hintHtml()}
      <p class="eyebrow">${esc(t('log.eyebrowToday'))}</p>
      <h2 class="h-big">${esc(motivationLine())}</h2>
      <p class="sub">${last
        ? esc(t('log.lastSession', {
          when: S.relativeDays(last.date), summary: summaryLine(last) }))
        : esc(t('log.noneYet'))}</p>
      <div style="height:18px"></div>
      <button class="btn btn-primary btn-lg btn-block btn-stack" data-act="start">
        <span class="bt">${esc(t('log.start'))}</span>
        <span class="bs">${esc(t('log.startSub'))}</span>
      </button>
      ${state.sessions.length ? '' : `
        <button class="btn btn-block" style="margin-top:8px" data-act="load-demo">${esc(t('log.loadDemo'))}</button>`}
      ${routinePickerHtml()}
      ${todays.length ? `
        <h3 class="h-sec">${esc(t('log.finishedToday'))}</h3>
        <div class="rows">${todays.map(sessionRowHtml).join('')}</div>` : ''}
      ${state.sessions.length ? `
        <h3 class="h-sec">${esc(t('word.recent'))}</h3>
        <div class="rows">${state.sessions.slice(0, 5).map(sessionRowHtml).join('')}</div>` : ''}
      ${state.sessions.length ? `<p class="meta">${esc(t('log.counts', {
        sessions: state.sessions.length, exercises: state.exercises.length }))}</p>` : ''}`;
    return;
  }

  $('#topbar-action').innerHTML =
    `<button class="btn btn-sm" data-act="finish">${esc(t('log.finish'))}</button>`;

  view.innerHTML = `
    <p class="eyebrow">${esc(t('log.eyebrowInProgress'))}</p>
    <h2 class="h-big">${esc(S.fmtDate(session.date, { weekday: 'long', day: 'numeric', month: 'short' }))}</h2>
    <p class="sub" data-live-summary>${esc(summaryLine(session))} · <span data-elapsed>${elapsed(session)}</span></p>
    <div style="height:16px"></div>
    <div data-entries>${(session.entries || []).map((e, i) => entryHtml(session, e, i)).join('')}</div>
    <button class="btn btn-block" data-act="pick-exercise">${esc(t('log.addExercise'))}</button>
    ${saveRoutineBtnHtml(session)}
    <div class="field" style="margin-top:20px">
      <label for="snotes">${esc(t('log.notes'))}</label>
      <textarea class="input" id="snotes" data-act="notes" placeholder="${esc(t('log.notesPlaceholder'))}">${esc(session.notes || '')}</textarea>
    </div>
    <button class="btn btn-primary btn-block btn-lg" data-act="finish">${esc(t('log.finishSession'))}</button>
    <button class="btn btn-quiet btn-block btn-sm" style="margin-top:8px" data-act="discard">${esc(t('log.discardSession'))}</button>`;
}

/** Sits under "+ Add exercise": this list of exercises *is* the routine. */
function saveRoutineBtnHtml(session) {
  if (!(session.entries || []).length) return '';
  return `<button class="btn btn-quiet btn-block btn-sm" style="margin-top:8px"
    data-act="save-routine" data-id="${esc(session.id)}">${esc(t('log.saveAsRoutine'))}</button>`;
}

/** How many of a routine's exercises still exist, and a readable list. */
function routineExercises(routine) {
  return (routine.items || [])
    .filter((it) => state.byId.has(it.exerciseId))
    .map((it) => ({ ...it, ex: state.byId.get(it.exerciseId) }));
}

function routineSummary(routine) {
  const live = routineExercises(routine);
  if (!live.length) return t('routine.emptySummary');
  const sets = live.reduce((sum, it) => sum + (it.sets || 1), 0);
  return `${plural('count.exercises', live.length)} · ${plural('count.sets', sets)}`;
}

/** The "start from a routine" block under the Start button on an idle Log. */
function routinePickerHtml() {
  if (!state.routines.length) return '';
  const rows = state.routines.slice(0, 6).map((r) => `
    <button class="row" data-act="start-routine" data-id="${esc(r.id)}">
      <span class="grow">
        <span class="t">${esc(r.name)}</span>
        <span class="s">${esc(routineSummary(r))}</span>
      </span>
      <span class="r">${r.lastUsedAt
        ? esc(S.relativeDays(S.localDate(new Date(r.lastUsedAt))))
        : esc(t('word.new'))}</span>
    </button>`).join('');
  return `<h3 class="h-sec">${esc(t('log.startFromRoutine'))}</h3>
    <div class="rows rows-accent">${rows}</div>
    ${state.routines.length > 6
      ? `<p class="meta" style="text-align:left;padding:8px 0 0"><a href="#/routines">${
          esc(t('log.allRoutines', { n: state.routines.length }))}</a></p>`
      : ''}`;
}

function elapsed(session) {
  const ms = Date.now() - (session.startedAt || Date.now());
  const mins = Math.max(0, Math.floor(ms / 60000));
  if (mins < 60) return t('time.minutes', { n: mins });
  return t('time.hoursMinutes', {
    h: Math.floor(mins / 60), m: String(mins % 60).padStart(2, '0') });
}

function summaryLine(session) {
  const sets = S.sessionSetCount(session);
  const vol = S.sessionVolume(session);
  const n = (session.entries || []).length;
  if (!n) return t('log.emptySoFar');
  return `${plural('count.exercises', n)} · ${plural('count.sets', sets)}${
    vol ? ` · ${S.fmtVolume(vol, unit())}` : ''}`;
}

function sessionRowHtml(s) {
  return `<button class="row" data-act="open-session" data-id="${esc(s.id)}">
    <span class="grow">
      <span class="t">${esc(S.fmtDate(s.date, { weekday: 'short', day: 'numeric', month: 'short' }))}</span>
      <span class="s">${esc(summaryLine(s))}</span>
    </span>
    <span class="r">${S.fmtNum(S.sessionVolume(s), 0)}<em>${esc(unit())}</em></span>
  </button>`;
}

/** The ghost line: what you did last time, always visible. */
function ghostHtml(session, entry) {
  const last = S.lastPerformance(state.sessions, entry.exerciseId, session.id);
  if (!last) return `<div class="ghost">${esc(t('log.ghostFirst'))}</div>`;
  const w = last.weight > 0
    ? `${S.fmtNum(last.weight)} ${unit()} × ${last.reps}`
    : t('count.reps', { n: last.reps });
  return `<div class="ghost">${t('log.ghostLast', {
    value: `<b>${esc(w)}</b>`, when: esc(S.relativeDays(last.date)) })}</div>`;
}

/* ---------------------------------------------------------- the boost */

/** What each target means, in the Settings note under the dropdown. */
const boostNote = (id) => t(`boostNote.${id}`);

/**
 * Per-exercise history with one session left out, memoised for the length of
 * one render. The boost line wants it once per exercise card, and each rebuild
 * walks every session ever logged.
 *
 * Nothing cached here depends on the excluded session — which is always the
 * session being edited — so ticking a set cannot stale it. render() and
 * reload() clear it anyway, which is the only invalidation that matters.
 */
const historyCache = new Map();

function exHistory(exerciseId, excludeSessionId) {
  const key = `${exerciseId} ${excludeSessionId || ''}`;
  let hit = historyCache.get(key);
  if (!hit) {
    const list = excludeSessionId
      ? state.sessions.filter((s) => s.id !== excludeSessionId)
      : state.sessions;
    hit = S.exerciseSeries(list, exerciseId);
    historyCache.set(key, hit);
  }
  return hit;
}

/**
 * The target for one exercise card: what to beat, and what it would take.
 *
 * A lift that has never carried a load is forced onto reps whatever the
 * setting says — its e1RM, top weight and volume are all zero, and a target of
 * zero is no target at all.
 */
function boostState(session, entry) {
  if (S.boostMetric(state.settings.boostMetric).id === 'off') return null;
  const series = exHistory(entry.exerciseId, session.id);
  if (!series.length) return null;
  const v = nextSetValues(session, entry);
  const metricId = S.seriesIsBodyweight(series) ? 'reps' : state.settings.boostMetric;
  const b = S.boostTarget(series, S.countedSets(entry), {
    metricId, weight: v.weight, reps: v.reps, step: state.settings.weightStep,
  });
  if (b) b.streak = S.improvementStreak(series, metricId, v.weight);
  return b;
}

/** A number in its metric's own terms: 96.0 kg, 9 reps, 1.2k kg. */
function boostValue(b, n) {
  const m = b.metric.id;
  if (m === 'volume') return S.fmtVolume(n, unit());
  if (m === 'reps') return t('count.reps', { n: S.fmtNum(n, 0) });
  return `${S.fmtNum(n, m === 'e1rm' ? 1 : 0)} ${unit()}`;
}

/**
 * The prescription as a headline figure plus its unit, for the Progress tile.
 * Deliberately not the record itself — that number is already on the same
 * screen, in the Personal records grid directly below.
 */
function boostHeadline(b) {
  const m = b.metric.id;
  if (m === 'e1rm') {
    if (b.reps != null) return { v: `${S.fmtNum(b.atWeight)}×${b.reps}`, small: '' };
    if (b.weight != null) return { v: `${S.fmtNum(b.weight)}×${b.atReps}`, small: '' };
    return null;
  }
  if (m === 'weight') return b.weight != null ? { v: S.fmtNum(b.weight), small: unit() } : null;
  if (m === 'reps') return b.reps != null ? { v: String(b.reps), small: t('metric.reps.short') } : null;
  return b.sets != null
    ? { v: String(b.sets),
        small: t(b.sets === 1 ? 'boost.setOf' : 'boost.setsOf', { reps: b.atReps }) } : null;
}

/** What a cleared target actually beat — the all-time best outranks last time. */
const beatenWhat = (b) => t(b.current > b.best ? 'boost.pastBest' : 'boost.pastLast');

/** The concrete ways to clear a target, as one phrase. */
function boostWays(b) {
  const m = b.metric.id;
  if (m === 'e1rm') {
    const ways = [];
    if (b.reps != null) ways.push(`${S.fmtNum(b.atWeight)}×${b.reps}`);
    // Only worth offering when it is actually a heavier bar than today's.
    if (b.weight != null && b.weight > b.atWeight) ways.push(`${S.fmtNum(b.weight)}×${b.atReps}`);
    return ways.join(t('boost.or'));
  }
  if (m === 'weight') return b.weight != null ? t('boost.tryWeight', { weight: S.fmtNum(b.weight) }) : '';
  if (m === 'reps') return b.reps != null ? t('boost.tryReps', { reps: b.reps }) : '';
  return b.sets != null ? plural('boost.moreSets', b.sets, { reps: b.atReps }) : '';
}

/** The target as one line under the ghost. Empty but present, so it can be patched. */
function boostHtml(session, entry) {
  const b = boostState(session, entry);
  if (!b) return `<div class="boost" data-boost hidden></div>`;
  const tag = b.metric.id === 'e1rm' ? ' e1RM' : '';
  let text;

  if (b.achieved) {
    text = `<b>${esc(boostValue(b, b.current))}</b>${tag} · ${esc(beatenWhat(b))}`;
  } else {
    const at = b.metric.id === 'reps' && b.atWeight > 0
      ? t('boost.at', { weight: esc(`${S.fmtNum(b.atWeight)} ${unit()}`) }) : '';
    const ways = boostWays(b);
    text = `${t('boost.beat', { value: `<b>${esc(boostValue(b, b.target))}</b>` })
      }${tag}${at}${ways ? ` · ${esc(ways)}` : ''}`;
  }

  // One improvement spans two sessions, hence the +1.
  const streak = b.streak >= 1
    ? `<i>${esc(t('boost.climbing', { n: b.streak + 1 }))}</i>` : '';
  return `<div class="boost${b.achieved ? ' is-hit' : ''}" data-boost>${text}${streak}</div>`;
}

function patchBoost(session, entry, entryEl) {
  const el = entryEl && $('[data-boost]', entryEl);
  if (el && entry) el.outerHTML = boostHtml(session, entry);
}

/**
 * A set has just carried the exercise past its own target. The marker on the
 * row is deliberately not persisted: it belongs to this moment, and the boost
 * line above it carries the durable version of the same news.
 */
function celebrate(b, setEl) {
  if (setEl) setEl.classList.add('is-pr');
  if (navigator.vibrate) navigator.vibrate([120, 80, 120]);
  toast(t('boost.toast', {
    what: t(b.current > b.best ? 'boost.newBest' : 'boost.beatLast'),
    value: boostValue(b, b.current),
    metric: b.metric.short,
  }).trim());
}

function setRowHtml(entry, set, si) {
  const ex = state.byId.get(entry.exerciseId) || {};
  const bw = ex.isBodyweight;
  return `<div class="set${set.done ? ' is-done' : ''}${set.isWarmup ? ' is-warmup' : ''}" data-set="${si}">
    <span class="num">${set.isWarmup ? esc(t('set.warmupShort')) : si + 1}</span>
    ${bw && !set.weight ? `<span class="unit-tag" style="text-align:center">${esc(t('word.bodyweight'))}</span>` : `
    <div class="stepper">
      <button class="step" data-act="step" data-f="weight" data-d="-1" aria-label="${esc(t('set.lessWeight'))}">−</button>
      <input class="val" data-f="weight" inputmode="decimal" enterkeyhint="done"
             value="${S.fmtNum(set.weight || 0)}" aria-label="${esc(t('set.weightIn', { unit: unit() }))}">
      <button class="step" data-act="step" data-f="weight" data-d="1" aria-label="${esc(t('set.moreWeight'))}">+</button>
    </div>`}
    <div class="stepper">
      <button class="step" data-act="step" data-f="reps" data-d="-1" aria-label="${esc(t('set.fewerReps'))}">−</button>
      <input class="val" data-f="reps" inputmode="numeric" enterkeyhint="done"
             value="${set.reps || 0}" aria-label="${esc(t('set.repsAria'))}">
      <button class="step" data-act="step" data-f="reps" data-d="1" aria-label="${esc(t('set.moreReps'))}">+</button>
    </div>
    <button class="set-done" data-act="done" aria-pressed="${set.done ? 'true' : 'false'}" aria-label="${esc(t('set.markDone'))}">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 13l4 4L19 7"/></svg>
    </button>
  </div>`;
}

/** The card title. Tappable when the exercise still exists — it jumps
    straight to that exercise's charts on Progress. */
function entryTitleHtml(entry) {
  const ex = state.byId.get(entry.exerciseId);
  if (!ex) return `<h3 class="card-title">${esc(exName(entry.exerciseId))}</h3>`;
  return `<h3 class="card-title"><button type="button" class="title-jump"
      data-act="jump-exercise" data-id="${esc(ex.id)}"
      aria-label="${esc(t('log.seeProgress', { name: ex.name }))}">
      <span>${esc(ex.name)}</span>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17l5-6 4 4 7-8"/></svg>
    </button></h3>`;
}

/** Column labels over the steppers, so a weight box never looks like a rep box. */
function setHeadHtml() {
  return `<div class="set-head" aria-hidden="true">
    <span></span>
    <span>${esc(unit().toUpperCase())}</span>
    <span>${esc(t('word.reps'))}</span>
    <span></span>
  </div>`;
}

function entryHtml(session, entry, ei) {
  return `<section class="card" data-entry="${ei}">
    <div class="card-head">
      <div style="min-width:0">
        ${entryTitleHtml(entry)}
        ${ghostHtml(session, entry)}
        ${boostHtml(session, entry)}
      </div>
      <button class="btn btn-sm btn-quiet" data-act="entry-menu" aria-label="${esc(t('log.exerciseOptions'))}">•••</button>
    </div>
    ${entry.sets.length ? setHeadHtml() : ''}
    <div class="sets">${entry.sets.map((s, i) => setRowHtml(entry, s, i)).join('')}</div>
    <div class="set-foot">
      <button class="btn btn-sm" data-act="add-set" style="flex:1">${esc(t('log.addSet'))}</button>
      <button class="btn btn-sm btn-quiet" data-act="add-warmup">${esc(t('log.addWarmup'))}</button>
    </div>
  </section>`;
}

/* --------------------------------------------------------- log mutations */

async function newSession() {
  const now = new Date();
  const s = {
    id: uid('s'),
    date: S.localDate(now),
    startedAt: now.getTime(),
    endedAt: null,
    notes: '',
    entries: [],
  };
  await db.saveSession(s);
  state.sessions.unshift(s);
  state.activeId = s.id;
  return s;
}

/**
 * Nothing is written until an exercise is actually picked. Creating the session
 * up front and *then* opening the picker meant any dismissal — scrim tap, a
 * swipe of the handle, a change of mind — left an empty in-progress session
 * holding the Log screen: no routine list, no Start button, and the only ways
 * out were Discard or the "add to session" confirm, until reload() aged it out
 * 18h later.
 */
async function startSession() {
  pickExercise(async (exerciseId) => {
    const session = activeSession() || await newSession();
    await addExerciseToSession(session, exerciseId);
    location.hash = '#/log';
    render();
  });
}

/** Open a session already filled in with a routine's exercises and sets. */
async function startRoutine(routineId) {
  const r = state.routines.find((x) => x.id === routineId);
  if (!r) return;
  const live = routineExercises(r);
  if (!live.length) {
    toast(t('routine.allDeleted'));
    return;
  }
  // Starting a routine mid-session would leave two sessions open at once, and
  // reload() would then have to guess which one you meant. Fold into the open
  // one instead.
  const open = activeSession();
  if (open) {
    const ok = await confirmSheet({
      title: t('routine.alreadyOpen'),
      body: t('routine.alreadyOpenBody', {
        exercises: plural('count.exercises', live.length), name: r.name }),
      confirm: t('routine.addToSession'),
    });
    if (!ok) return;
  }
  const session = open || await newSession();

  for (const it of live) {
    let entry = session.entries.find((e) => e.exerciseId === it.exerciseId);
    if (!entry) {
      entry = { exerciseId: it.exerciseId, sets: [] };
      session.entries.push(entry);
    }
    // Each set prefills from the one before it, exactly as tapping "+ Set" would.
    for (let i = 0; i < setCountOf(it); i++) entry.sets.push(makeSet(session, entry));
  }
  await persist(session);

  r.lastUsedAt = Date.now();
  await db.saveRoutine(r);
  state.routines = sortRoutines(state.routines);

  const dropped = (r.items || []).length - live.length;
  location.hash = '#/log';
  render();
  toast(`${t(open ? 'routine.addedToast' : 'routine.startedToast', { name: r.name })}${dropped
    ? t('routine.droppedSuffix', { exercises: plural('count.deletedExercises', dropped) }) : ''}`);
}

/** New sets inherit from the previous set here, else from last time. */
function nextSetValues(session, entry) {
  if (entry.sets.length) {
    const p = entry.sets[entry.sets.length - 1];
    return { weight: p.weight, reps: p.reps };
  }
  const last = S.lastPerformance(state.sessions, entry.exerciseId, session.id);
  if (last) return { weight: last.weight, reps: last.reps };
  const ex = state.byId.get(entry.exerciseId);
  return { weight: ex && ex.isBodyweight ? 0 : 20, reps: 8 };
}

function makeSet(session, entry, isWarmup = false) {
  const v = nextSetValues(session, entry);
  return {
    weight: isWarmup ? Math.round((v.weight * 0.5) / 2.5) * 2.5 : v.weight,
    reps: v.reps,
    rpe: null,
    isWarmup,
    done: false,
  };
}

async function addSet(session, entry, isWarmup = false) {
  entry.sets.push(makeSet(session, entry, isWarmup));
  await persist(session);
}

async function addExerciseToSession(session, exerciseId) {
  let entry = session.entries.find((e) => e.exerciseId === exerciseId);
  if (!entry) {
    entry = { exerciseId, sets: [] };
    session.entries.push(entry);
  }
  await addSet(session, entry);
  await persist(session);
}

/* ------------------------------------------------------ exercise picker */

function pickExercise(onPick) {
  const lastMap = S.lastTrainedMap(state.sessions);
  const sorted = state.exercises.slice().sort((a, b) => {
    const la = lastMap.get(a.id) || '', lb = lastMap.get(b.id) || '';
    if (la !== lb) return lb.localeCompare(la);
    return a.name.localeCompare(b.name);
  });

  const rowsFor = (q) => {
    const needle = q.trim().toLowerCase();
    const hits = needle
      ? sorted.filter((e) => e.name.toLowerCase().includes(needle))
      : sorted;
    const rows = hits.slice(0, 60).map((e) => `
      <button class="row" data-pick="${esc(e.id)}">
        <span class="grow">
          <span class="t">${esc(e.name)}</span>
          <span class="s">${esc(e.muscleGroup || t('exercise.uncategorised'))}</span>
        </span>
        <span class="r">${lastMap.get(e.id)
          ? esc(S.relativeDays(lastMap.get(e.id))) : esc(t('word.new'))}</span>
      </button>`).join('');
    const canCreate = needle && !hits.some((e) => e.name.toLowerCase() === needle);
    return (canCreate ? `<button class="row" data-create="1">
        <span class="grow"><span class="t">${esc(t('picker.create', { name: q.trim() }))}</span>
        <span class="s">${esc(t('picker.createSub'))}</span></span>
        <span class="r">+</span></button>` : '') + rows ||
      `<div class="empty" style="padding:26px 10px"><p style="margin:0">${esc(t('picker.empty'))}</p></div>`;
  };

  openSheet(`
    <h2>${esc(t('picker.title'))}</h2>
    <div class="field"><input class="input" id="exq" type="search" placeholder="${esc(t('picker.search'))}"
      autocapitalize="words" autocomplete="off" enterkeyhint="done"></div>
    <div class="rows" id="exlist">${rowsFor('')}</div>`, (root) => {
    const q = $('#exq', root);
    const listEl = $('#exlist', root);
    q.addEventListener('input', () => { listEl.innerHTML = rowsFor(q.value); });
    listEl.addEventListener('click', async (e) => {
      const pick = e.target.closest('[data-pick]');
      const create = e.target.closest('[data-create]');
      if (pick) {
        closeSheet();
        await handlePicked(pick.dataset.pick, onPick);
      } else if (create) {
        const ex = {
          id: uid('ex'),
          name: q.value.trim(),
          muscleGroup: t('exercise.uncategorised'),
          unit: unit(),
          isBodyweight: false,
        };
        await db.saveExercise(ex);
        state.exercises.push(ex);
        state.byId.set(ex.id, ex);
        closeSheet();
        await handlePicked(ex.id, onPick);
      }
    });
  });
}

async function handlePicked(exerciseId, onPick) {
  if (onPick) { onPick(exerciseId); return; }
  const session = activeSession();
  if (!session) return;
  await addExerciseToSession(session, exerciseId);
  render();
}

/* ==========================================================================
   VIEW: SESSION (edit any session, past or present)
   ========================================================================== */

function viewSession(id) {
  const session = sessionById(id);
  const view = $('#view');
  if (!session) {
    view.innerHTML = `<div class="empty"><div class="glyph"></div><h3>${esc(t('session.notFound'))}</h3>
      <p>${esc(t('session.maybeDeleted'))}</p>
      <a class="btn" href="#/history">${esc(t('session.backToHistory'))}</a></div>`;
    return;
  }
  $('#topbar-action').innerHTML =
    `<a class="btn btn-sm btn-quiet" href="#/history">${esc(t('action.back'))}</a>`;
  view.innerHTML = `
    <p class="eyebrow">${esc(session.endedAt ? t('session.completed') : t('log.eyebrowInProgress'))}${
      session.source === 'strongify' ? ` · ${esc(t('word.imported'))}`
        : session.source === 'demo' ? ` · ${esc(t('word.sample'))}` : ''}</p>
    <h2 class="h-big">${esc(S.fmtDate(session.date, { weekday: 'long', day: 'numeric', month: 'long' }))}</h2>
    <p class="sub">${esc(summaryLine(session))}</p>
    <div style="height:16px"></div>
    <div data-entries>${(session.entries || []).map((e, i) => entryHtml(session, e, i)).join('')}</div>
    <button class="btn btn-block" data-act="pick-exercise">${esc(t('log.addExercise'))}</button>
    ${saveRoutineBtnHtml(session)}
    <div class="field" style="margin-top:20px">
      <label for="snotes">${esc(t('log.notes'))}</label>
      <textarea class="input" id="snotes" data-act="notes" placeholder="${esc(t('log.notesEmpty'))}">${esc(session.notes || '')}</textarea>
    </div>
    ${session.endedAt ? '' : `<button class="btn btn-primary btn-block" data-act="finish">${esc(t('log.finishSession'))}</button>`}
    <button class="btn btn-danger btn-block btn-sm" style="margin-top:10px" data-act="delete-session">${esc(t('session.deleteThis'))}</button>
    <p class="meta">${esc(new Date(session.startedAt).toLocaleString(S.locale()))}</p>`;
}

/* ==========================================================================
   VIEW: HISTORY
   ========================================================================== */

function viewHistory() {
  const view = $('#view');
  if (!state.sessions.length) {
    view.innerHTML = `<div class="empty"><div class="glyph"></div>
      <h3>${esc(t('history.empty'))}</h3><p>${esc(t('history.emptyBody'))}</p>
      <a class="btn btn-primary" href="#/log">${esc(t('history.startSession'))}</a></div>`;
    return;
  }
  const groups = new Map();
  for (const s of state.sessions) {
    const k = s.date.slice(0, 7);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(s);
  }
  const blocks = [...groups.entries()].map(([month, list]) => {
    const vol = list.reduce((t, s) => t + S.sessionVolume(s), 0);
    const title = S.parseLocalDate(`${month}-01`)
      .toLocaleDateString(S.locale(), { month: 'long', year: 'numeric' });
    return `<h3 class="h-sec">${esc(title)}
        <span style="float:right;font-family:var(--mono);font-size:11px;color:var(--dim);font-weight:500">
          ${list.length} · ${esc(S.fmtVolume(vol, unit()))}</span></h3>
      <div class="rows">${list.map(sessionRowHtml).join('')}</div>`;
  }).join('');

  view.innerHTML = `<p class="eyebrow">${esc(t('history.eyebrow'))}</p>
    <h2 class="h-big">${esc(plural('count.sessions', state.sessions.length))}</h2>
    <p class="sub">${esc(t('history.sub'))}</p>
    ${blocks}`;
}

/* ==========================================================================
   VIEW: PROGRESS
   ========================================================================== */

function viewProgress() {
  const view = $('#view');
  const tab = state.progressTab;
  view.innerHTML = `
    <p class="eyebrow">${esc(t('progress.eyebrow'))}</p>
    <div class="seg" data-seg="progressTab">
      <button data-v="overview" aria-pressed="${tab === 'overview'}">${esc(t('progress.overview'))}</button>
      <button data-v="exercise" aria-pressed="${tab === 'exercise'}">${esc(t('progress.perExercise'))}</button>
    </div>
    <div id="pbody"></div>`;
  if (tab === 'overview') renderOverview($('#pbody'));
  else renderExerciseProgress($('#pbody'));
}

function renderOverview(root) {
  if (!state.sessions.length) {
    root.innerHTML = `<div class="empty"><div class="glyph"></div><h3>${esc(t('progress.noData'))}</h3>
      <p>${esc(t('progress.noDataBody'))}</p>
      <a class="btn btn-primary" href="#/log">${esc(t('history.startSession'))}</a></div>`;
    return;
  }
  const buckets = S.weeklyBuckets(state.sessions, state.byId, 12);
  const streak = S.weekStreak(state.sessions);
  const thisWeek = buckets[buckets.length - 1];
  const total12 = buckets.reduce((t, b) => t + b.volume, 0);
  const lastMap = S.lastTrainedMap(state.sessions);
  const today = S.localDate();

  const stale = state.exercises
    .filter((e) => lastMap.has(e.id))
    .map((e) => ({ e, date: lastMap.get(e.id), days: S.daysBetween(lastMap.get(e.id), today) }))
    .sort((a, b) => b.days - a.days)
    .slice(0, 8);

  root.innerHTML = `
    <div class="stat-grid">
      <div class="stat accent"><span class="k">${esc(t('progress.weekStreak'))}</span>
        <span class="v">${streak}<small>${esc(t('progress.weekShort'))}</small></span>
        <span class="m">${esc(streak ? t('progress.streakOn') : t('progress.streakOff'))}</span></div>
      <div class="stat"><span class="k">${esc(t('progress.thisWeek'))}</span>
        <span class="v">${thisWeek.sessions}<small>×</small></span>
        <span class="m">${esc(t('progress.moved', { volume: S.fmtVolume(thisWeek.volume, unit()) }))}</span></div>
      <div class="stat"><span class="k">${esc(t('progress.last12'))}</span>
        <span class="v">${buckets.reduce((sum, b) => sum + b.sessions, 0)}</span>
        <span class="m">${esc(t('progress.sessionsLogged'))}</span></div>
      <div class="stat"><span class="k">${esc(t('progress.volume12'))}</span>
        <span class="v">${total12 >= 10000 ? `${S.fmtNum(total12 / 1000, 1)}k` : S.fmtNum(total12, 0)}<small>${esc(unit())}</small></span>
        <span class="m">${esc(t('progress.volumeNote'))}</span></div>
    </div>

    <div class="card chart-card" style="margin-top:12px">
      <div class="chart-head"><p class="eyebrow">${esc(t('progress.sessionsPerWeek'))}</p>
        <span class="note">${esc(t('progress.twelveWeeks'))}</span></div>
      <div class="chart-wrap" id="c-sess"></div>
    </div>

    <div class="card chart-card">
      <div class="chart-head"><p class="eyebrow">${esc(t('progress.volumePerWeek'))}</p><span class="note">${esc(unit().toUpperCase())}</span></div>
      <div class="chart-wrap" id="c-vol"></div>
    </div>

    <h3 class="h-sec">${esc(t('progress.stale'))}</h3>
    <p class="sub" style="margin-bottom:10px">${esc(t('progress.staleSub'))}</p>
    <div class="rows">${stale.map(({ e, date, days }) => `
      <button class="row ${days > 21 ? 'stale' : ''}" data-act="jump-exercise" data-id="${esc(e.id)}">
        <span class="grow"><span class="t">${esc(e.name)}</span>
          <span class="s">${esc(e.muscleGroup || t('exercise.uncategorised'))}</span></span>
        <span class="r">${days}<em>${esc(t('progress.daysShort'))}</em></span>
      </button>`).join('')}</div>`;

  const weekOf = (b) => t('progress.weekOf', { label: b.label });
  barChart($('#c-sess'), buckets.map((b) => ({ x: b.start.getTime(), label: b.label, value: b.sessions, sub: weekOf(b) })), {
    height: 140, integer: true,
    format: (v) => plural('count.sessions', v),
    tickFormat: (v) => String(Math.round(v)),
  });
  barChart($('#c-vol'), buckets.map((b) => ({ x: b.start.getTime(), label: b.label, value: Math.round(b.volume), sub: weekOf(b) })), {
    height: 150, format: (v) => S.fmtVolume(v, unit()),
    tickFormat: (v) => (v >= 1000 ? `${S.fmtNum(v / 1000, 0)}k` : String(Math.round(v))),
  });
}

/**
 * The trend overlay for "Volume per session", as chosen in Data → Preferences.
 * Returns null when the preference is off.
 *
 * The average runs over the exercise's whole history and is only then cut to
 * the window on screen, so the line is already warmed up at the left edge
 * instead of starting a few sessions in every time the window changes.
 */
function volumeTrend(full, series) {
  const mode = S.maMode(state.settings.volumeTrend);
  if (mode.id === 'off') return null;
  const period = S.maPeriod(state.settings.volumeTrendPeriod);
  const ma = S.movingAverage(full.map((p) => p.volume), period, mode.id);
  const bySession = new Map(full.map((p, i) => [p.sessionId, ma[i]]));
  const values = series.map((p) => (bySession.has(p.sessionId) ? bySession.get(p.sessionId) : null));
  return {
    label: `${mode.short} ${period}`,
    period,
    values,
    // Fewer sessions than the average asks for: the label says so rather than
    // leaving a switched-on setting looking broken.
    ready: values.some((v) => v != null),
  };
}

/**
 * The Progress tab's version of the target. Nothing is in progress here, so it
 * aims at the all-time best rather than at last session, and it also reports
 * how long the number has stood and whether the exercise is climbing.
 */
function progressBoost(full, bodyweight) {
  if (S.boostMetric(state.settings.boostMetric).id === 'off' || !full.length) return null;
  const metricId = bodyweight ? 'reps' : state.settings.boostMetric;
  const recent = full[full.length - 1];
  const at = recent.topWeight;
  const b = S.boostTarget(full, [], {
    metricId, weight: at, reps: recent.topWeightReps || 1,
    step: state.settings.weightStep, basis: 'best',
  });
  if (!b) return null;
  b.streak = S.improvementStreak(full, metricId, at);
  // The session that set the number now being chased.
  const peak = full.reduce((m, p) => (S.metricOfSets(p.sets, metricId, at)
    > S.metricOfSets(m.sets, metricId, at) ? p : m), full[0]);
  b.stood = S.daysBetween(peak.date, S.localDate());
  return b;
}

function renderExerciseProgress(root) {
  if (!state.exercises.length) {
    root.innerHTML = `<div class="empty"><div class="glyph"></div><h3>${esc(t('progress.noExercises'))}</h3>
      <p>${esc(t('progress.noExercisesBody'))}</p></div>`;
    return;
  }
  if (!state.progressEx || !state.byId.has(state.progressEx)) {
    const lastMap = S.lastTrainedMap(state.sessions);
    const best = state.exercises.slice().sort((a, b) =>
      (lastMap.get(b.id) || '').localeCompare(lastMap.get(a.id) || ''))[0];
    state.progressEx = best ? best.id : state.exercises[0].id;
  }
  const ex = state.byId.get(state.progressEx);
  const full = S.exerciseSeries(state.sessions, ex.id);
  const series = S.filterWindow(full, state.progressWindow);
  const bodyweight = S.seriesIsBodyweight(full);
  const pr = S.personalRecords(full);
  const trend = volumeTrend(full, series);
  const boost = progressBoost(full, bodyweight);
  const boostHead = boost ? boostHeadline(boost) : null;

  root.innerHTML = `
    <button class="btn btn-block" data-act="choose-progress-ex" style="justify-content:space-between">
      <span>${esc(ex.name)}</span><span style="color:var(--mist);font-size:13px">${esc(t('action.change'))}</span>
    </button>
    <div class="chips" style="margin-top:12px">
      ${S.WINDOWS.map((w) => `<button class="chip" data-act="window" data-v="${w.id}"
        aria-pressed="${state.progressWindow === w.id}">${esc(w.label)}</button>`).join('')}
    </div>

    ${full.length === 0 ? `<div class="empty"><div class="glyph"></div><h3>${esc(t('progress.notTrained'))}</h3>
      <p>${esc(t('progress.notTrainedBody', { name: ex.name }))}</p></div>` : `

    <div class="card chart-card">
      <div class="chart-head"><p class="eyebrow">${esc(bodyweight
        ? t('progress.bestSetReps') : t('metric.e1rm.label'))}</p>
        <span class="note">${esc(bodyweight ? t('progress.repsAxis') : t('progress.epley'))}</span></div>
      <div class="chart-wrap" id="c-1rm"></div>
    </div>

    ${bodyweight ? '' : `<div class="card chart-card">
      <div class="chart-head"><p class="eyebrow">${esc(t('progress.everySet'))}</p>
        <span class="note">${esc(t('progress.everySetNote', { unit: unit().toUpperCase() }))}</span></div>
      <div class="chart-wrap" id="c-sets"></div>
    </div>`}

    <div class="card chart-card">
      <div class="chart-head"><p class="eyebrow">${esc(t('progress.volumePerSession'))}</p>
        <span class="note">${esc(trend
          ? (trend.ready
            ? t('progress.warmupsOut', { label: trend.label })
            : t('progress.trendNeeds', { label: trend.label, n: trend.period }))
          : t('progress.warmupsExcluded'))}</span></div>
      <div class="chart-wrap" id="c-svol"></div>
    </div>

    ${bodyweight ? '' : `<div class="card chart-card">
      <div class="chart-head"><p class="eyebrow">${esc(t('progress.topSetWeight'))}</p><span class="note">${esc(unit().toUpperCase())}</span></div>
      <div class="chart-wrap" id="c-top"></div>
    </div>`}

    ${!boostHead ? '' : `<h3 class="h-sec">${esc(t('progress.nextTarget'))}</h3>
    <div class="stat accent next" style="margin-bottom:10px">
      <span class="k">${esc(t('progress.nextTargetOf', { metric: boost.metric.short }))}</span>
      <span class="v">${esc(boostHead.v)}${boostHead.small
        ? `<small>${esc(boostHead.small)}</small>` : ''}</span>
      <span class="m">${esc([
        t('progress.beats', { value: boostValue(boost, boost.target) }),
        plural('progress.stood', boost.stood),
        boost.streak >= 1 ? t('boost.climbing', { n: boost.streak + 1 }) : '',
      ].filter(Boolean).join(' · '))}</span>
    </div>`}

    <h3 class="h-sec">${esc(t('progress.records'))}</h3>
    <div class="stat-grid" style="margin-bottom:10px">
      <div class="stat accent"><span class="k">${esc(t('progress.bestE1rm'))}</span>
        <span class="v">${pr.e1rm ? S.fmtNum(pr.e1rm.value, 1) : '—'}<small>${esc(unit())}</small></span>
        <span class="m">${pr.e1rm && pr.e1rm.set ? `${S.fmtNum(pr.e1rm.set.weight)}×${pr.e1rm.set.reps} · ${esc(S.fmtDate(pr.e1rm.date))}` : esc(t('word.noData'))}</span></div>
      <div class="stat"><span class="k">${esc(t('metric.weight.label'))}</span>
        <span class="v">${pr.weight ? S.fmtNum(pr.weight.value) : '—'}<small>${esc(unit())}</small></span>
        <span class="m">${pr.weight ? `${esc(t('count.reps', { n: pr.weight.reps }))} · ${esc(S.fmtDate(pr.weight.date))}` : esc(t('word.noData'))}</span></div>
    </div>
    <p class="eyebrow">${esc(t('progress.heaviestPerReps'))}</p>
    <div class="pr-list">
      ${S.REP_TARGETS.map((target) => {
        const p = pr.byReps[target];
        return `<div class="pr"><div class="k">${esc(t('progress.repsPlus', { n: target }))}</div>
          <div class="v" style="${p ? '' : 'color:var(--dim)'}">${p ? S.fmtNum(p.value) : '—'}</div></div>`;
      }).join('')}
    </div>
    <p class="meta">${esc(t('progress.setsLogged', {
      sessions: pr.sessions, sets: pr.totalSets }))}</p>`}`;

  if (!full.length) return;

  // `label` is the tooltip text, `xlab` the short form printed on the axis.
  const label = (p) => S.fmtDate(p.date);
  const empty = t('progress.emptyWindow');
  // Every chart here plots the same sessions on the same x scale, so they act
  // as one figure: picking a session in any of them marks it in all of them.
  const sync = 'progress-exercise';

  lineChart($('#c-1rm'),
    series.map((p) => ({
      x: p.ts,
      y: bodyweight ? p.sets.reduce((m, s) => Math.max(m, s.reps), 0) : p.e1rm,
      label: label(p), xlab: label(p),
    })),
    { format: (v) => (bodyweight
      ? t('count.reps', { n: S.fmtNum(v, 0) }) : `${S.fmtNum(v, 1)} ${unit()}`),
      tickFormat: (v) => S.fmtNum(v, 0), empty, sync });

  if (!bodyweight) {
    setChart($('#c-sets'),
      series.map((p) => ({ x: p.ts, label: label(p), sets: p.sets })),
      { height: 190, format: (v) => `${S.fmtNum(v)} ${unit()}`,
        weightFormat: (v) => S.fmtNum(v, 1), repFormat: (v) => String(Math.round(v)), empty, sync });
  }

  barChart($('#c-svol'),
    series.map((p) => ({ x: p.ts, label: label(p), value: Math.round(p.volume), sub: label(p) })),
    { format: (v) => S.fmtVolume(v, unit()), height: 140, valueLabel: t('word.total'),
      overlay: trend && trend.ready ? { values: trend.values, label: trend.label } : null,
      tickFormat: (v) => (v >= 1000 ? `${S.fmtNum(v / 1000, 0)}k` : String(Math.round(v))), empty, sync });

  if (!bodyweight) {
    // No date in the reading — the x tick under the point carries it, and all
    // four charts read out the same session at once.
    lineChart($('#c-top'),
      series.map((p) => ({ x: p.ts, y: p.topWeight,
        label: t('count.reps', { n: p.topWeightReps }), xlab: label(p) })),
      { format: (v) => `${S.fmtNum(v)} ${unit()}`, tickFormat: (v) => S.fmtNum(v, 0), empty, sync });
  }
}

/* ==========================================================================
   EDITABLE OPTION LISTS

   Rest timer, Weight step and Averaged over are dropdowns whose contents you
   can change. All three work the same way: the stored setting holds one
   chosen value plus the list of values on offer, the last entry of the select
   is "Edit this list…", and choosing it opens the editor instead of picking
   anything.

   Every list passes through sanitize() on the way in and out, so a hand-edited
   backup, a duplicate, or a value from the wrong unit cannot put a broken
   choice in front of you.
   ========================================================================== */

const OPTION_MAX = 16;
const OPTION_EDIT = '__edit';

/** Seconds as something readable: 45s · 2 min · 1 min 15s. */
function fmtSeconds(v) {
  const n = Math.round(Number(v) || 0);
  if (n < 60) return t('time.seconds', { n });
  const m = Math.floor(n / 60);
  const s = n % 60;
  return s ? t('time.minutesSeconds', { m, s }) : t('time.minutesOnly', { m });
}

/* Every label here is a function rather than a string: they are read whenever
   a sheet is built, and both the language and the weight unit can have moved
   since the module was evaluated. */
const OPTION_LISTS = {
  restTimerSeconds: {
    key: 'restTimerOptions',
    defaults: db.DEFAULT_REST_OPTIONS,
    title: () => t('options.rest.title'),
    body: () => t('options.rest.body'),
    addLabel: () => t('options.rest.add'),
    placeholder: '75',
    inputMode: 'numeric',
    invalid: () => t('options.rest.invalid'),
    clean: (v) => {
      const n = Math.round(Number(String(v).replace(',', '.')));
      return isFinite(n) && n >= 5 && n <= 3600 ? n : null;
    },
    format: fmtSeconds,
  },
  weightStep: {
    key: 'weightStepOptions',
    defaults: db.DEFAULT_WEIGHT_STEPS,
    title: () => t('options.step.title'),
    body: () => t('options.step.body'),
    addLabel: () => t('options.step.add', { unit: unit() }),
    placeholder: '1.25',
    inputMode: 'decimal',
    invalid: () => t('options.step.invalid'),
    clean: (v) => {
      const n = Math.round(Number(String(v).replace(',', '.')) * 100) / 100;
      return isFinite(n) && n >= 0.25 && n <= 100 ? n : null;
    },
    // fmtDec, not fmtNum: the latter pads to its decimal places, and 2,50 kg
    // beside 1 kg reads as a precision the plates do not have. clean()
    // already rounded.
    format: (v) => `${S.fmtDec(v)} ${unit()}`,
  },
  volumeTrendPeriod: {
    key: 'volumeTrendPeriodOptions',
    defaults: db.DEFAULT_TREND_PERIODS,
    title: () => t('options.trend.title'),
    body: () => t('options.trend.body'),
    addLabel: () => t('options.trend.add'),
    placeholder: '6',
    inputMode: 'numeric',
    invalid: () => t('options.trend.invalid', {
      min: S.MA_PERIOD_MIN, max: S.MA_PERIOD_MAX }),
    clean: (v) => {
      const n = Math.round(Number(String(v).replace(',', '.')));
      return isFinite(n) && n >= S.MA_PERIOD_MIN && n <= S.MA_PERIOD_MAX ? n : null;
    },
    format: (v) => t('options.trend.format', { n: v }),
  },
};

const optionLabel = (spec, field) =>
  (typeof spec[field] === 'function' ? spec[field]() : spec[field]);

/**
 * A clean, sorted, de-duplicated list. `keep` is the value currently in use:
 * it is added back if it is missing, because a setting you cannot see in its
 * own dropdown reads as the app having forgotten it.
 */
function sanitizeOptions(spec, list, keep = null) {
  const seen = new Set();
  const out = [];
  const add = (v) => {
    const n = spec.clean(v);
    if (n == null || seen.has(n)) return;
    seen.add(n);
    out.push(n);
  };
  (Array.isArray(list) ? list : []).forEach(add);
  add(keep);
  if (!out.length) spec.defaults.forEach(add);
  out.sort((a, b) => a - b);
  if (out.length <= OPTION_MAX) return out;
  // Trim from the end, but never drop the value in use.
  const kept = spec.clean(keep);
  const cut = out.slice(0, OPTION_MAX);
  if (kept != null && !cut.includes(kept)) cut[cut.length - 1] = kept;
  return cut.sort((a, b) => a - b);
}

/** The offered values for a setting, always including the one in use. */
function optionValues(id) {
  const spec = OPTION_LISTS[id];
  return sanitizeOptions(spec, state.settings[spec.key], state.settings[id]);
}

function optionSelectHtml(id, domId) {
  const spec = OPTION_LISTS[id];
  const current = spec.clean(state.settings[id]);
  return `<select class="input" id="${domId}" data-pref="${id}" data-options="${id}">
      ${optionValues(id).map((v) => `<option value="${v}"
        ${v === current ? 'selected' : ''}>${esc(spec.format(v))}</option>`).join('')}
      <option value="${OPTION_EDIT}">${esc(t('options.edit'))}</option>
    </select>`;
}

/** Write a list back, keeping the chosen value valid. */
function saveOptions(id, values) {
  const spec = OPTION_LISTS[id];
  const list = sanitizeOptions(spec, values, null);
  state.settings[spec.key] = list;
  if (!list.includes(spec.clean(state.settings[id]))) {
    // The value in use was just removed. Fall to its nearest neighbour rather
    // than to a default, so a 2.5 kg step becomes 2 and not 2.5 again.
    const cur = spec.clean(state.settings[id]);
    state.settings[id] = list.reduce((best, v) =>
      (Math.abs(v - cur) < Math.abs(best - cur) ? v : best), list[0]);
  }
  db.saveSettings(state.settings);
  return list;
}

function editOptionsSheet(id) {
  const spec = OPTION_LISTS[id];

  const rowsHtml = (values) => values.map((v) => `
    <div class="opt-row">
      <span class="opt-v">${esc(spec.format(v))}</span>
      ${values.length > 1
        ? `<button class="btn btn-sm btn-quiet" data-rm="${v}"
             aria-label="${esc(t('options.removeAria', { value: spec.format(v) }))}">${esc(t('action.remove'))}</button>`
        : `<span class="opt-note">${esc(t('options.lastOne'))}</span>`}
    </div>`).join('');

  openSheet(`
    <h2>${esc(optionLabel(spec, 'title'))}</h2>
    <p class="sub">${esc(optionLabel(spec, 'body'))}</p>
    <div class="opt-list" data-list>${rowsHtml(optionValues(id))}</div>
    <div class="field" style="margin-top:14px">
      <label for="opt-add">${esc(optionLabel(spec, 'addLabel'))}</label>
      <div class="btn-row">
        <input class="input" id="opt-add" inputmode="${spec.inputMode}"
               enterkeyhint="done" autocomplete="off" placeholder="${esc(spec.placeholder)}">
        <button class="btn" data-x="add" style="flex:0 0 auto">${esc(t('action.add'))}</button>
      </div>
    </div>
    <div class="btn-row" style="margin-top:4px">
      <button class="btn btn-sm btn-quiet" data-x="reset">${esc(t('options.reset'))}</button>
      <button class="btn btn-sm btn-primary" data-x="done">${esc(t('action.done'))}</button>
    </div>`, (root) => {
    const input = $('#opt-add', root);
    const redraw = (values) => { $('[data-list]', root).innerHTML = rowsHtml(values); };

    const add = () => {
      const n = spec.clean(input.value);
      if (n == null) { toast(optionLabel(spec, 'invalid')); return; }
      const values = optionValues(id);
      if (values.includes(n)) { toast(t('options.duplicate', { value: spec.format(n) })); return; }
      if (values.length >= OPTION_MAX) { toast(t('options.full', { max: OPTION_MAX })); return; }
      redraw(saveOptions(id, values.concat([n])));
      input.value = '';
      toast(t('options.added', { value: spec.format(n) }));
    };

    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });

    root.addEventListener('click', (e) => {
      const rm = e.target.closest('[data-rm]');
      if (rm) {
        const gone = Number(rm.dataset.rm);
        redraw(saveOptions(id, optionValues(id).filter((v) => v !== gone)));
        toast(t('options.removed', { value: spec.format(gone) }));
        return;
      }
      const b = e.target.closest('[data-x]');
      if (!b) return;
      if (b.dataset.x === 'add') add();
      if (b.dataset.x === 'reset') {
        redraw(saveOptions(id, spec.defaults.slice()));
        toast(t('options.wasReset'));
      }
      if (b.dataset.x === 'done') { closeSheet(); render(); }
    });
  });
}

/* ==========================================================================
   VIEW: SETTINGS  (was "Data" — same tab, same glyph)
   ========================================================================== */

async function viewSettings() {
  const est = await db.storageEstimate();
  const persisted = navigator.storage && navigator.storage.persisted
    ? await navigator.storage.persisted().catch(() => false) : false;
  const last = state.settings.lastExportAt;
  const daysSinceExport = last ? Math.floor((Date.now() - last) / 86400000) : null;
  const trendMode = S.maMode(state.settings.volumeTrend);
  const trendPeriod = S.maPeriod(state.settings.volumeTrendPeriod);
  const boost = S.boostMetric(state.settings.boostMetric);

  $('#view').innerHTML = `
    <p class="eyebrow">${esc(t('settings.eyebrow'))}</p>
    <h2 class="h-big">${esc(t('settings.title'))}</h2>
    <p class="sub">${esc(t('settings.sub', {
      sessions: state.sessions.length, exercises: state.exercises.length }))}</p>

    ${daysSinceExport === null || daysSinceExport >= EXPORT_NAG_DAYS ? `<div class="hint" style="margin-top:16px">
      <div><b>${esc(t('settings.exportNag'))}</b> ${daysSinceExport === null
        ? esc(t('settings.neverExported'))
        : esc(t('settings.lastExportWas', { n: daysSinceExport }))}</div></div>`
      : `<p class="meta" style="text-align:left;padding:14px 0 0">
      ${esc(plural('settings.lastExport', daysSinceExport))}</p>`}

    <div class="btn-row" style="margin-top:14px">
      <button class="btn btn-primary" data-act="export">${esc(t('settings.exportBackup'))}</button>
      <button class="btn" data-act="import">${esc(t('settings.importBackup'))}</button>
    </div>
    <div class="btn-row" style="margin-top:8px">
      <button class="btn btn-sm" data-act="export-csv">${esc(t('settings.exportCsv'))}</button>
      <button class="btn btn-sm" data-act="import-csv">${esc(t('settings.importCsv'))}</button>
      <button type="button" class="icon-btn" data-act="data-info" style="flex:0 0 auto"
        aria-label="${esc(t('settings.dataInfoAria'))}">${ICON_INFO}</button>
    </div>
    <input type="file" id="file-json" accept=".json,application/json" hidden>
    <input type="file" id="file-csv" accept=".csv,text/csv,text/plain" hidden>

    <h3 class="h-sec">${esc(t('settings.appearance'))}</h3>
    <div class="card card-pad">
      <div class="field">
        <label for="p-theme">${esc(t('settings.theme'))}</label>
        <select class="input" id="p-theme" data-pref="theme">
          ${THEMES.map((th) => `<option value="${th.id}"
            ${state.settings.theme === th.id ? 'selected' : ''}>${esc(th.label)}</option>`).join('')}
        </select>
        <p class="meta" style="text-align:left;padding:6px 0 0">
          ${esc(t('settings.themeNote', {
            glyph: t(effectiveTheme() === 'dark' ? 'theme.sun' : 'theme.moon') }))}</p>
      </div>
      <div class="field" style="margin-bottom:0">
        <label for="p-lang">${esc(t('settings.language'))}</label>
        <select class="input" id="p-lang" data-pref="lang">
          ${LANGS.map((l) => `<option value="${l.id}"
            ${getLang() === l.id ? 'selected' : ''}>${esc(l.label)}</option>`).join('')}
        </select>
        <p class="meta" style="text-align:left;padding:6px 0 0">
          ${esc(t('settings.languageNote', { code: t('lang.otherShort') }))}</p>
      </div>
    </div>

    <h3 class="h-sec">${esc(t('settings.preferences'))}</h3>
    <div class="card card-pad">
      <div class="field">
        <label for="p-unit">${esc(t('settings.unit'))}</label>
        <select class="input" id="p-unit" data-pref="unit">
          <option value="kg" ${unit() === 'kg' ? 'selected' : ''}>${esc(t('settings.kg'))}</option>
          <option value="lb" ${unit() === 'lb' ? 'selected' : ''}>${esc(t('settings.lb'))}</option>
        </select>
      </div>
      <div class="field">
        <label for="p-wstep">${esc(t('settings.weightStep'))}</label>
        ${optionSelectHtml('weightStep', 'p-wstep')}
      </div>
      <div class="field">
        <label for="p-rstep">${esc(t('settings.repStep'))}</label>
        <input class="input" id="p-rstep" data-pref="repStep" inputmode="numeric" value="${state.settings.repStep}">
      </div>
      <div class="field">
        <label for="p-rest">${esc(t('settings.restTimer'))}</label>
        ${optionSelectHtml('restTimerSeconds', 'p-rest')}
      </div>
      <div class="field" style="margin-bottom:0">
        <label for="p-auto">${esc(t('settings.restAuto'))}</label>
        <select class="input" id="p-auto" data-pref="restTimerAuto">
          <option value="yes" ${state.settings.restTimerAuto ? 'selected' : ''}>${esc(t('settings.restAutoYes'))}</option>
          <option value="no" ${!state.settings.restTimerAuto ? 'selected' : ''}>${esc(t('settings.restAutoNo'))}</option>
        </select>
        <p class="meta" style="text-align:left;padding:6px 0 0">
          ${esc(t('settings.editListNote'))}</p>
      </div>
    </div>

    <h3 class="h-sec">${esc(t('settings.motivation'))}</h3>
    <div class="card card-pad">
      <div class="field" style="margin-bottom:0">
        <label for="p-boost">${esc(t('settings.boostMetric'))}</label>
        <select class="input" id="p-boost" data-pref="boostMetric">
          ${S.BOOST_METRICS.map((m) => `<option value="${m.id}"
            ${boost.id === m.id ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}
        </select>
        <p class="meta" style="text-align:left;padding:6px 0 0">${esc(boostNote(boost.id))}</p>
      </div>
    </div>

    <h3 class="h-sec">${esc(t('settings.plot'))}</h3>
    <div class="card card-pad">
      <div class="field" ${trendMode.id === 'off' ? 'style="margin-bottom:0"' : ''}>
        <label for="p-trend">${esc(t('settings.trend'))}</label>
        <select class="input" id="p-trend" data-pref="volumeTrend">
          ${S.MA_MODES.map((m) => `<option value="${m.id}"
            ${trendMode.id === m.id ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}
        </select>
        <p class="meta" style="text-align:left;padding:6px 0 0">
          ${esc(t('settings.trendNote'))}</p>
      </div>
      ${trendMode.id === 'off' ? '' : `<div class="field" style="margin-bottom:0">
        <label for="p-trend-n">${esc(t('settings.trendPeriod'))}</label>
        ${optionSelectHtml('volumeTrendPeriod', 'p-trend-n')}
        <p class="meta" style="text-align:left;padding:6px 0 0">
          ${esc(t(trendMode.id === 'ema' ? 'settings.emaNote' : 'settings.smaNote',
            { n: trendPeriod }))}</p>
      </div>`}
    </div>

    <h3 class="h-sec">${esc(t('settings.routines'))}</h3>
    <a class="btn btn-block" href="#/routines">${esc(t('settings.manageRoutines'))}${state.routines.length
      ? ` <span style="color:var(--mist)">· ${state.routines.length}</span>` : ''}</a>

    <h3 class="h-sec">${esc(t('settings.exercises'))}</h3>
    <a class="btn btn-block" href="#/exercises">${esc(t('settings.manageExercises'))}</a>

    <h3 class="h-sec">${esc(t('settings.storage'))}</h3>
    <div class="card card-pad">
      <p class="sub" style="margin:0 0 6px">
        ${esc(persisted ? t('settings.persisted') : t('settings.notPersisted'))}
      </p>
      ${est && est.usage != null ? `<p class="meta" style="text-align:left;padding:0">
        ${esc(t('settings.storageUsed', { used: (est.usage / 1048576).toFixed(2) }))}${
          est.quota ? esc(t('settings.storageOf', { quota: (est.quota / 1048576).toFixed(0) })) : ''}</p>` : ''}
    </div>

    <h3 class="h-sec">${esc(t('settings.app'))}</h3>
    <div class="btn-row">
      <button class="btn" data-act="reload-app">${esc(t('settings.reloadApp'))}</button>
      <button class="btn" data-act="check-update">${esc(t('settings.checkUpdate'))}</button>
    </div>
    <button class="btn btn-block btn-sm" style="margin-top:8px" data-act="clear-cache">${esc(t('settings.clearCache'))}</button>
    <p class="meta" style="text-align:left;padding:6px 0 0">${esc(t('settings.appNote'))}</p>

    <hr class="sep">
    ${hasDemoData() ? `
      <button class="btn btn-danger btn-block btn-sm" style="margin-bottom:10px"
        data-act="remove-demo">${esc(t('settings.removeDemo'))}</button>` : ''}
    <button class="btn btn-danger btn-block" data-act="erase">${esc(t('settings.erase'))}</button>
    <p class="meta">flexloop ·
      <button type="button" class="linkish" data-act="version">${esc(VERSION_SHORT)}</button>
      · ${esc(t('word.offline'))}</p>`;
}

function viewExercises() {
  const counts = new Map();
  for (const s of state.sessions) {
    for (const e of s.entries || []) counts.set(e.exerciseId, (counts.get(e.exerciseId) || 0) + 1);
  }
  $('#topbar-action').innerHTML =
    `<a class="btn btn-sm btn-quiet" href="#/settings">${esc(t('action.back'))}</a>`;
  $('#view').innerHTML = `
    <p class="eyebrow">${esc(t('exercises.eyebrow'))}</p>
    <h2 class="h-big">${esc(t('exercises.count', { n: state.exercises.length }))}</h2>
    <p class="sub">${esc(t('exercises.sub'))}</p>
    <div style="height:14px"></div>
    <div class="rows">${state.exercises.map((e) => `
      <button class="row" data-act="edit-exercise" data-id="${esc(e.id)}">
        <span class="grow"><span class="t">${esc(e.name)}</span>
          <span class="s">${esc(e.muscleGroup || t('exercise.uncategorised'))}${
            e.isBodyweight ? ` · ${esc(t('word.bodyweight'))}` : ''}</span></span>
        <span class="r">${counts.get(e.id) || 0}<em>${esc(t('exercises.sessShort'))}</em></span>
      </button>`).join('') || `<div class="empty" style="padding:26px"><p style="margin:0">${esc(t('exercises.none'))}</p></div>`}</div>`;
}

function editExerciseSheet(id) {
  const ex = state.byId.get(id);
  if (!ex) return;
  openSheet(`
    <h2>${esc(t('exercises.editTitle'))}</h2>
    <div class="field"><label for="e-name">${esc(t('exercises.name'))}</label>
      <input class="input" id="e-name" value="${esc(ex.name)}" autocapitalize="words"></div>
    <div class="field"><label for="e-group">${esc(t('exercises.group'))}</label>
      <input class="input" id="e-group" value="${esc(ex.muscleGroup || '')}" placeholder="${esc(t('exercises.groupPlaceholder'))}" autocapitalize="words"></div>
    <div class="field"><label for="e-bw">${esc(t('exercises.loading'))}</label>
      <select class="input" id="e-bw">
        <option value="no" ${ex.isBodyweight ? '' : 'selected'}>${esc(t('exercises.weighted'))}</option>
        <option value="yes" ${ex.isBodyweight ? 'selected' : ''}>${esc(t('exercises.bodyweightOption'))}</option>
      </select></div>
    <div class="btn-row" style="margin-top:16px">
      <button class="btn" data-close>${esc(t('action.cancel'))}</button>
      <button class="btn btn-primary" data-x="save">${esc(t('action.save'))}</button>
    </div>
    <button class="btn btn-danger btn-block btn-sm" style="margin-top:10px" data-x="del">${esc(t('exercises.delete'))}</button>`,
  (root) => {
    root.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-x]');
      if (!b) return;
      if (b.dataset.x === 'save') {
        ex.name = $('#e-name', root).value.trim() || ex.name;
        ex.muscleGroup = $('#e-group', root).value.trim() || t('exercise.uncategorised');
        ex.isBodyweight = $('#e-bw', root).value === 'yes';
        await db.saveExercise(ex);
        closeSheet();
        await reload();
        render();
        toast(t('exercises.saved'));
      } else {
        closeSheet();
        const ok = await confirmSheet({
          title: t('exercises.deleteTitle', { name: ex.name }),
          body: t('exercises.deleteBody'),
          confirm: t('action.delete'), danger: true,
        });
        if (!ok) return;
        await db.deleteExercise(ex.id);
        await reload();
        render();
        toast(t('exercises.deleted'));
      }
    });
  });
}

/* ==========================================================================
   VIEW: ROUTINES

   A routine is an ordered exercise list with a set count each. It stores no
   weights on purpose — sets prefill from the last time you trained the
   exercise, so a stored target would only go stale.
   ========================================================================== */

const routineById = (id) => state.routines.find((r) => r.id === id) || null;

/** Set counts are clamped: a routine is a plan, not a place to store 40 sets. */
const setCountOf = (item) => Math.max(1, Math.min(12, Math.round(Number(item && item.sets) || 1)));

async function saveRoutine(r) {
  r.updatedAt = Date.now();
  await db.saveRoutine(r);
  state.routines = sortRoutines(state.routines);
}

function viewRoutines() {
  $('#topbar-action').innerHTML =
    `<a class="btn btn-sm btn-quiet" href="#/settings">${esc(t('action.back'))}</a>`;
  const rows = state.routines.map((r) => `
    <button class="row" data-act="open-routine" data-id="${esc(r.id)}">
      <span class="grow">
        <span class="t">${esc(r.name)}</span>
        <span class="s">${esc(routineSummary(r))}</span>
      </span>
      <span class="r">${r.lastUsedAt
        ? esc(S.relativeDays(S.localDate(new Date(r.lastUsedAt))))
        : esc(t('word.new'))}</span>
    </button>`).join('');

  $('#view').innerHTML = `
    <p class="eyebrow">${esc(t('routines.eyebrow'))}</p>
    <h2 class="h-big">${esc(t('routines.saved', { n: state.routines.length }))}</h2>
    <p class="sub">${esc(t('routines.sub'))}</p>
    <div style="height:14px"></div>
    <button class="btn btn-block" data-act="new-routine">${esc(t('routines.new'))}</button>
    ${state.routines.length ? `<div style="height:12px"></div><div class="rows">${rows}</div>`
      : `<div class="empty"><div class="glyph"></div><h3>${esc(t('routines.none'))}</h3>
         <p>${esc(t('routines.noneBody'))}</p></div>`}`;
}

function viewRoutine(id) {
  const r = routineById(id);
  const view = $('#view');
  if (!r) {
    view.innerHTML = `<div class="empty"><div class="glyph"></div><h3>${esc(t('routine.notFound'))}</h3>
      <p>${esc(t('session.maybeDeleted'))}</p>
      <a class="btn" href="#/routines">${esc(t('routine.backToRoutines'))}</a></div>`;
    return;
  }
  $('#topbar-action').innerHTML =
    `<a class="btn btn-sm btn-quiet" href="#/routines">${esc(t('action.back'))}</a>`;
  const items = r.items || [];
  const missing = items.filter((it) => !state.byId.has(it.exerciseId)).length;

  view.innerHTML = `
    <p class="eyebrow">${esc(t('routine.eyebrow'))}</p>
    <h2 class="h-big">${esc(r.name)}</h2>
    <p class="sub">${esc(routineSummary(r))}${missing
      ? ` · ${esc(plural('routine.skipped', missing))}` : ''}</p>
    <div style="height:14px"></div>

    ${items.length ? `<div class="rt-list">${items.map((it, i) => {
      const ex = state.byId.get(it.exerciseId);
      return `<div class="rt-item" data-i="${i}">
        <span class="rt-name${ex ? '' : ' is-gone'}">${esc(ex ? ex.name : t('exercise.removed'))}</span>
        <span class="rt-sets">
          <button class="step" data-act="routine-sets" data-d="-1" aria-label="${esc(t('routine.fewerSets'))}">−</button>
          <span class="rt-n">${setCountOf(it)}<em>${esc(t('routine.setsShort'))}</em></span>
          <button class="step" data-act="routine-sets" data-d="1" aria-label="${esc(t('routine.moreSets'))}">+</button>
        </span>
        <button class="btn btn-sm btn-quiet" data-act="routine-item-menu" aria-label="${esc(t('action.options'))}">•••</button>
      </div>`;
    }).join('')}</div>` : `<div class="empty" style="padding:26px 10px">
      <p style="margin:0">${esc(t('routine.empty'))}</p></div>`}

    <button class="btn btn-block" data-act="routine-add">${esc(t('routine.addExercise'))}</button>
    <div style="height:18px"></div>
    <button class="btn btn-primary btn-block btn-lg" data-act="start-routine" data-id="${esc(r.id)}">
      ${esc(t('routine.start'))}</button>
    <div class="btn-row" style="margin-top:10px">
      <button class="btn btn-sm" data-act="rename-routine" data-id="${esc(r.id)}">${esc(t('action.rename'))}</button>
      <button class="btn btn-sm btn-danger" data-act="delete-routine" data-id="${esc(r.id)}">${esc(t('action.delete'))}</button>
    </div>`;
}

/** The item index a control inside the routine editor belongs to. */
function routineItemIndex(el) {
  const row = el.closest('[data-i]');
  return row ? Number(row.dataset.i) : -1;
}

function routineItemMenu(r, i) {
  const it = r.items[i];
  const ex = state.byId.get(it.exerciseId);
  openSheet(`
    <h2>${esc(ex ? ex.name : t('exercise.removed'))}</h2>
    <p class="sub">${esc(t('routine.position', {
      sets: plural('count.sets', setCountOf(it)), i: i + 1, total: r.items.length }))}</p>
    <div class="rows" style="margin-top:14px">
      <button class="row" data-x="up"><span class="grow"><span class="t">${esc(t('routine.moveUp'))}</span></span></button>
      <button class="row" data-x="down"><span class="grow"><span class="t">${esc(t('routine.moveDown'))}</span></span></button>
      <button class="row" data-x="rm"><span class="grow"><span class="t" style="color:var(--danger)">${esc(t('routine.removeItem'))}</span>
        <span class="s">${esc(t('routine.removeItemSub'))}</span></span></button>
    </div>`, (root) => {
    root.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-x]');
      if (!b) return;
      const list = r.items;
      if (b.dataset.x === 'up' && i > 0) list.splice(i - 1, 0, list.splice(i, 1)[0]);
      if (b.dataset.x === 'down' && i < list.length - 1) list.splice(i + 1, 0, list.splice(i, 1)[0]);
      if (b.dataset.x === 'rm') list.splice(i, 1);
      await saveRoutine(r);
      closeSheet();
      render();
    });
  });
}

/** Turn the exercises of a session into a routine. */
async function saveSessionAsRoutine(session) {
  const items = (session.entries || [])
    .filter((e) => state.byId.has(e.exerciseId))
    .map((e) => ({
      exerciseId: e.exerciseId,
      // Warmups are per-day, not part of the plan.
      sets: Math.max(1, e.sets.filter((s) => !s.isWarmup).length),
    }));
  if (!items.length) {
    toast(t('routine.nothingToSave'));
    return;
  }
  // Guess a name from the muscle group that dominates the session. A group is
  // stored as words, so an exercise added before the language was switched
  // still carries the other language's "Uncategorised" — neither is a name.
  const uncategorised = variants('exercise.uncategorised');
  const tally = new Map();
  for (const it of items) {
    const g = (state.byId.get(it.exerciseId).muscleGroup || '').trim();
    if (g && !uncategorised.includes(g)) tally.set(g, (tally.get(g) || 0) + 1);
  }
  const suggested = [...tally.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g)[0] || '';

  const name = await promptSheet({
    title: t('routine.saveTitle'),
    body: t('routine.saveBody', { exercises: plural('count.exercises', items.length) }),
    label: t('routine.name'),
    value: suggested,
    placeholder: t('routine.namePlaceholder'),
  });
  if (!name) return;

  const r = { id: uid('r'), name, items, createdAt: Date.now(), updatedAt: Date.now(), lastUsedAt: null };
  await db.saveRoutine(r);
  state.routines = sortRoutines(state.routines.concat([r]));
  toast(t('routine.savedToast', { name: r.name }), t('action.edit'),
    () => { location.hash = `#/routine/${r.id}`; });
}

/* ==========================================================================
   EXPORT / IMPORT
   ========================================================================== */

/** Hand a string to the browser as a file. The only way out of this app. */
function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function doExport() {
  const data = await db.exportAll();
  download(`flexloop-${S.localDate()}.json`, JSON.stringify(data, null, 2), 'application/json');
  state.settings.lastExportAt = Date.now();
  db.saveSettings(state.settings);
  toast(t('io.exportedSessions', { n: data.sessions.length }));
  render();
}

/**
 * CSV is the interchange format, not a backup: it carries working sets and
 * nothing else. lastExportAt is deliberately left alone — the nag exists
 * because the .json is the only complete copy, and a lossy file must not
 * silence it.
 */
async function doExportCsv() {
  const data = await db.exportAll();
  const csv = toStrongifyCsv({
    sessions: data.sessions,
    exercises: data.exercises,
    appVersion: APP_VERSION,
  });
  download(`flexloop-${S.localDate()}.csv`, csv, 'text/csv');
  const rows = csv.split('\n').length - 2; // less the header and trailing newline
  toast(t('io.exportedSets', { n: rows }));
}

function readFile(input) {
  return new Promise((resolve, reject) => {
    const f = input.files && input.files[0];
    if (!f) return reject(new Error(t('io.noFile')));
    const r = new FileReader();
    r.onload = () => resolve({ text: String(r.result), name: f.name });
    r.onerror = () => reject(new Error(t('io.unreadable')));
    r.readAsText(f);
  });
}

async function doImportJson(input) {
  try {
    const { text } = await readFile(input);
    const data = JSON.parse(text);
    db.validateBackup(data);
    const nRoutines = Array.isArray(data.routines) ? data.routines.length : 0;
    const mode = await chooseImportModeSheet({
      title: t('io.mergeOrReplace'),
      body: t('io.mergeOrReplaceBody', {
        sessions: plural('count.sessions', data.sessions.length),
        exercises: plural('count.exercises', data.exercises.length),
        routines: nRoutines
          ? t('io.andRoutines', { routines: plural('count.routines', nRoutines) }) : '',
      }),
    });
    if (!mode) return;
    const res = await db.importAll(data, mode);
    // Harmless re-read after a merge, which never writes settings.
    state.settings = db.loadSettings();
    // A replace brings the file's own language with it.
    setLang(state.settings.lang);
    applyLang();
    await reload();
    render();
    toast(t(mode === 'merge' ? 'io.merged' : 'io.restored', { n: res.sessions }));
  } catch (err) {
    toast(err.message || t('io.importFailed'), null, null, 5000);
  } finally {
    input.value = '';
  }
}

async function doImportCsv(input) {
  try {
    const { text } = await readFile(input);
    if (!looksLikeStrongify(text)) {
      const cont = await confirmSheet({
        title: t('io.unfamiliarCsv'),
        body: t('io.unfamiliarCsvBody'),
        confirm: t('io.tryAnyway'),
      });
      if (!cont) return;
    }
    const data = parseStrongifyCsv(text);
    const r = data._report;
    const ok = await confirmSheet({
      title: t('io.importHistory'),
      body: t('io.importHistoryBody', {
        sessions: plural('count.sessions', r.sessions),
        exercises: plural('count.exercises', r.exercises),
        skipped: r.skipped ? t('io.skippedRows', { n: r.skipped }) : '',
      }),
      confirm: t('action.import'),
    });
    if (!ok) return;
    const res = await db.importAll(data, 'merge');
    await reload();
    render();
    toast(t('io.imported', { n: res.sessions }));
  } catch (err) {
    toast(err.message || t('io.importFailed'), null, null, 5000);
  } finally {
    input.value = '';
  }
}

/* ------------------------------------------------------------ sample data */

/** True while the sample dataset is on the device. Gates both its buttons. */
const hasDemoData = () => state.sessions.some((s) => s.source === 'demo');

async function loadDemoData() {
  const data = buildDemoData({ unit: state.settings.unit });
  const ok = await confirmSheet({
    title: t('demo.loadTitle'),
    body: t('demo.loadBody', {
      sessions: data.sessions.length,
      exercises: plural('count.exercises', data.exercises.length),
      routines: plural('count.routines', data.routines.length),
    }),
    confirm: t('demo.loadConfirm'),
  });
  if (!ok) return;
  const res = await db.importAll(data, 'merge');
  await reload();
  render();
  toast(t('demo.loaded', { n: res.sessions }));
}

/**
 * The mirror of loadDemoData. Sessions and routines go by their id prefix,
 * but an exercise is kept if any real session still uses it — otherwise
 * logging one set against a sample lift and then removing the samples would
 * leave that session reading "Removed exercise".
 */
async function removeDemoData() {
  const doomed = state.sessions.filter((s) => s.source === 'demo');
  const ok = await confirmSheet({
    title: t('demo.removeTitle'),
    body: t('demo.removeBody', { n: doomed.length }),
    confirm: t('action.remove'), danger: true,
  });
  if (!ok) return;

  const keptIds = new Set();
  for (const s of state.sessions) {
    if (s.source === 'demo') continue;
    for (const e of s.entries || []) keptIds.add(e.exerciseId);
  }

  await Promise.all([
    ...doomed.map((s) => db.deleteSession(s.id)),
    ...state.routines.filter((r) => isDemoRoutine(r.id)).map((r) => db.deleteRoutine(r.id)),
    ...state.exercises
      .filter((ex) => isDemoExercise(ex.id) && !keptIds.has(ex.id))
      .map((ex) => db.deleteExercise(ex.id)),
  ]);

  await reload();
  render();
  toast(t('demo.removed', { n: doomed.length }));
}

/* ==========================================================================
   REST TIMER  (target timestamp, not a countdown — survives screen lock)
   ========================================================================== */

const REST_KEY = 'flexloop.rest';

function startRest(seconds) {
  const total = Number(seconds) || Number(state.settings.restTimerSeconds) || 120;
  localStorage.setItem(REST_KEY, JSON.stringify({ endsAt: Date.now() + total * 1000, total }));
  tickRest();
}
function stopRest() {
  localStorage.removeItem(REST_KEY);
  $('#rest').hidden = true;
  document.body.classList.remove('has-rest');
}
function readRest() {
  try { return JSON.parse(localStorage.getItem(REST_KEY) || 'null'); } catch { return null; }
}

let restDone = false;
function tickRest() {
  const bar = $('#rest');
  const r = readRest();
  if (!r) { bar.hidden = true; document.body.classList.remove('has-rest'); return; }
  const left = Math.round((r.endsAt - Date.now()) / 1000);
  if (left <= -3) { stopRest(); return; }
  bar.hidden = false;
  document.body.classList.add('has-rest');
  const shown = Math.max(0, left);
  $('#rest-clock').textContent = `${Math.floor(shown / 60)}:${String(shown % 60).padStart(2, '0')}`;
  $('#rest-fill').style.width = `${Math.min(100, ((r.total - shown) / r.total) * 100)}%`;
  if (left <= 0 && !restDone) {
    restDone = true;
    if (navigator.vibrate) navigator.vibrate([120, 80, 120]);
    toast(t('rest.done'));
  }
  if (left > 0) restDone = false;
}

setInterval(() => {
  tickRest();
  const el = $('[data-elapsed]');
  const s = activeSession();
  if (el && s) el.textContent = elapsed(s);
}, 1000);

$('#rest-skip').addEventListener('click', stopRest);
$('#rest-add').addEventListener('click', () => {
  const r = readRest();
  if (!r) return;
  r.endsAt += 30000;
  r.total += 30;
  localStorage.setItem(REST_KEY, JSON.stringify(r));
  tickRest();
});

/* ==========================================================================
   INTERACTION
   ========================================================================== */

/** Resolve a DOM node back to its session / entry / set. */
function ctx(el) {
  const entryEl = el.closest('[data-entry]');
  const setEl = el.closest('[data-set]');
  const session = location.hash.startsWith('#/session/')
    ? sessionById(location.hash.replace('#/session/', ''))
    : activeSession();
  if (!session) return {};
  const ei = entryEl ? Number(entryEl.dataset.entry) : -1;
  const entry = ei >= 0 ? session.entries[ei] : null;
  const si = setEl ? Number(setEl.dataset.set) : -1;
  const set = entry && si >= 0 ? entry.sets[si] : null;
  return { session, entry, ei, set, si, entryEl, setEl };
}

function patchSummary(session) {
  const el = $('[data-live-summary]');
  if (!el) return;
  el.innerHTML = `${esc(summaryLine(session))} · <span data-elapsed>${elapsed(session)}</span>`;
}

let lastLongPress = 0;

document.addEventListener('click', async (e) => {
  if (Date.now() - lastLongPress < 700) return; // swallow the click after a long press
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const act = btn.dataset.act;
  const c = ctx(btn);

  switch (act) {
    case 'start':
      await startSession();
      break;

    case 'pick-exercise':
      pickExercise();
      break;

    case 'add-set':
    case 'add-warmup': {
      if (!c.entry) return;
      const wasEmpty = c.entry.sets.length === 0;
      await addSet(c.session, c.entry, act === 'add-warmup');
      // Sets are always appended, so every existing data-set index still points
      // where it did and the row can go in beside them — no full render, which
      // would flicker the card and recompute every session's history.
      const list = $('.sets', c.entryEl);
      if (!list) { render(); break; }
      const si = c.entry.sets.length - 1;
      if (wasEmpty) list.insertAdjacentHTML('beforebegin', setHeadHtml());
      list.insertAdjacentHTML('beforeend', setRowHtml(c.entry, c.entry.sets[si], si));
      patchSummary(c.session);
      patchBoost(c.session, c.entry, c.entryEl);
      break;
    }

    case 'step': {
      if (!c.set) return;
      const f = btn.dataset.f;
      const dir = Number(btn.dataset.d);
      const stepSize = f === 'weight' ? Number(state.settings.weightStep) || 2.5 : Number(state.settings.repStep) || 1;
      const next = Math.max(0, Math.round(((Number(c.set[f]) || 0) + dir * stepSize) * 100) / 100);
      c.set[f] = next;
      const input = $(`.val[data-f="${f}"]`, c.setEl);
      if (input) input.value = f === 'weight' ? S.fmtNum(next) : String(next);
      await persist(c.session);
      patchSummary(c.session);
      patchBoost(c.session, c.entry, c.entryEl);
      break;
    }

    case 'done': {
      if (!c.set) return;
      // The target as it stood before this set counted, so that clearing it is
      // an event rather than a state — untick and retick, and it fires again.
      const before = boostState(c.session, c.entry);
      c.set.done = !c.set.done;
      btn.setAttribute('aria-pressed', c.set.done ? 'true' : 'false');
      c.setEl.classList.toggle('is-done', c.set.done);
      if (!c.set.done) c.setEl.classList.remove('is-pr');
      await persist(c.session);
      patchSummary(c.session);
      patchBoost(c.session, c.entry, c.entryEl);
      const after = c.set.done ? boostState(c.session, c.entry) : null;
      if (after && after.achieved && before && !before.achieved) celebrate(after, c.setEl);
      if (c.set.done && state.settings.restTimerAuto && !c.set.isWarmup) {
        startRest(state.settings.restTimerSeconds);
      }
      break;
    }

    case 'entry-menu':
      if (c.entry) entryMenu(c);
      break;

    case 'finish':
      await finishSession(c.session || activeSession());
      break;

    case 'discard': {
      const s = c.session || activeSession();
      if (!s) return;
      const ok = await confirmSheet({
        title: t('session.discardTitle'), body: t('session.discardBody'),
        confirm: t('session.discardConfirm'), danger: true,
      });
      if (!ok) return;
      await db.deleteSession(s.id);
      await reload();
      stopRest();
      render();
      toast(t('session.discarded'));
      break;
    }

    case 'open-session':
      location.hash = `#/session/${btn.dataset.id}`;
      break;

    case 'delete-session': {
      const s = c.session;
      const ok = await confirmSheet({
        title: t('session.deleteTitle'), body: t('session.deleteBody'),
        confirm: t('action.delete'), danger: true,
      });
      if (!ok) return;
      await db.deleteSession(s.id);
      await reload();
      location.hash = '#/history';
      toast(t('session.deleted'));
      break;
    }

    case 'jump-exercise': {
      const id = btn.dataset.id;
      if (!state.byId.has(id)) { toast(t('exercises.gone')); return; }
      state.progressEx = id;
      state.progressTab = 'exercise';
      localStorage.setItem('flexloop.progressEx', id);
      localStorage.setItem('flexloop.progressTab', 'exercise');
      // Assigning the same hash fires no hashchange, so render by hand there.
      if (location.hash === '#/progress') render();
      else location.hash = '#/progress';
      break;
    }

    case 'choose-progress-ex':
      pickExercise((id) => {
        state.progressEx = id;
        localStorage.setItem('flexloop.progressEx', id);
        closeSheet();
        render();
      });
      break;

    case 'window':
      state.progressWindow = btn.dataset.v;
      localStorage.setItem('flexloop.progressWindow', btn.dataset.v);
      render();
      break;

    case 'edit-exercise':
      editExerciseSheet(btn.dataset.id);
      break;

    /* ---------------------------------------------------------- routines */

    case 'start-routine':
      await startRoutine(btn.dataset.id);
      break;

    case 'open-routine':
      location.hash = `#/routine/${btn.dataset.id}`;
      break;

    case 'save-routine':
      await saveSessionAsRoutine(sessionById(btn.dataset.id) || c.session);
      break;

    case 'new-routine': {
      const name = await promptSheet({
        title: t('routine.newTitle'),
        label: t('routine.name'),
        placeholder: t('routine.namePlaceholder'),
        confirm: t('action.create'),
      });
      if (!name) return;
      const r = { id: uid('r'), name, items: [], createdAt: Date.now(), updatedAt: Date.now(), lastUsedAt: null };
      await db.saveRoutine(r);
      state.routines = sortRoutines(state.routines.concat([r]));
      location.hash = `#/routine/${r.id}`;
      break;
    }

    case 'rename-routine': {
      const r = routineById(btn.dataset.id);
      if (!r) return;
      const name = await promptSheet({
        title: t('routine.renameTitle'), label: t('routine.name'), value: r.name,
      });
      if (!name) return;
      r.name = name;
      await saveRoutine(r);
      render();
      break;
    }

    case 'delete-routine': {
      const r = routineById(btn.dataset.id);
      if (!r) return;
      const ok = await confirmSheet({
        title: t('routine.deleteTitle', { name: r.name }),
        body: t('routine.deleteBody'),
        confirm: t('action.delete'), danger: true,
      });
      if (!ok) return;
      await db.deleteRoutine(r.id);
      state.routines = state.routines.filter((x) => x.id !== r.id);
      location.hash = '#/routines';
      toast(t('routine.deleted'));
      break;
    }

    case 'routine-add': {
      const r = routineById(location.hash.replace('#/routine/', ''));
      if (!r) return;
      pickExercise(async (exerciseId) => {
        r.items = (r.items || []).concat([{ exerciseId, sets: 3 }]);
        await saveRoutine(r);
        closeSheet();
        render();
      });
      break;
    }

    case 'routine-sets': {
      const r = routineById(location.hash.replace('#/routine/', ''));
      const i = routineItemIndex(btn);
      if (!r || i < 0) return;
      const it = r.items[i];
      it.sets = Math.max(1, Math.min(12, setCountOf(it) + Number(btn.dataset.d)));
      // Patch the one number in place; a full render would drop the scroll position.
      const out = $('.rt-n', btn.closest('[data-i]'));
      if (out) out.innerHTML = `${it.sets}<em>${esc(t('routine.setsShort'))}</em>`;
      await saveRoutine(r);
      break;
    }

    case 'routine-item-menu': {
      const r = routineById(location.hash.replace('#/routine/', ''));
      const i = routineItemIndex(btn);
      if (r && i >= 0) routineItemMenu(r, i);
      break;
    }

    case 'export':      doExport(); break;
    case 'export-csv':  doExportCsv(); break;
    case 'import':      $('#file-json').click(); break;
    case 'import-csv':  $('#file-csv').click(); break;
    case 'data-info':   dataFormatSheet(); break;
    case 'load-demo':   loadDemoData(); break;
    case 'remove-demo': removeDemoData(); break;

    case 'erase': {
      const ok = await confirmSheet({
        title: t('erase.title'),
        body: t('erase.body'),
        confirm: t('erase.confirm'), danger: true,
      });
      if (!ok) return;
      await db.clear(db.STORE_SE);
      await db.clear(db.STORE_EX);
      await db.clear(db.STORE_RO);
      await reload();
      render();
      toast(t('erase.done'));
      break;
    }

    case 'info':
      infoSheet();
      break;

    case 'version':
      versionSheet();
      break;

    case 'theme':
      // An explicit tap leaves "match system" behind — you have just said which
      // one you want, and following the system would undo it at sunset.
      setTheme(effectiveTheme() === 'dark' ? 'light' : 'dark');
      if (currentTab() === 'settings') render();
      break;

    // The twin of the theme toggle, and rather blunter about it: every view is
    // a string built from i18n.js, so the whole screen has to be rebuilt.
    case 'lang':
      switchLang(getLang() === 'en' ? 'de' : 'en');
      break;

    case 'reload-app':
      location.reload();
      break;

    case 'check-update': {
      if (!('serviceWorker' in navigator)) { toast(t('sw.unsupported')); break; }
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) { toast(t('sw.unregistered')); break; }
      try {
        await reg.update();
      } catch (err) {
        toast(t('sw.checkFailed'));
        break;
      }
      // If a new worker isn't installing/waiting, the byte-for-byte check
      // found nothing new. Otherwise the updatefound/controllerchange
      // listeners in registerSW() take it from here and surface their own
      // "Update ready" toast once the new worker has taken control.
      if (!reg.installing && !reg.waiting) toast(t('sw.upToDate', { version: VERSION_SHORT }));
      break;
    }

    // Check for update only notices a changed sw.js. Redeploy the same version
    // over itself and the worker is byte-identical, so nothing is found and the
    // old shell keeps being served. Emptying the cache is the way out: the
    // active worker misses on every request afterwards and refills from the
    // network, which is also why this needs a connection to be worth doing.
    case 'clear-cache': {
      if (!('caches' in window)) { toast(t('cache.unsupported')); break; }
      if (navigator.onLine === false) { toast(t('cache.offline')); break; }
      const ok = await confirmSheet({
        title: t('cache.clearTitle'),
        body: t('cache.clearBody'),
        confirm: t('cache.clearConfirm'), danger: true,
      });
      if (!ok) return;
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch (err) {
        toast(t('cache.clearFailed'));
        break;
      }
      location.reload();
      break;
    }

    case 'dismiss-hint':
      localStorage.setItem('flexloop.a2hs', '1');
      btn.closest('.hint').remove();
      break;
  }
});

/* segmented controls */
$('#view').addEventListener('click', (e) => {
  const seg = e.target.closest('.seg [data-v]');
  if (!seg) return;
  const key = seg.closest('.seg').dataset.seg;
  state[key] = seg.dataset.v;
  localStorage.setItem(`flexloop.${key}`, seg.dataset.v);
  render();
});

/* number inputs and notes */
let saveTimer = null;
$('#view').addEventListener('input', (e) => {
  const el = e.target;
  if (el.classList.contains('val')) {
    const c = ctx(el);
    if (!c.set) return;
    const raw = el.value.replace(',', '.');
    const n = el.dataset.f === 'reps' ? parseInt(raw, 10) : parseFloat(raw);
    c.set[el.dataset.f] = isFinite(n) && n >= 0 ? n : 0;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      persist(c.session);
      patchSummary(c.session);
      patchBoost(c.session, c.entry, c.entryEl);
    }, 350);
  } else if (el.dataset.act === 'notes') {
    const c = ctx(el);
    if (!c.session) return;
    c.session.notes = el.value;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => persist(c.session), 400);
  }
});

/* commit on blur, and tidy up what was typed */
$('#view').addEventListener('change', async (e) => {
  const el = e.target;
  if (el.classList.contains('val')) {
    const c = ctx(el);
    if (!c.set) return;
    el.value = el.dataset.f === 'weight' ? S.fmtNum(c.set.weight) : String(c.set.reps);
    await persist(c.session);
    patchSummary(c.session);
    patchBoost(c.session, c.entry, c.entryEl);
  } else if (el.dataset.pref) {
    const key = el.dataset.pref;
    // "Edit this list…" is a door, not a value: put the select back where it
    // was and open the editor. Committing it would store the sentinel.
    if (el.dataset.options && el.value === OPTION_EDIT) {
      const spec = OPTION_LISTS[key];
      const cur = spec.clean(state.settings[key]);
      el.value = cur == null ? String(spec.defaults[0]) : String(cur);
      editOptionsSheet(key);
      return;
    }
    // The language is not a stored value like the others: switchLang writes
    // the setting, redresses the shell and re-renders in one go.
    if (key === 'lang') { switchLang(el.value); toast(t('settings.prefSaved')); return; }
    let v = el.value;
    if (key === 'restTimerAuto') v = v === 'yes';
    else if (OPTION_LISTS[key]) {
      const n = OPTION_LISTS[key].clean(v);
      v = n == null ? state.settings[key] : n;
    } else if (key === 'repStep') v = Math.max(1, parseInt(v, 10) || 1);
    else if (key === 'volumeTrend') v = S.maMode(v).id;
    else if (key === 'boostMetric') v = S.boostMetric(v).id;
    else if (key === 'theme') v = THEMES.some((th) => th.id === v) ? v : 'dark';
    state.settings[key] = v;
    db.saveSettings(state.settings);
    if (key === 'theme') applyTheme();
    toast(t('settings.prefSaved'));
    // Some of these change what the rest of the screen says: the unit relabels
    // the weight steps, turning the trend off hides its length select, the
    // theme decides which glyph the note beside it names, and each target
    // metric explains itself differently.
    if (key === 'unit' || key === 'theme' || key === 'volumeTrend'
      || key === 'volumeTrendPeriod' || key === 'boostMetric') render();
  }
});

$('#view').addEventListener('change', (e) => {
  if (e.target.id === 'file-json') doImportJson(e.target);
  if (e.target.id === 'file-csv') doImportCsv(e.target);
});

/* long-press a set row for warmup / delete */
let pressTimer = null;
let pressOrigin = null;
$('#view').addEventListener('pointerdown', (e) => {
  const row = e.target.closest('.set');
  if (!row || e.target.closest('input')) return;
  clearTimeout(pressTimer);
  pressOrigin = { x: e.clientX, y: e.clientY };
  pressTimer = setTimeout(() => {
    lastLongPress = Date.now();
    if (navigator.vibrate) navigator.vibrate(12);
    setMenu(ctx(row));
  }, 520);
});
$('#view').addEventListener('pointermove', (e) => {
  // Thumbs wobble. Only a real drag (scrolling) should cancel the press.
  if (!pressOrigin) return;
  if (Math.hypot(e.clientX - pressOrigin.x, e.clientY - pressOrigin.y) > 12) clearTimeout(pressTimer);
}, { passive: true });
['pointerup', 'pointercancel', 'scroll'].forEach((ev) =>
  $('#view').addEventListener(ev, () => { clearTimeout(pressTimer); pressOrigin = null; }, { passive: true }));

/**
 * The topbar (i). One entry per tab: it explains the screen you are looking
 * at, since a single sheet covering the whole app would be four screens of
 * text to find one paragraph in.
 *
 * The text itself lives in i18n.js — a title, a standfirst and a list of
 * term/explanation pairs per tab. Two of the settings paragraphs quote a
 * number the app holds rather than a word, and are filled in here.
 *
 * Every string is escaped on the way out, so these are plain text only.
 */
function infoFor(tab) {
  const id = INFO_TABS.includes(tab) ? tab : 'log';
  return {
    title: t(`info.${id}.title`),
    sub: t(`info.${id}.sub`),
    items: list(`info.${id}.items`).map(([term, body]) => [
      term,
      body.replace('{days}', EXPORT_NAG_DAYS).replace('{version}', APP_VERSION),
    ]),
  };
}

const INFO_TABS = ['log', 'history', 'progress', 'settings'];

/**
 * What changed, per released version, newest first. Reached by tapping the
 * version at the foot of Settings — the number is only worth printing if you
 * can find out what it means.
 */
function versionSheet() {
  openSheet(`
    <h2>${esc(t('version.title'))}</h2>
    <p class="sub">${esc(t('version.sub', { version: APP_VERSION }))}</p>
    ${CHANGELOG.map((rel) => `
      <h3 class="h-sec">${esc(rel.v)}${rel.v === APP_VERSION ? ` · ${esc(t('word.current'))}` : ''}</h3>
      <div class="info-list">${infoItemsHtml(changelogItems(rel))}</div>`).join('')}
    <button class="btn btn-block" style="margin-top:16px" data-close>${esc(t('action.close'))}</button>`);
}

/**
 * A release's entries in the language on screen. Each item carries one pair
 * per language; anything a translation has not reached falls back to the
 * English it was written in.
 */
function changelogItems(rel) {
  return (rel.items || []).map((it) => (Array.isArray(it) ? it : (it[getLang()] || it.en)));
}

/** The shared term/explanation list of every info sheet. */
function infoItemsHtml(items) {
  return items.map(([term, body]) => `<div class="info-item">
    <span class="t">${esc(term)}</span>
    <span class="s">${esc(body)}</span></div>`).join('');
}

function infoSheet() {
  const info = infoFor(currentTab());
  openSheet(`
    <h2>${esc(t('nav.about', { title: info.title }))}</h2>
    <p class="sub">${esc(info.sub)}</p>
    <div class="info-list">${infoItemsHtml(info.items)}</div>
    <button class="btn btn-block" style="margin-top:16px" data-close>${esc(t('action.gotIt'))}</button>`);
}

/**
 * The ⓘ under the four export/import buttons, covering both formats. The
 * mechanics live here rather than in the Settings info sheet so they sit
 * within reach of the buttons they are about — that sheet says why to keep
 * exporting, this one says what each file actually holds.
 */
function dataFormatSheet() {
  openSheet(`
    <h2>${esc(t('dataInfo.title'))}</h2>
    <p class="sub">${esc(t('dataInfo.sub'))}</p>
    <div class="info-list">${infoItemsHtml(list('dataInfo.items'))}</div>
    <button class="btn btn-block" style="margin-top:16px" data-close>${esc(t('action.gotIt'))}</button>`);
}

function setMenu(c) {
  if (!c.set) return;
  openSheet(`
    <h2>${esc(t('setMenu.title', { n: c.si + 1 }))}</h2>
    <p class="sub">${esc(exName(c.entry.exerciseId))} · ${S.fmtNum(c.set.weight)} ${esc(unit())} × ${c.set.reps}</p>
    <div class="rows" style="margin-top:14px">
      <button class="row" data-x="warmup"><span class="grow"><span class="t">${esc(t(c.set.isWarmup ? 'setMenu.makeWorking' : 'setMenu.markWarmup'))}</span>
        <span class="s">${esc(t('setMenu.warmupSub'))}</span></span></button>
      <button class="row" data-x="dup"><span class="grow"><span class="t">${esc(t('setMenu.duplicate'))}</span>
        <span class="s">${esc(t('setMenu.duplicateSub'))}</span></span></button>
      <button class="row" data-x="del"><span class="grow"><span class="t" style="color:var(--danger)">${esc(t('setMenu.delete'))}</span>
        <span class="s">${esc(t('setMenu.deleteSub'))}</span></span></button>
    </div>`, (root) => {
    root.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-x]');
      if (!b) return;
      if (b.dataset.x === 'warmup') c.set.isWarmup = !c.set.isWarmup;
      if (b.dataset.x === 'dup') c.entry.sets.splice(c.si + 1, 0, { ...c.set, done: false });
      if (b.dataset.x === 'del') {
        c.entry.sets.splice(c.si, 1);
        if (!c.entry.sets.length) c.session.entries.splice(c.ei, 1);
      }
      await persist(c.session);
      closeSheet();
      render();
    });
  });
}

function entryMenu(c) {
  openSheet(`
    <h2>${esc(exName(c.entry.exerciseId))}</h2>
    <p class="sub">${esc(t('entryMenu.sub', {
      sets: plural('count.sets', c.entry.sets.length) }))}</p>
    <div class="rows" style="margin-top:14px">
      <button class="row" data-x="all"><span class="grow"><span class="t">${esc(t('entryMenu.allDone'))}</span>
        <span class="s">${esc(t('entryMenu.allDoneSub'))}</span></span></button>
      <button class="row" data-x="up"><span class="grow"><span class="t">${esc(t('routine.moveUp'))}</span></span></button>
      <button class="row" data-x="down"><span class="grow"><span class="t">${esc(t('routine.moveDown'))}</span></span></button>
      <button class="row" data-x="rm"><span class="grow"><span class="t" style="color:var(--danger)">${esc(t('entryMenu.remove'))}</span>
        <span class="s">${esc(t('entryMenu.removeSub'))}</span></span></button>
    </div>`, (root) => {
    root.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-x]');
      if (!b) return;
      const es = c.session.entries;
      if (b.dataset.x === 'all') c.entry.sets.forEach((s) => { s.done = true; });
      if (b.dataset.x === 'up' && c.ei > 0) es.splice(c.ei - 1, 0, es.splice(c.ei, 1)[0]);
      if (b.dataset.x === 'down' && c.ei < es.length - 1) es.splice(c.ei + 1, 0, es.splice(c.ei, 1)[0]);
      if (b.dataset.x === 'rm') es.splice(c.ei, 1);
      await persist(c.session);
      closeSheet();
      render();
    });
  });
}

async function finishSession(session) {
  if (!session) return;
  const empty = S.sessionSetCount(session) === 0;
  if (empty) {
    const ok = await confirmSheet({
      title: t('session.nothingDone'),
      body: t('session.nothingDoneBody'),
      confirm: t('session.finishAnyway'),
    });
    if (!ok) return;
  }
  // Judged before the session is closed and the view re-rendered, because both
  // clear the history cache the verdicts are read from.
  const verdicts = sessionVerdicts(session);
  session.endedAt = Date.now();
  await persist(session);
  state.activeId = null;
  stopRest();
  location.hash = '#/log';
  render();
  if (verdicts.length) debriefSheet(session, verdicts);
  else toast(t('session.savedToast', { summary: summaryLine(session) }));
}

/* ------------------------------------------------------ session debrief */

const VERDICTS = {
  pr: { rank: 0, cls: 'v-pr' },
  up: { rank: 1, cls: 'v-up' },
  level: { rank: 2, cls: 'v-level' },
  down: { rank: 3, cls: 'v-down' },
  first: { rank: 4, cls: 'v-first' },
};

const verdictLabel = (id) => t(`verdict.${id}`);

/**
 * How each exercise in a finished session compares with its own past, best
 * result first. Exercises with nothing completed are left out — a session is
 * judged on what was ticked.
 */
function sessionVerdicts(session) {
  if (!session) return [];
  const metric = S.boostMetric(state.settings.boostMetric);
  if (metric.id === 'off') return [];
  const out = [];
  for (const entry of session.entries || []) {
    const sets = S.countedSets(entry);
    if (!sets.length) continue;
    const series = exHistory(entry.exerciseId, session.id);
    const at = S.topWeightSet(sets);
    const load = at ? Number(at.weight) || 0 : 0;
    // No load in the history, or none carried today — which is also the case
    // for an exercise being logged for the first time — leaves reps as the only
    // metric with anything to say. The Log's target line applies the same rule.
    const metricId = load <= 0 || S.seriesIsBodyweight(series) ? 'reps' : metric.id;
    const v = S.sessionVerdict(series, sets, metricId, load);
    if (!v.value) continue;
    out.push({ ...v, name: exName(entry.exerciseId), metric: S.boostMetric(metricId) });
  }
  return out.sort((a, b) => VERDICTS[a.verdict].rank - VERDICTS[b.verdict].rank);
}

/**
 * The finish-session read-out. It replaces the old one-line toast: the same
 * summary is at the top, with what each exercise did under it.
 */
function debriefSheet(session, verdicts) {
  const rows = verdicts.map((v) => {
    const info = VERDICTS[v.verdict];
    const shown = boostValue({ metric: v.metric }, v.value);
    const delta = v.verdict === 'up' || v.verdict === 'pr'
      ? ` +${boostValue({ metric: v.metric }, Math.abs(v.delta))}`
      : v.verdict === 'down' ? ` −${boostValue({ metric: v.metric }, Math.abs(v.delta))}` : '';
    return `<div class="verdict ${info.cls}">
      <span class="grow"><span class="t">${esc(v.name)}</span>
        <span class="s">${esc(verdictLabel(v.verdict))}${esc(delta)}</span></span>
      <span class="r">${esc(shown)}</span>
    </div>`;
  }).join('');

  const prs = verdicts.filter((v) => v.verdict === 'pr').length;
  openSheet(`
    <h2>${esc(t('session.saved'))}</h2>
    <p class="sub">${esc(summaryLine(session))}${prs
      ? ` · ${esc(t('session.bestEver', { n: prs }))}` : ''}</p>
    <div class="verdicts">${rows}</div>
    <div class="btn-row" style="margin-top:18px">
      <button class="btn btn-primary" data-close>${esc(t('action.done'))}</button>
    </div>`);
}

/* ---------------------------------------------------- add-to-home hint */

function hintHtml() {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  if (standalone || !iOS || localStorage.getItem('flexloop.a2hs')) return '';
  return `<div class="hint">
    <div><b>${esc(t('hint.a2hsTitle'))}</b> ${esc(t('hint.a2hsBody'))}</div>
    <button data-act="dismiss-hint" aria-label="${esc(t('action.dismiss'))}">×</button></div>`;
}

/* ==========================================================================
   SERVICE WORKER
   ========================================================================== */

async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    // Relative path + relative scope: the app lives under /<repo>/ on Pages.
    const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      // Never reload on our own — the user might be mid-set.
      toast(t('sw.updateReady'), t('action.reload'), () => location.reload(), 0);
    });
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (!w) return;
      w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) {
          toast(t('sw.updateReady'), t('action.reload'), () => location.reload(), 0);
        }
      });
    });
  } catch (err) {
    console.warn('service worker did not register', err);
  }
}

/* ==========================================================================
   BOOT
   ========================================================================== */

async function boot() {
  // index.html already set the palette and <html lang> from localStorage
  // before first paint; this re-runs both against the parsed settings, dresses
  // the two toggle buttons, and fills in the static labels of the shell —
  // which are deliberately empty in the markup until the language is known.
  setLang(state.settings.lang);
  applyLang();
  try {
    await db.openDB();
  } catch (err) {
    $('#view').innerHTML = `<div class="empty"><div class="glyph"></div><h3>${esc(t('boot.storageTitle'))}</h3>
      <p>${esc(t('boot.storageBody'))}</p></div>`;
    console.error(err);
    return;
  }
  db.requestPersistence();
  await reload();
  await render();
  tickRest();
  registerSW();
}

boot();
