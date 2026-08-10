/* =========================================================================
   version.js — the build version, and what changed in each one.

   TO SHIP AN UPDATE: bump APP_VERSION and add an entry at the top of
   CHANGELOG. Nothing else. The service worker names its cache after this
   string, so bumping it is what drops the old cache and refetches the shell.

   This file is loaded twice and in two different ways:
     · sw.js pulls it in with importScripts(), which cannot parse a module,
     · app.js imports it as a module, for the Settings footer and the
       version-history sheet.
   Hence the assignments to `self` and the absence of any `export`: that is
   the one shape both loaders understand.

   Keep every changelog line to about 30 words. It is a reminder of what
   moved, not a commit message — and the sheet is read on a phone.
   ========================================================================= */

self.APP_VERSION = 'flexloop-v16';

/* Newest first. `v` is the cache name that shipped the entries under it. */
self.APP_CHANGELOG = [
  {
    v: 'flexloop-v16',
    items: [
      ['A shorter tab bar, properly this time',
       'v15 meant to let the home indicator pay for part of the row, but a 44px floor swallowed it. The row now overlaps the strip: 79px down to 57px.'],
    ],
  },
  {
    v: 'flexloop-v15',
    items: [
      ['A shorter tab bar on the Home Screen',
       'Installed, the tab bar stacked its full height on top of the home indicator. The indicator now pays for part of it — about 14px of screen back.'],
      ['The Log stays where you left it',
       'Adding a set no longer rebuilds the screen, so it stops jumping to the top. Nor does changing a preference, a Progress window, or deleting a set.'],
    ],
  },
  {
    v: 'flexloop-v14',
    items: [
      ['The chart you touched leads',
       'One tap still reads out every progress chart, but only the tooltip under your thumb is at full strength — the other three step back.'],
      ['Shorter readings',
       '“Every set” and “Top set weight” drop the date from their tooltips. The x axis under the point already says which session it is.'],
      ['Which way the trend is going',
       'The volume trend line in a tooltip is now led by ↑, ↓ or → — where the average moved since the session before it.'],
      ['English dates everywhere',
       'Dates no longer follow the phone’s language: “20 Jul”, not “20. Juli”, on every handset.'],
    ],
  },
  {
    v: 'flexloop-v13',
    items: [
      ['A target under the ghost',
       'Each exercise card says what would beat your own number today — “Beat 94.5 kg e1RM · 80×7”. It updates as you log and says so once you clear it.'],
      ['Tick the set that beats it',
       'The row is marked, the phone buzzes, and a toast names the new number the moment a set carries the exercise past its target.'],
      ['Next target, and a streak',
       'Progress → Per exercise gains what it would take to beat your all-time best, how long that best has stood, and whether recent sessions are climbing.'],
      ['Finishing reads back',
       'A session ends with a per-exercise read-out — best ever, up, level or down — instead of a one-line toast.'],
      ['Pick the metric',
       'Settings → Motivation chooses what all of that measures: estimated 1RM, heaviest set, reps at your working weight, volume, or none.'],
    ],
  },
  {
    v: 'flexloop-v12',
    items: [
      ['One tap reads the whole column',
       'Picking a session in any per-exercise chart now opens the tooltip in all of them, so one touch answers what happened in that session.'],
      ['Clearer tooltips',
       'Volume per session reads “Total · 480 kg” above its trend line, and top set weight reads weight, then reps, then date.'],
      ['Reps from zero',
       'The rep axis of “Every set” starts at zero, so a dot’s height is the rep count itself. Its legend now lists the line before the bars.'],
    ],
  },
  {
    v: 'flexloop-v11',
    items: [
      ['Version and history',
       'The Settings footer prints the build version — the same string the service worker caches under. Tap it for this list.'],
      ['Averaged over is editable',
       'The trend length dropdown ends in “Edit this list…” like the other two. Any length from 2 to 60 sessions.'],
      ['Backups nag sooner',
       'The reminder to export now appears six days after your last backup rather than thirty. iOS can clear a site’s storage in about a week.'],
    ],
  },
  {
    v: 'flexloop-v10',
    items: [
      ['Settings tab',
       'The Data tab became Settings — same glyph, same place. Old #/data links still work.'],
      ['Editable dropdowns',
       'Rest timer and Weight step offer “Edit this list…”, where their values can be added to, trimmed, or reset to defaults.'],
      ['Plot settings',
       'The moving-average controls moved into their own section, with a note spelling out the arithmetic of whichever average is picked.'],
      ['Per-tab help',
       'The topbar (i) explains the screen you are on rather than only the Log.'],
      ['Light theme',
       'A light palette, “Match system”, and a sun/moon toggle beside the wordmark. Applied before first paint, so no dark flash.'],
    ],
  },
  {
    v: 'flexloop-v9',
    items: [
      ['Volume trend line',
       'Volume per session can carry a simple or exponential moving average. It runs over the whole history and is then cut to the window on screen.'],
      ['No highlight you did not ask for',
       'Bar charts stopped lighting their newest bar. A highlight is now only ever the result of a tap.'],
    ],
  },
  {
    v: 'flexloop-v8',
    items: [
      ['Selections stick on touch',
       'A tapped datapoint stays selected after your thumb lifts, and the session it belongs to is marked in every chart of that exercise.'],
    ],
  },
  {
    v: 'flexloop-v7',
    items: [
      ['Every-set chart',
       'One bar per set on a weight axis with those sets’ reps as a line, sitting between Estimated 1RM and Volume per session.'],
    ],
  },
  {
    v: 'flexloop-v6',
    items: [
      ['One x scale',
       'Every progress chart shares one horizontal geometry, so a session sits at the same place in each of them and gaps are real time.'],
    ],
  },
  {
    v: 'flexloop-v5',
    items: [
      ['Column labels',
       'The weight and reps columns in the Log say which is which.'],
    ],
  },
  {
    v: 'flexloop-v4',
    items: [
      ['Info button',
       'The topbar gained (i), explaining how to edit a set.'],
    ],
  },
  {
    v: 'flexloop-v3',
    items: [
      ['Routines',
       'Save a session’s exercises and set counts as a routine, then start from it later. Routines travel in a backup. Schema v2.'],
    ],
  },
  {
    v: 'flexloop-v2',
    items: [
      ['Jump to the charts',
       'Tapping an exercise name in the Log opens that exercise on Progress → Per exercise.'],
    ],
  },
  {
    v: 'flexloop-v1',
    items: [
      ['First release',
       'Offline gym journal: logging, history, progress charts, JSON backup and restore, Strongify CSV import, and a Home Screen shell that works with no network.'],
    ],
  },
];
