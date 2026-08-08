/* =========================================================================
   app.js — routing, view rendering, and all user interaction.

   Everything is a hash route. Views render into #view as HTML strings and
   are wired with delegated listeners, so there is no component framework
   and no diffing: a mutation writes to IndexedDB immediately, then either
   patches the affected node in place (typing, steppers) or re-renders the
   whole view (structural changes).
   ========================================================================= */

import * as db from './db.js';
import * as S from './stats.js';
import { lineChart, barChart, setChart } from './charts.js';
import { parseStrongifyCsv, looksLikeStrongify } from './importers.js';

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

function openSheet(html, wire) {
  const sheet = $('#sheet');
  const old = $('#sheet-body');
  // Sheets delegate their clicks from #sheet-body, and closing only emptied it,
  // so every sheet used to leave its listener behind on a node the next sheet
  // reused. Two menus opened in a row then both acted on one tap — with stale
  // indices, which quietly deleted the wrong set. Swap in a fresh node instead.
  const body = old.cloneNode(false);
  body.innerHTML = html;
  old.replaceWith(body);
  sheet.hidden = false;
  if (wire) wire(body);
}
function closeSheet() {
  $('#sheet').hidden = true;
  $('#sheet-body').innerHTML = '';
}
$('#sheet').addEventListener('click', (e) => {
  if (e.target.hasAttribute('data-close') || e.target.closest('[data-close]')) closeSheet();
});

function confirmSheet({ title, body, confirm = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    openSheet(`
      <h2>${esc(title)}</h2>
      <p class="sub">${esc(body)}</p>
      <div class="btn-row" style="margin-top:18px">
        <button class="btn" data-x="no">Cancel</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-x="yes">${esc(confirm)}</button>
      </div>`, (root) => {
      root.addEventListener('click', (e) => {
        const b = e.target.closest('[data-x]');
        if (!b) return;
        closeSheet();
        resolve(b.dataset.x === 'yes');
      });
    });
  });
}

/** Resolves to the trimmed string, or null if cancelled or left empty. */
function promptSheet({ title, body, label, value = '', placeholder = '', confirm = 'Save' }) {
  return new Promise((resolve) => {
    openSheet(`
      <h2>${esc(title)}</h2>
      ${body ? `<p class="sub">${esc(body)}</p>` : ''}
      <div class="field" style="margin-top:14px">
        <label for="pr-in">${esc(label)}</label>
        <input class="input" id="pr-in" value="${esc(value)}" placeholder="${esc(placeholder)}"
               autocapitalize="words" autocomplete="off" enterkeyhint="done">
      </div>
      <div class="btn-row" style="margin-top:16px">
        <button class="btn" data-x="no">Cancel</button>
        <button class="btn btn-primary" data-x="yes">${esc(confirm)}</button>
      </div>`, (root) => {
      const input = $('#pr-in', root);
      const done = (ok) => {
        const v = input.value.trim();
        closeSheet();
        resolve(ok && v ? v : null);
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(true); });
      root.addEventListener('click', (e) => {
        const b = e.target.closest('[data-x]');
        if (b) done(b.dataset.x === 'yes');
      });
      // iOS only raises the keyboard for a focus inside the current task.
      setTimeout(() => input.focus(), 60);
    });
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
  return e ? e.name : 'Removed exercise';
}

/* ==========================================================================
   ROUTER
   ========================================================================== */

const routes = [
  [/^#\/log$/,              () => viewLog()],
  [/^#\/history$/,          () => viewHistory()],
  [/^#\/session\/(.+)$/,    (m) => viewSession(m[1])],
  [/^#\/progress$/,         () => viewProgress()],
  [/^#\/data$/,             () => viewData()],
  [/^#\/exercises$/,        () => viewExercises()],
  [/^#\/routines$/,         () => viewRoutines()],
  [/^#\/routine\/(.+)$/,    (m) => viewRoutine(m[1])],
];

function currentTab() {
  const h = location.hash;
  if (h.startsWith('#/history') || h.startsWith('#/session')) return 'history';
  if (h.startsWith('#/progress')) return 'progress';
  if (h.startsWith('#/data') || h.startsWith('#/exercises') || h.startsWith('#/routine')) return 'data';
  return 'log';
}

async function render() {
  if (!location.hash || location.hash === '#') { location.replace('#/log'); return; }
  const hash = location.hash;
  const hit = routes.find(([re]) => re.test(hash));
  const view = $('#view');
  view.scrollTop = 0;
  $('#topbar-action').innerHTML = '';
  if (hit) {
    const m = hash.match(hit[0]);
    await hit[1](m);
  } else {
    view.innerHTML = `<div class="empty"><div class="glyph"></div>
      <h3>Nothing here</h3><p>That screen doesn't exist.</p>
      <a class="btn" href="#/log">Go to Log</a></div>`;
  }
  const tab = currentTab();
  $$('.tab').forEach((t) => {
    if (t.dataset.tab === tab) t.setAttribute('aria-current', 'page');
    else t.removeAttribute('aria-current');
  });
}

window.addEventListener('hashchange', render);

/* ==========================================================================
   VIEW: LOG
   ========================================================================== */

function viewLog() {
  const session = activeSession();
  const view = $('#view');

  if (!session) {
    const last = state.sessions[0];
    const today = S.localDate();
    const todays = state.sessions.filter((s) => s.date === today);
    view.innerHTML = `
      ${hintHtml()}
      <p class="eyebrow">Today</p>
      <h2 class="h-big">${esc(S.fmtDate(today, { weekday: 'long', day: 'numeric', month: 'short' }))}</h2>
      <p class="sub">${last
        ? `Last session ${esc(S.relativeDays(last.date))} — ${esc(summaryLine(last))}.`
        : 'No sessions logged yet. The first one sets your baseline.'}</p>
      <div style="height:18px"></div>
      <button class="btn btn-primary btn-lg btn-block" data-act="start">Start session</button>
      ${routinePickerHtml()}
      ${todays.length ? `
        <h3 class="h-sec">Finished today</h3>
        <div class="rows">${todays.map(sessionRowHtml).join('')}</div>` : ''}
      ${state.sessions.length ? `
        <h3 class="h-sec">Recent</h3>
        <div class="rows">${state.sessions.slice(0, 5).map(sessionRowHtml).join('')}</div>` : ''}
      ${state.sessions.length ? `<p class="meta">${state.sessions.length} sessions · ${state.exercises.length} exercises</p>` : ''}`;
    return;
  }

  $('#topbar-action').innerHTML =
    `<button class="btn btn-sm" data-act="finish">Finish</button>`;

  view.innerHTML = `
    <p class="eyebrow">In progress</p>
    <h2 class="h-big">${esc(S.fmtDate(session.date, { weekday: 'long', day: 'numeric', month: 'short' }))}</h2>
    <p class="sub" data-live-summary>${esc(summaryLine(session))} · <span data-elapsed>${elapsed(session)}</span></p>
    <div style="height:16px"></div>
    <div data-entries>${(session.entries || []).map((e, i) => entryHtml(session, e, i)).join('')}</div>
    <button class="btn btn-block" data-act="pick-exercise">+ Add exercise</button>
    ${saveRoutineBtnHtml(session)}
    <div class="field" style="margin-top:20px">
      <label for="snotes">Session notes</label>
      <textarea class="input" id="snotes" data-act="notes" placeholder="Felt strong, bar speed good…">${esc(session.notes || '')}</textarea>
    </div>
    <button class="btn btn-primary btn-block btn-lg" data-act="finish">Finish session</button>
    <button class="btn btn-quiet btn-block btn-sm" style="margin-top:8px" data-act="discard">Discard session</button>`;
}

/** Sits under "+ Add exercise": this list of exercises *is* the routine. */
function saveRoutineBtnHtml(session) {
  if (!(session.entries || []).length) return '';
  return `<button class="btn btn-quiet btn-block btn-sm" style="margin-top:8px"
    data-act="save-routine" data-id="${esc(session.id)}">Save as routine</button>`;
}

/** How many of a routine's exercises still exist, and a readable list. */
function routineExercises(routine) {
  return (routine.items || [])
    .filter((it) => state.byId.has(it.exerciseId))
    .map((it) => ({ ...it, ex: state.byId.get(it.exerciseId) }));
}

function routineSummary(routine) {
  const live = routineExercises(routine);
  if (!live.length) return 'No exercises left in this routine';
  const sets = live.reduce((t, it) => t + (it.sets || 1), 0);
  return `${live.length} exercise${live.length === 1 ? '' : 's'} · ${sets} set${sets === 1 ? '' : 's'}`;
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
        : 'new'}</span>
    </button>`).join('');
  return `<h3 class="h-sec">Start from a routine</h3>
    <div class="rows">${rows}</div>
    ${state.routines.length > 6
      ? `<p class="meta" style="text-align:left;padding:8px 0 0"><a href="#/routines">All ${state.routines.length} routines</a></p>`
      : ''}`;
}

function elapsed(session) {
  const ms = Date.now() - (session.startedAt || Date.now());
  const mins = Math.max(0, Math.floor(ms / 60000));
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
}

function summaryLine(session) {
  const sets = S.sessionSetCount(session);
  const vol = S.sessionVolume(session);
  const n = (session.entries || []).length;
  if (!n) return 'Empty so far';
  return `${n} exercise${n === 1 ? '' : 's'} · ${sets} set${sets === 1 ? '' : 's'}${vol ? ` · ${S.fmtVolume(vol, unit())}` : ''}`;
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
  if (!last) return `<div class="ghost">First time logging this</div>`;
  const w = last.weight > 0 ? `${S.fmtNum(last.weight)} ${unit()} × ${last.reps}` : `${last.reps} reps`;
  return `<div class="ghost">Last <b>${esc(w)}</b> · ${esc(S.relativeDays(last.date))}</div>`;
}

function setRowHtml(entry, set, si) {
  const ex = state.byId.get(entry.exerciseId) || {};
  const bw = ex.isBodyweight;
  return `<div class="set${set.done ? ' is-done' : ''}${set.isWarmup ? ' is-warmup' : ''}" data-set="${si}">
    <span class="num">${set.isWarmup ? 'W' : si + 1}</span>
    ${bw && !set.weight ? `<span class="unit-tag" style="text-align:center">bodyweight</span>` : `
    <div class="stepper">
      <button class="step" data-act="step" data-f="weight" data-d="-1" aria-label="Less weight">−</button>
      <input class="val" data-f="weight" inputmode="decimal" enterkeyhint="done"
             value="${S.fmtNum(set.weight || 0)}" aria-label="Weight in ${esc(unit())}">
      <button class="step" data-act="step" data-f="weight" data-d="1" aria-label="More weight">+</button>
    </div>`}
    <div class="stepper">
      <button class="step" data-act="step" data-f="reps" data-d="-1" aria-label="Fewer reps">−</button>
      <input class="val" data-f="reps" inputmode="numeric" enterkeyhint="done"
             value="${set.reps || 0}" aria-label="Reps">
      <button class="step" data-act="step" data-f="reps" data-d="1" aria-label="More reps">+</button>
    </div>
    <button class="set-done" data-act="done" aria-pressed="${set.done ? 'true' : 'false'}" aria-label="Mark set done">
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
      aria-label="${esc(ex.name)} — see progress">
      <span>${esc(ex.name)}</span>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17l5-6 4 4 7-8"/></svg>
    </button></h3>`;
}

/** Column labels over the steppers, so a weight box never looks like a rep box. */
function setHeadHtml() {
  return `<div class="set-head" aria-hidden="true">
    <span></span>
    <span>${esc(unit().toUpperCase())}</span>
    <span>Reps</span>
    <span></span>
  </div>`;
}

function entryHtml(session, entry, ei) {
  return `<section class="card" data-entry="${ei}">
    <div class="card-head">
      <div style="min-width:0">
        ${entryTitleHtml(entry)}
        ${ghostHtml(session, entry)}
      </div>
      <button class="btn btn-sm btn-quiet" data-act="entry-menu" aria-label="Exercise options">•••</button>
    </div>
    ${entry.sets.length ? setHeadHtml() : ''}
    <div class="sets">${entry.sets.map((s, i) => setRowHtml(entry, s, i)).join('')}</div>
    <div class="set-foot">
      <button class="btn btn-sm" data-act="add-set" style="flex:1">+ Set</button>
      <button class="btn btn-sm btn-quiet" data-act="add-warmup">+ Warmup</button>
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

async function startSession() {
  await newSession();
  location.hash = '#/log';
  render();
  pickExercise();
}

/** Open a session already filled in with a routine's exercises and sets. */
async function startRoutine(routineId) {
  const r = state.routines.find((x) => x.id === routineId);
  if (!r) return;
  const live = routineExercises(r);
  if (!live.length) {
    toast('Every exercise in that routine has been deleted');
    return;
  }
  // Starting a routine mid-session would leave two sessions open at once, and
  // reload() would then have to guess which one you meant. Fold into the open
  // one instead.
  const open = activeSession();
  if (open) {
    const ok = await confirmSheet({
      title: 'Session already in progress',
      body: `Add the ${live.length} exercise${live.length === 1 ? '' : 's'} from ${r.name} to the session you have open?`,
      confirm: 'Add to session',
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
  toast(`${open ? 'Added' : 'Started'} ${r.name}${dropped
    ? ` — ${dropped} deleted exercise${dropped === 1 ? '' : 's'} skipped` : ''}`);
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
    const list = hits.slice(0, 60).map((e) => `
      <button class="row" data-pick="${esc(e.id)}">
        <span class="grow">
          <span class="t">${esc(e.name)}</span>
          <span class="s">${esc(e.muscleGroup || 'Uncategorised')}</span>
        </span>
        <span class="r">${lastMap.get(e.id) ? esc(S.relativeDays(lastMap.get(e.id))) : 'new'}</span>
      </button>`).join('');
    const canCreate = needle && !hits.some((e) => e.name.toLowerCase() === needle);
    return (canCreate ? `<button class="row" data-create="1">
        <span class="grow"><span class="t">Create “${esc(q.trim())}”</span>
        <span class="s">Adds it to your exercise list</span></span>
        <span class="r">+</span></button>` : '') + list ||
      `<div class="empty" style="padding:26px 10px"><p style="margin:0">Type a name to create your first exercise.</p></div>`;
  };

  openSheet(`
    <h2>Add exercise</h2>
    <div class="field"><input class="input" id="exq" type="search" placeholder="Search or type a new name"
      autocapitalize="words" autocomplete="off" enterkeyhint="done"></div>
    <div class="rows" id="exlist">${rowsFor('')}</div>`, (root) => {
    const q = $('#exq', root);
    const list = $('#exlist', root);
    q.addEventListener('input', () => { list.innerHTML = rowsFor(q.value); });
    list.addEventListener('click', async (e) => {
      const pick = e.target.closest('[data-pick]');
      const create = e.target.closest('[data-create]');
      if (pick) {
        closeSheet();
        await handlePicked(pick.dataset.pick, onPick);
      } else if (create) {
        const ex = {
          id: uid('ex'),
          name: q.value.trim(),
          muscleGroup: 'Uncategorised',
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
    view.innerHTML = `<div class="empty"><div class="glyph"></div><h3>Session not found</h3>
      <p>It may have been deleted.</p><a class="btn" href="#/history">Back to history</a></div>`;
    return;
  }
  $('#topbar-action').innerHTML = `<a class="btn btn-sm btn-quiet" href="#/history">Back</a>`;
  view.innerHTML = `
    <p class="eyebrow">${session.endedAt ? 'Completed' : 'In progress'}${session.source === 'strongify' ? ' · imported' : ''}</p>
    <h2 class="h-big">${esc(S.fmtDate(session.date, { weekday: 'long', day: 'numeric', month: 'long' }))}</h2>
    <p class="sub">${esc(summaryLine(session))}</p>
    <div style="height:16px"></div>
    <div data-entries>${(session.entries || []).map((e, i) => entryHtml(session, e, i)).join('')}</div>
    <button class="btn btn-block" data-act="pick-exercise">+ Add exercise</button>
    ${saveRoutineBtnHtml(session)}
    <div class="field" style="margin-top:20px">
      <label for="snotes">Session notes</label>
      <textarea class="input" id="snotes" data-act="notes" placeholder="Nothing noted">${esc(session.notes || '')}</textarea>
    </div>
    ${session.endedAt ? '' : `<button class="btn btn-primary btn-block" data-act="finish">Finish session</button>`}
    <button class="btn btn-danger btn-block btn-sm" style="margin-top:10px" data-act="delete-session">Delete this session</button>
    <p class="meta">${esc(new Date(session.startedAt).toLocaleString())}</p>`;
}

/* ==========================================================================
   VIEW: HISTORY
   ========================================================================== */

function viewHistory() {
  const view = $('#view');
  if (!state.sessions.length) {
    view.innerHTML = `<div class="empty"><div class="glyph"></div>
      <h3>No history yet</h3><p>Finished sessions collect here, newest first.</p>
      <a class="btn btn-primary" href="#/log">Start a session</a></div>`;
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
      .toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    return `<h3 class="h-sec">${esc(title)}
        <span style="float:right;font-family:var(--mono);font-size:11px;color:var(--dim);font-weight:500">
          ${list.length} · ${esc(S.fmtVolume(vol, unit()))}</span></h3>
      <div class="rows">${list.map(sessionRowHtml).join('')}</div>`;
  }).join('');

  view.innerHTML = `<p class="eyebrow">History</p>
    <h2 class="h-big">${state.sessions.length} session${state.sessions.length === 1 ? '' : 's'}</h2>
    <p class="sub">Tap any session to edit or delete it.</p>
    ${blocks}`;
}

/* ==========================================================================
   VIEW: PROGRESS
   ========================================================================== */

function viewProgress() {
  const view = $('#view');
  const tab = state.progressTab;
  view.innerHTML = `
    <p class="eyebrow">Progress</p>
    <div class="seg" data-seg="progressTab">
      <button data-v="overview" aria-pressed="${tab === 'overview'}">Overview</button>
      <button data-v="exercise" aria-pressed="${tab === 'exercise'}">Per exercise</button>
    </div>
    <div id="pbody"></div>`;
  if (tab === 'overview') renderOverview($('#pbody'));
  else renderExerciseProgress($('#pbody'));
}

function renderOverview(root) {
  if (!state.sessions.length) {
    root.innerHTML = `<div class="empty"><div class="glyph"></div><h3>No data yet</h3>
      <p>Charts appear once you've logged a session. You can also import a backup from Data.</p>
      <a class="btn btn-primary" href="#/log">Start a session</a></div>`;
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
      <div class="stat accent"><span class="k">Week streak</span>
        <span class="v">${streak}<small>wk</small></span>
        <span class="m">${streak ? 'consecutive weeks trained' : 'train this week to start one'}</span></div>
      <div class="stat"><span class="k">This week</span>
        <span class="v">${thisWeek.sessions}<small>×</small></span>
        <span class="m">${esc(S.fmtVolume(thisWeek.volume, unit()))} moved</span></div>
      <div class="stat"><span class="k">Last 12 weeks</span>
        <span class="v">${buckets.reduce((t, b) => t + b.sessions, 0)}</span>
        <span class="m">sessions logged</span></div>
      <div class="stat"><span class="k">Volume 12wk</span>
        <span class="v">${total12 >= 10000 ? `${S.fmtNum(total12 / 1000, 1)}k` : S.fmtNum(total12, 0)}<small>${esc(unit())}</small></span>
        <span class="m">weight × reps, warmups out</span></div>
    </div>

    <div class="card chart-card" style="margin-top:12px">
      <div class="chart-head"><p class="eyebrow">Sessions per week</p><span class="note">12 WK</span></div>
      <div class="chart-wrap" id="c-sess"></div>
    </div>

    <div class="card chart-card">
      <div class="chart-head"><p class="eyebrow">Volume per week</p><span class="note">${esc(unit().toUpperCase())}</span></div>
      <div class="chart-wrap" id="c-vol"></div>
    </div>

    <h3 class="h-sec">Going stale</h3>
    <p class="sub" style="margin-bottom:10px">Longest since you last trained it.</p>
    <div class="rows">${stale.map(({ e, date, days }) => `
      <button class="row ${days > 21 ? 'stale' : ''}" data-act="jump-exercise" data-id="${esc(e.id)}">
        <span class="grow"><span class="t">${esc(e.name)}</span>
          <span class="s">${esc(e.muscleGroup || 'Uncategorised')}</span></span>
        <span class="r">${days}<em>days</em></span>
      </button>`).join('')}</div>`;

  barChart($('#c-sess'), buckets.map((b) => ({ x: b.start.getTime(), label: b.label, value: b.sessions, sub: `week of ${b.label}` })), {
    height: 140, highlightLast: true, integer: true,
    format: (v) => `${v} session${v === 1 ? '' : 's'}`,
    tickFormat: (v) => String(Math.round(v)),
  });
  barChart($('#c-vol'), buckets.map((b) => ({ x: b.start.getTime(), label: b.label, value: Math.round(b.volume), sub: `week of ${b.label}` })), {
    height: 150, highlightLast: true, format: (v) => S.fmtVolume(v, unit()),
    tickFormat: (v) => (v >= 1000 ? `${S.fmtNum(v / 1000, 0)}k` : String(Math.round(v))),
  });
}

function renderExerciseProgress(root) {
  if (!state.exercises.length) {
    root.innerHTML = `<div class="empty"><div class="glyph"></div><h3>No exercises yet</h3>
      <p>Add one while logging a session and its charts build themselves.</p></div>`;
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

  root.innerHTML = `
    <button class="btn btn-block" data-act="choose-progress-ex" style="justify-content:space-between">
      <span>${esc(ex.name)}</span><span style="color:var(--mist);font-size:13px">change</span>
    </button>
    <div class="chips" style="margin-top:12px">
      ${S.WINDOWS.map((w) => `<button class="chip" data-act="window" data-v="${w.id}"
        aria-pressed="${state.progressWindow === w.id}">${w.label}</button>`).join('')}
    </div>

    ${full.length === 0 ? `<div class="empty"><div class="glyph"></div><h3>Not trained yet</h3>
      <p>Log a set of ${esc(ex.name)} and its history starts here.</p></div>` : `

    <div class="card chart-card">
      <div class="chart-head"><p class="eyebrow">${bodyweight ? 'Best set reps' : 'Estimated 1RM'}</p>
        <span class="note">${bodyweight ? 'REPS' : 'EPLEY · W × (1 + R/30)'}</span></div>
      <div class="chart-wrap" id="c-1rm"></div>
    </div>

    ${bodyweight ? '' : `<div class="card chart-card">
      <div class="chart-head"><p class="eyebrow">Every set</p>
        <span class="note">BARS ${esc(unit().toUpperCase())} · LINE REPS</span></div>
      <div class="chart-wrap" id="c-sets"></div>
    </div>`}

    <div class="card chart-card">
      <div class="chart-head"><p class="eyebrow">Volume per session</p><span class="note">WARMUPS EXCLUDED</span></div>
      <div class="chart-wrap" id="c-svol"></div>
    </div>

    ${bodyweight ? '' : `<div class="card chart-card">
      <div class="chart-head"><p class="eyebrow">Top set weight</p><span class="note">${esc(unit().toUpperCase())}</span></div>
      <div class="chart-wrap" id="c-top"></div>
    </div>`}

    <h3 class="h-sec">Personal records</h3>
    <div class="stat-grid" style="margin-bottom:10px">
      <div class="stat accent"><span class="k">Best e1RM</span>
        <span class="v">${pr.e1rm ? S.fmtNum(pr.e1rm.value, 1) : '—'}<small>${esc(unit())}</small></span>
        <span class="m">${pr.e1rm && pr.e1rm.set ? `${S.fmtNum(pr.e1rm.set.weight)}×${pr.e1rm.set.reps} · ${esc(S.fmtDate(pr.e1rm.date))}` : 'no data'}</span></div>
      <div class="stat"><span class="k">Heaviest set</span>
        <span class="v">${pr.weight ? S.fmtNum(pr.weight.value) : '—'}<small>${esc(unit())}</small></span>
        <span class="m">${pr.weight ? `${pr.weight.reps} reps · ${esc(S.fmtDate(pr.weight.date))}` : 'no data'}</span></div>
    </div>
    <p class="eyebrow">Heaviest at each rep count</p>
    <div class="pr-list">
      ${S.REP_TARGETS.map((t) => {
        const p = pr.byReps[t];
        return `<div class="pr"><div class="k">${t}+ reps</div>
          <div class="v" style="${p ? '' : 'color:var(--dim)'}">${p ? S.fmtNum(p.value) : '—'}</div></div>`;
      }).join('')}
    </div>
    <p class="meta">${pr.sessions} sessions · ${pr.totalSets} working sets logged</p>`}`;

  if (!full.length) return;

  // `label` is the tooltip text, `xlab` the short form printed on the axis.
  const label = (p) => S.fmtDate(p.date);
  const empty = 'No sessions in this window. Try a wider range.';

  lineChart($('#c-1rm'),
    series.map((p) => ({
      x: p.ts,
      y: bodyweight ? p.sets.reduce((m, s) => Math.max(m, s.reps), 0) : p.e1rm,
      label: label(p), xlab: label(p),
    })),
    { format: (v) => (bodyweight ? `${S.fmtNum(v, 0)} reps` : `${S.fmtNum(v, 1)} ${unit()}`),
      tickFormat: (v) => S.fmtNum(v, 0), empty });

  if (!bodyweight) {
    setChart($('#c-sets'),
      series.map((p) => ({ x: p.ts, label: label(p), sets: p.sets })),
      { height: 190, format: (v) => `${S.fmtNum(v)} ${unit()}`,
        weightFormat: (v) => S.fmtNum(v, 1), repFormat: (v) => String(Math.round(v)), empty });
  }

  barChart($('#c-svol'),
    series.map((p) => ({ x: p.ts, label: label(p), value: Math.round(p.volume), sub: label(p) })),
    { format: (v) => S.fmtVolume(v, unit()), height: 140, highlightLast: true,
      tickFormat: (v) => (v >= 1000 ? `${S.fmtNum(v / 1000, 0)}k` : String(Math.round(v))), empty });

  if (!bodyweight) {
    lineChart($('#c-top'),
      series.map((p) => ({ x: p.ts, y: p.topWeight, label: `${label(p)} · ${p.topWeightReps} reps`, xlab: label(p) })),
      { format: (v) => `${S.fmtNum(v)} ${unit()}`, tickFormat: (v) => S.fmtNum(v, 0), empty });
  }
}

/* ==========================================================================
   VIEW: DATA & SETTINGS
   ========================================================================== */

async function viewData() {
  const est = await db.storageEstimate();
  const persisted = navigator.storage && navigator.storage.persisted
    ? await navigator.storage.persisted().catch(() => false) : false;
  const last = state.settings.lastExportAt;
  const daysSinceExport = last ? Math.floor((Date.now() - last) / 86400000) : null;

  $('#view').innerHTML = `
    <p class="eyebrow">Data</p>
    <h2 class="h-big">Your database</h2>
    <p class="sub">${state.sessions.length} sessions · ${state.exercises.length} exercises · stored on this device only.</p>

    ${daysSinceExport === null || daysSinceExport >= 30 ? `<div class="hint" style="margin-top:16px">
      <div><b>Export a backup.</b> ${daysSinceExport === null
        ? 'You have never exported. iOS can clear a site\'s storage on its own — a file in your Files app is the only real safety net.'
        : `Last export was ${daysSinceExport} days ago.`}</div></div>` : `<p class="meta" style="text-align:left;padding:14px 0 0">
      Last export ${daysSinceExport} day${daysSinceExport === 1 ? '' : 's'} ago.</p>`}

    <div class="btn-row" style="margin-top:14px">
      <button class="btn btn-primary" data-act="export">Export backup</button>
      <button class="btn" data-act="import">Import backup</button>
    </div>
    <button class="btn btn-block btn-sm" style="margin-top:8px" data-act="import-csv">Import Strongify CSV</button>
    <input type="file" id="file-json" accept=".json,application/json" hidden>
    <input type="file" id="file-csv" accept=".csv,text/csv,text/plain" hidden>

    <h3 class="h-sec">Preferences</h3>
    <div class="card card-pad">
      <div class="field">
        <label for="p-unit">Weight unit</label>
        <select class="input" id="p-unit" data-pref="unit">
          <option value="kg" ${unit() === 'kg' ? 'selected' : ''}>Kilograms (kg)</option>
          <option value="lb" ${unit() === 'lb' ? 'selected' : ''}>Pounds (lb)</option>
        </select>
      </div>
      <div class="field">
        <label for="p-wstep">Weight step</label>
        <input class="input" id="p-wstep" data-pref="weightStep" inputmode="decimal" value="${state.settings.weightStep}">
      </div>
      <div class="field">
        <label for="p-rstep">Rep step</label>
        <input class="input" id="p-rstep" data-pref="repStep" inputmode="numeric" value="${state.settings.repStep}">
      </div>
      <div class="field">
        <label for="p-rest">Rest timer</label>
        <select class="input" id="p-rest" data-pref="restTimerSeconds">
          ${[60, 90, 120, 150, 180, 240, 300].map((v) => `<option value="${v}"
            ${Number(state.settings.restTimerSeconds) === v ? 'selected' : ''}>${v / 60 >= 1 ? `${v / 60} min` : `${v}s`}</option>`).join('')}
        </select>
      </div>
      <div class="field" style="margin-bottom:0">
        <label for="p-auto">Start rest timer automatically</label>
        <select class="input" id="p-auto" data-pref="restTimerAuto">
          <option value="yes" ${state.settings.restTimerAuto ? 'selected' : ''}>Yes, when I mark a set done</option>
          <option value="no" ${!state.settings.restTimerAuto ? 'selected' : ''}>No, never</option>
        </select>
      </div>
    </div>

    <h3 class="h-sec">Routines</h3>
    <a class="btn btn-block" href="#/routines">Manage routines${state.routines.length
      ? ` <span style="color:var(--mist)">· ${state.routines.length}</span>` : ''}</a>

    <h3 class="h-sec">Exercises</h3>
    <a class="btn btn-block" href="#/exercises">Manage exercise list</a>

    <h3 class="h-sec">Storage</h3>
    <div class="card card-pad">
      <p class="sub" style="margin:0 0 6px">
        ${persisted ? 'Marked persistent — the browser will not evict this data casually.'
                    : 'Not marked persistent. Add to the Home Screen and keep exporting.'}
      </p>
      ${est && est.usage != null ? `<p class="meta" style="text-align:left;padding:0">
        ${(est.usage / 1048576).toFixed(2)} MB used${est.quota ? ` of ${(est.quota / 1048576).toFixed(0)} MB available` : ''}</p>` : ''}
    </div>

    <hr class="sep">
    <button class="btn btn-danger btn-block" data-act="erase">Erase all data</button>
    <p class="meta">flexloop · schema v${db.SCHEMA_VERSION} · offline</p>`;
}

function viewExercises() {
  const counts = new Map();
  for (const s of state.sessions) {
    for (const e of s.entries || []) counts.set(e.exerciseId, (counts.get(e.exerciseId) || 0) + 1);
  }
  $('#topbar-action').innerHTML = `<a class="btn btn-sm btn-quiet" href="#/data">Back</a>`;
  $('#view').innerHTML = `
    <p class="eyebrow">Exercises</p>
    <h2 class="h-big">${state.exercises.length} in your list</h2>
    <p class="sub">Tap one to rename it, change its group, or remove it.</p>
    <div style="height:14px"></div>
    <div class="rows">${state.exercises.map((e) => `
      <button class="row" data-act="edit-exercise" data-id="${esc(e.id)}">
        <span class="grow"><span class="t">${esc(e.name)}</span>
          <span class="s">${esc(e.muscleGroup || 'Uncategorised')}${e.isBodyweight ? ' · bodyweight' : ''}</span></span>
        <span class="r">${counts.get(e.id) || 0}<em>sess</em></span>
      </button>`).join('') || '<div class="empty" style="padding:26px"><p style="margin:0">No exercises yet.</p></div>'}</div>`;
}

function editExerciseSheet(id) {
  const ex = state.byId.get(id);
  if (!ex) return;
  openSheet(`
    <h2>Edit exercise</h2>
    <div class="field"><label for="e-name">Name</label>
      <input class="input" id="e-name" value="${esc(ex.name)}" autocapitalize="words"></div>
    <div class="field"><label for="e-group">Muscle group</label>
      <input class="input" id="e-group" value="${esc(ex.muscleGroup || '')}" placeholder="Legs, Back, Push…" autocapitalize="words"></div>
    <div class="field"><label for="e-bw">Loading</label>
      <select class="input" id="e-bw">
        <option value="no" ${ex.isBodyweight ? '' : 'selected'}>Weighted</option>
        <option value="yes" ${ex.isBodyweight ? 'selected' : ''}>Bodyweight — track reps only</option>
      </select></div>
    <div class="btn-row" style="margin-top:16px">
      <button class="btn" data-close>Cancel</button>
      <button class="btn btn-primary" data-x="save">Save</button>
    </div>
    <button class="btn btn-danger btn-block btn-sm" style="margin-top:10px" data-x="del">Delete exercise</button>`,
  (root) => {
    root.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-x]');
      if (!b) return;
      if (b.dataset.x === 'save') {
        ex.name = $('#e-name', root).value.trim() || ex.name;
        ex.muscleGroup = $('#e-group', root).value.trim() || 'Uncategorised';
        ex.isBodyweight = $('#e-bw', root).value === 'yes';
        await db.saveExercise(ex);
        closeSheet();
        await reload();
        render();
        toast('Exercise saved');
      } else {
        closeSheet();
        const ok = await confirmSheet({
          title: `Delete ${ex.name}?`,
          body: 'The exercise disappears from your list. Sets already logged in past sessions stay, but show as a removed exercise.',
          confirm: 'Delete', danger: true,
        });
        if (!ok) return;
        await db.deleteExercise(ex.id);
        await reload();
        render();
        toast('Exercise deleted');
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
  $('#topbar-action').innerHTML = `<a class="btn btn-sm btn-quiet" href="#/data">Back</a>`;
  const rows = state.routines.map((r) => `
    <button class="row" data-act="open-routine" data-id="${esc(r.id)}">
      <span class="grow">
        <span class="t">${esc(r.name)}</span>
        <span class="s">${esc(routineSummary(r))}</span>
      </span>
      <span class="r">${r.lastUsedAt
        ? esc(S.relativeDays(S.localDate(new Date(r.lastUsedAt))))
        : 'new'}</span>
    </button>`).join('');

  $('#view').innerHTML = `
    <p class="eyebrow">Routines</p>
    <h2 class="h-big">${state.routines.length} saved</h2>
    <p class="sub">An ordered list of exercises. Starting one opens a session with
      every set already laid out, prefilled from the last time you trained it.</p>
    <div style="height:14px"></div>
    <button class="btn btn-block" data-act="new-routine">+ New routine</button>
    ${state.routines.length ? `<div style="height:12px"></div><div class="rows">${rows}</div>`
      : `<div class="empty"><div class="glyph"></div><h3>No routines yet</h3>
         <p>Build one here, or tap “Save as routine” at the bottom of any session
            to keep the exercises you just did.</p></div>`}`;
}

function viewRoutine(id) {
  const r = routineById(id);
  const view = $('#view');
  if (!r) {
    view.innerHTML = `<div class="empty"><div class="glyph"></div><h3>Routine not found</h3>
      <p>It may have been deleted.</p><a class="btn" href="#/routines">Back to routines</a></div>`;
    return;
  }
  $('#topbar-action').innerHTML = `<a class="btn btn-sm btn-quiet" href="#/routines">Back</a>`;
  const items = r.items || [];
  const missing = items.filter((it) => !state.byId.has(it.exerciseId)).length;

  view.innerHTML = `
    <p class="eyebrow">Routine</p>
    <h2 class="h-big">${esc(r.name)}</h2>
    <p class="sub">${esc(routineSummary(r))}${missing
      ? ` · ${missing} deleted exercise${missing === 1 ? '' : 's'}, skipped on start` : ''}</p>
    <div style="height:14px"></div>

    ${items.length ? `<div class="rt-list">${items.map((it, i) => {
      const ex = state.byId.get(it.exerciseId);
      return `<div class="rt-item" data-i="${i}">
        <span class="rt-name${ex ? '' : ' is-gone'}">${esc(ex ? ex.name : 'Removed exercise')}</span>
        <span class="rt-sets">
          <button class="step" data-act="routine-sets" data-d="-1" aria-label="Fewer sets">−</button>
          <span class="rt-n">${setCountOf(it)}<em>sets</em></span>
          <button class="step" data-act="routine-sets" data-d="1" aria-label="More sets">+</button>
        </span>
        <button class="btn btn-sm btn-quiet" data-act="routine-item-menu" aria-label="Options">•••</button>
      </div>`;
    }).join('')}</div>` : `<div class="empty" style="padding:26px 10px">
      <p style="margin:0">Nothing in this routine yet.</p></div>`}

    <button class="btn btn-block" data-act="routine-add">+ Add exercise</button>
    <div style="height:18px"></div>
    <button class="btn btn-primary btn-block btn-lg" data-act="start-routine" data-id="${esc(r.id)}">
      Start this routine</button>
    <div class="btn-row" style="margin-top:10px">
      <button class="btn btn-sm" data-act="rename-routine" data-id="${esc(r.id)}">Rename</button>
      <button class="btn btn-sm btn-danger" data-act="delete-routine" data-id="${esc(r.id)}">Delete</button>
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
    <h2>${esc(ex ? ex.name : 'Removed exercise')}</h2>
    <p class="sub">${setCountOf(it)} set${setCountOf(it) === 1 ? '' : 's'} · position ${i + 1} of ${r.items.length}</p>
    <div class="rows" style="margin-top:14px">
      <button class="row" data-x="up"><span class="grow"><span class="t">Move up</span></span></button>
      <button class="row" data-x="down"><span class="grow"><span class="t">Move down</span></span></button>
      <button class="row" data-x="rm"><span class="grow"><span class="t" style="color:var(--danger)">Remove from routine</span>
        <span class="s">The exercise itself is untouched</span></span></button>
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
    toast('Nothing to save — every exercise here has been deleted');
    return;
  }
  // Guess a name from the muscle group that dominates the session.
  const tally = new Map();
  for (const it of items) {
    const g = (state.byId.get(it.exerciseId).muscleGroup || '').trim();
    if (g && g !== 'Uncategorised') tally.set(g, (tally.get(g) || 0) + 1);
  }
  const suggested = [...tally.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g)[0] || '';

  const name = await promptSheet({
    title: 'Save as routine',
    body: `${items.length} exercise${items.length === 1 ? '' : 's'}, with the working sets you did today.`,
    label: 'Routine name',
    value: suggested,
    placeholder: 'Push A, Legs, Upper…',
  });
  if (!name) return;

  const r = { id: uid('r'), name, items, createdAt: Date.now(), updatedAt: Date.now(), lastUsedAt: null };
  await db.saveRoutine(r);
  state.routines = sortRoutines(state.routines.concat([r]));
  toast(`Saved routine ${r.name}`, 'Edit', () => { location.hash = `#/routine/${r.id}`; });
}

/* ==========================================================================
   EXPORT / IMPORT
   ========================================================================== */

async function doExport() {
  const data = await db.exportAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `flexloop-${S.localDate()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  state.settings.lastExportAt = Date.now();
  db.saveSettings(state.settings);
  toast(`Exported ${data.sessions.length} sessions`);
  render();
}

function readFile(input) {
  return new Promise((resolve, reject) => {
    const f = input.files && input.files[0];
    if (!f) return reject(new Error('No file chosen.'));
    const r = new FileReader();
    r.onload = () => resolve({ text: String(r.result), name: f.name });
    r.onerror = () => reject(new Error('That file could not be read.'));
    r.readAsText(f);
  });
}

async function doImportJson(input) {
  try {
    const { text } = await readFile(input);
    const data = JSON.parse(text);
    db.validateBackup(data);
    const nRoutines = Array.isArray(data.routines) ? data.routines.length : 0;
    const ok = await confirmSheet({
      title: 'Replace everything?',
      body: `This backup holds ${data.sessions.length} sessions, ${data.exercises.length} exercises${
        nRoutines ? ` and ${nRoutines} routine${nRoutines === 1 ? '' : 's'}` : ''
      }. Importing replaces what is on this device now.`,
      confirm: 'Replace', danger: true,
    });
    if (!ok) return;
    const res = await db.importAll(data, 'replace');
    state.settings = db.loadSettings();
    await reload();
    render();
    toast(`Restored ${res.sessions} sessions`);
  } catch (err) {
    toast(err.message || 'Import failed.', null, null, 5000);
  } finally {
    input.value = '';
  }
}

async function doImportCsv(input) {
  try {
    const { text } = await readFile(input);
    if (!looksLikeStrongify(text)) {
      const cont = await confirmSheet({
        title: 'Unfamiliar CSV',
        body: 'This does not look like a Strongify export. flexloop will try to read it as one anyway.',
        confirm: 'Try anyway',
      });
      if (!cont) return;
    }
    const data = parseStrongifyCsv(text);
    const r = data._report;
    const ok = await confirmSheet({
      title: 'Import this history?',
      body: `Found ${r.sessions} sessions across ${r.exercises} exercises${r.skipped ? `, skipping ${r.skipped} unreadable rows` : ''}. These are merged in; nothing already on this device is deleted.`,
      confirm: 'Import',
    });
    if (!ok) return;
    const res = await db.importAll(data, 'merge');
    await reload();
    render();
    toast(`Imported ${res.sessions} sessions`);
  } catch (err) {
    toast(err.message || 'Import failed.', null, null, 5000);
  } finally {
    input.value = '';
  }
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
    toast('Rest done');
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
    case 'add-warmup':
      if (!c.entry) return;
      await addSet(c.session, c.entry, act === 'add-warmup');
      render();
      break;

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
      break;
    }

    case 'done': {
      if (!c.set) return;
      c.set.done = !c.set.done;
      btn.setAttribute('aria-pressed', c.set.done ? 'true' : 'false');
      c.setEl.classList.toggle('is-done', c.set.done);
      await persist(c.session);
      patchSummary(c.session);
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
        title: 'Discard this session?', body: 'Everything logged in it is deleted.',
        confirm: 'Discard', danger: true,
      });
      if (!ok) return;
      await db.deleteSession(s.id);
      await reload();
      stopRest();
      render();
      toast('Session discarded');
      break;
    }

    case 'open-session':
      location.hash = `#/session/${btn.dataset.id}`;
      break;

    case 'delete-session': {
      const s = c.session;
      const ok = await confirmSheet({
        title: 'Delete this session?', body: 'It is removed from your history and from every chart.',
        confirm: 'Delete', danger: true,
      });
      if (!ok) return;
      await db.deleteSession(s.id);
      await reload();
      location.hash = '#/history';
      toast('Session deleted');
      break;
    }

    case 'jump-exercise': {
      const id = btn.dataset.id;
      if (!state.byId.has(id)) { toast('That exercise is no longer in your list'); return; }
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
        title: 'New routine',
        label: 'Routine name',
        placeholder: 'Push A, Legs, Upper…',
        confirm: 'Create',
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
        title: 'Rename routine', label: 'Routine name', value: r.name,
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
        title: `Delete ${r.name}?`,
        body: 'The routine is removed. Sessions you already logged from it are untouched.',
        confirm: 'Delete', danger: true,
      });
      if (!ok) return;
      await db.deleteRoutine(r.id);
      state.routines = state.routines.filter((x) => x.id !== r.id);
      location.hash = '#/routines';
      toast('Routine deleted');
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
      if (out) out.innerHTML = `${it.sets}<em>sets</em>`;
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
    case 'import':      $('#file-json').click(); break;
    case 'import-csv':  $('#file-csv').click(); break;

    case 'erase': {
      const ok = await confirmSheet({
        title: 'Erase everything?',
        body: 'Every session, exercise, routine and setting on this device is deleted. Export first if you might want any of it back.',
        confirm: 'Erase everything', danger: true,
      });
      if (!ok) return;
      await db.clear(db.STORE_SE);
      await db.clear(db.STORE_EX);
      await db.clear(db.STORE_RO);
      await reload();
      render();
      toast('All data erased');
      break;
    }

    case 'info':
      infoSheet();
      break;

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
    saveTimer = setTimeout(() => { persist(c.session); patchSummary(c.session); }, 350);
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
  } else if (el.dataset.pref) {
    const key = el.dataset.pref;
    let v = el.value;
    if (key === 'restTimerAuto') v = v === 'yes';
    else if (key === 'weightStep') v = Math.max(0.25, parseFloat(v.replace(',', '.')) || 2.5);
    else if (key === 'repStep') v = Math.max(1, parseInt(v, 10) || 1);
    else if (key === 'restTimerSeconds') v = parseInt(v, 10) || 120;
    state.settings[key] = v;
    db.saveSettings(state.settings);
    toast('Preference saved');
    if (key === 'unit') render();
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

/** Reference for gestures the UI doesn't otherwise explain — long-press above all. */
function infoSheet() {
  openSheet(`
    <h2>How to edit a set</h2>
    <p class="sub">The +/− steppers and the checkmark cover adding and finishing a
      set. Everything else lives behind a long-press.</p>
    <div class="info-list">
      <div class="info-item"><span class="t">Long-press a set row</span>
        <span class="s">Opens a menu to mark it a warmup, duplicate it, or delete it.
          There's no swipe or edit button — deleting a set is always this.</span></div>
      <div class="info-item"><span class="t">Tap the weight or reps number</span>
        <span class="s">Type a value directly instead of stepping to it.</span></div>
      <div class="info-item"><span class="t">Tap ••• on an exercise card</span>
        <span class="s">Mark every set in it done at once, move it up or down, or
          remove it from this session — the exercise itself is untouched.</span></div>
      <div class="info-item"><span class="t">Tap an exercise's name</span>
        <span class="s">Jumps to its chart on Progress → Per exercise.</span></div>
    </div>
    <button class="btn btn-block" style="margin-top:16px" data-close>Got it</button>`);
}

function setMenu(c) {
  if (!c.set) return;
  openSheet(`
    <h2>Set ${c.si + 1}</h2>
    <p class="sub">${esc(exName(c.entry.exerciseId))} · ${S.fmtNum(c.set.weight)} ${esc(unit())} × ${c.set.reps}</p>
    <div class="rows" style="margin-top:14px">
      <button class="row" data-x="warmup"><span class="grow"><span class="t">${c.set.isWarmup ? 'Make it a working set' : 'Mark as warmup'}</span>
        <span class="s">Warmups are excluded from volume and records</span></span></button>
      <button class="row" data-x="dup"><span class="grow"><span class="t">Duplicate set</span>
        <span class="s">Same weight and reps, added below</span></span></button>
      <button class="row" data-x="del"><span class="grow"><span class="t" style="color:var(--danger)">Delete set</span>
        <span class="s">Cannot be undone</span></span></button>
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
    <p class="sub">${c.entry.sets.length} set${c.entry.sets.length === 1 ? '' : 's'} in this session</p>
    <div class="rows" style="margin-top:14px">
      <button class="row" data-x="all"><span class="grow"><span class="t">Mark every set done</span>
        <span class="s">Tick the whole exercise at once</span></span></button>
      <button class="row" data-x="up"><span class="grow"><span class="t">Move up</span></span></button>
      <button class="row" data-x="down"><span class="grow"><span class="t">Move down</span></span></button>
      <button class="row" data-x="rm"><span class="grow"><span class="t" style="color:var(--danger)">Remove from session</span>
        <span class="s">Deletes its sets here only</span></span></button>
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
      title: 'Nothing marked done',
      body: 'No completed sets in this session. Finish it anyway, or go back and tick your sets?',
      confirm: 'Finish anyway',
    });
    if (!ok) return;
  }
  session.endedAt = Date.now();
  await persist(session);
  state.activeId = null;
  stopRest();
  location.hash = '#/log';
  render();
  toast(`Session saved — ${summaryLine(session)}`);
}

/* ---------------------------------------------------- add-to-home hint */

function hintHtml() {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  if (standalone || !iOS || localStorage.getItem('flexloop.a2hs')) return '';
  return `<div class="hint">
    <div><b>Put flexloop on your Home Screen.</b> Tap Share, then “Add to Home Screen”. It then opens full screen and works with no signal.</div>
    <button data-act="dismiss-hint" aria-label="Dismiss">×</button></div>`;
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
      toast('Update ready', 'Reload', () => location.reload(), 0);
    });
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (!w) return;
      w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) {
          toast('Update ready', 'Reload', () => location.reload(), 0);
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
  try {
    await db.openDB();
  } catch (err) {
    $('#view').innerHTML = `<div class="empty"><div class="glyph"></div><h3>Storage unavailable</h3>
      <p>This browser blocked local storage, so flexloop cannot save anything. Private browsing is the usual cause.</p></div>`;
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
