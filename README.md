# flexloop

An offline gym journal. Static files, no backend, no accounts, no network calls at
runtime. Everything you log stays in your phone's own storage.

Built to be added to an iPhone Home Screen and used in airplane mode.

---

## Deploy to GitHub Pages

1. Create a repository and push these files to its root — `index.html` must sit at
   the top level, not inside a subfolder.

   ```bash
   git init
   git add .
   git commit -m "flexloop"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```

2. In the repo, open **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to *Deploy from a branch*.
4. Choose branch `main`, folder `/ (root)`. Save.
5. Wait about a minute, then open `https://<you>.github.io/<repo>/`.

The `.nojekyll` file is already here — without it, Pages runs the site through
Jekyll and can drop files. Don't delete it.

Every path in the app is relative, so it works at any subpath. Nothing needs
editing for your repo name.

## Put it on your iPhone Home Screen

1. Open the Pages URL in **Safari** (not Chrome — only Safari can install a web app
   on iOS).
2. Tap the **Share** button, scroll down, tap **Add to Home Screen**, then **Add**.
3. Launch it from the Home Screen icon. It opens full screen with no browser chrome.
4. Open it once more while online so the service worker finishes caching, then you
   can go offline for good.

If the app ever launches shorter than the screen — a dead strip along the bottom
that no layout change touches — the Home Screen icon is holding a stale launch
configuration. Delete the icon and add it again from Safari. iOS captures how the
app launches at the moment you add it, and nothing you ship afterwards can
correct it.

## Ship an update

1. Edit whatever you want to change.
2. Open `js/version.js` and bump the version at the top, then add what changed to
   the top of `APP_CHANGELOG`:

   ```js
   self.APP_VERSION = 'flexloop-v12';   // was v11

   self.APP_CHANGELOG = [
     { v: 'flexloop-v12', items: [['What moved', 'Thirty words at most.']] },
     // …then every earlier release, unchanged
   ];
   ```

   **This is the only step people forget.** Without a bump the old cache keeps
   serving the old files and your change never appears.

   One file, because two would drift: `sw.js` names its cache after
   `APP_VERSION` (via `importScripts`, which is why that file has no `export`
   in it) and Settings prints the same string at its foot, where tapping it
   opens the changelog. A version the app shows that disagrees with the one it
   caches under is worse than showing none.

3. Commit and push. Pages redeploys in about a minute.
4. On the phone, open the app while online. A "Update ready — Reload" banner
   appears once the new worker installs. It never reloads on its own, because you
   might be mid-set.

If a new file was added, also add it to the `SHELL` array in `sw.js`, or it won't
be available offline.

---

## Offline verification checklist

Run this once after installing. It takes about three minutes.

1. **First load.** Open the app on the phone over wifi or cellular. Log one set so
   there is data to look for. Add it to the Home Screen.
2. **Let the worker install.** Stay on the page for ten seconds, then close it.
3. **Go offline.** Turn on airplane mode. Confirm the wifi is off too.
4. **Force-quit.** Swipe up from the bottom and swipe the app card away.
5. **Relaunch from the Home Screen icon.** It must open to the Log screen with no
   error and no browser address bar. If you get a blank page or a Safari "cannot
   open" error, the worker did not install — repeat from step 1 while online.
6. **Log while offline.** Start a session, add an exercise, tap `+` on weight,
   mark the set done. The rest timer should start.
7. **Check the ghost and the target.** Add the same exercise again in a new
   session. The "Last …" line under its name must show what you just did, and
   the "Beat …" line under that must name a number and what would clear it.
   Tick a set that clears it: the line turns accent, the row is marked, the
   phone buzzes, and a toast names the new number.
8. **Render a chart.** Tap the exercise's name on its card in the Log. Progress →
   Per exercise should open on that exercise and the estimated 1RM chart should
   draw. Tap a point; a tooltip appears.
9. **Save and start a routine.** Still offline: at the bottom of a session tap
   "Save as routine" and name it. Finish the session; the routine appears under
   "Start from a routine" on the Log. Tap it — the sets should already be there.
10. **Reboot the phone.** Still in airplane mode, relaunch from the Home Screen.
    Everything from steps 6–9 must still be there.
11. **Export:** go to Settings → Export backup and confirm a `flexloop-YYYY-MM-DD.json`
    lands in your Files app. (export never touches the network)

Step 11 is not optional. iOS clears the storage of sites it considers unused, and
an installed Home Screen app reduces that risk without removing it. The exported
file is the only real backup.

---

## Getting data in and out

**Settings → Import backup** restores a flexloop `.json` export, and asks first
whether to **merge** or **replace**. Merge adds the file's sessions, exercises and
routines to what is already here and leaves your settings alone; Replace wipes the
device first, settings included. Both are a put keyed by id, so where the two hold
the same session the file wins — it is not a field-level merge.

The **ⓘ** under the four buttons explains all of this in the app — both formats,
what each one carries, and what it leaves behind. The Settings info sheet keeps
only the *why*: that the storage is evictable and the export habit is not optional.

**Settings → Import CSV / Export CSV** are the interchange pair. One row per set,
in the column order a Strongify backup uses:

```
App Version,Routine Name,Exercise Name,Exercise Type,Weight,Rep,Duration,Date
```

Import always merges and deletes nothing; sets recorded on the same calendar day
become one session, and the routine name is kept as the session note. Export writes
completed working sets only — the reader stamps every row it sees as a finished
working set, so exporting a warmup or an unfinished one would bring it back as
something it never was. Routines, settings, RPE and warmup flags have no column at
all. **The `.json` is the only lossless format**, which is also why exporting CSV
does not reset the backup nag.

## Sample data

With nothing logged, the Log offers **Load sample data**: six months of an example
Push / Pull / Legs split, one to two sessions a week, generated backwards from the
most recent Monday so the charts have something recent to draw. It exists so a
fresh install is not a blank wall.

Ids are deterministic (`ex_demo_…`, `s_demo_…`, `r_demo_…`), so loading twice in
one week overwrites rather than duplicates, and settings are never touched —
`js/demo.js` returns a backup-shaped object with no `settings` key and it goes in
through the same merge path as a CSV import. **Settings → Remove sample data**
appears while it is loaded and takes all of it back out, keeping anything you
logged yourself along with any sample exercise one of your own sessions now uses.

## Routines

A routine is an ordered list of exercises with a set count for each — nothing else.
There are deliberately **no target weights**: sets already prefill from the last
time you trained the exercise, so a stored target would be a second, staler copy
of a number the app can work out for itself.

Two ways to make one:

- **Save as routine**, at the bottom of any session, keeps the exercises you just
  did along with the number of working sets each got. Warmups are not part of the
  plan, so they are left out. The name is prefilled with whichever muscle group
  dominates the session.
- **Settings → Manage routines → New routine** builds one from scratch.

Starting a routine from the Log opens a session with every set already laid out
and prefilled. Start one while a session is already open and it offers to fold the
exercises into that session instead, so you never end up with two sessions running
at once. Exercises you have since deleted are skipped, and the toast says how many.

Backups carry routines from schema v2 onward. A v1 backup still imports — it simply
has none.

## The Settings tab

Everything that is not logging lives here: backups, preferences, plot settings,
routines, the exercise list, and storage. (It was called *Data* until the tab was
renamed; `#/data` still redirects to `#/settings`, so an old bookmark or a Home
Screen icon left on that tab keeps working.)

### Editable dropdowns

**Rest timer**, **Weight step** and **Averaged over** are dropdowns whose contents
you choose. All three end in **Edit this list…**, which opens an editor where you
can

- add a value of your own — 75 seconds, a 3.75 kg plate pair, a 6-session average,
- remove ones you never pick, down to a last one that cannot be removed,
- or reset the list to the defaults.

The list and the chosen value are stored separately (`restTimerOptions` /
`restTimerSeconds`, `weightStepOptions` / `weightStep`, `volumeTrendPeriodOptions`
/ `volumeTrendPeriod`) and all of them ride along in a backup. Values are cleaned
on the way in and out — deduplicated, sorted, clamped to 5–3600 seconds, 0.25–100
units and 2–60 sessions — so a hand-edited backup cannot put a broken choice in
the dropdown. Remove the value currently in use and the setting moves to the
**nearest remaining one**, never silently back to a default.

Adding one is a matter of a spec in `OPTION_LISTS` (a `clean`, a `format`, and
the two settings keys); everything else — the select, the editor sheet, the
sanitising, the change handler — is shared.

Weight step labels follow the unit setting; switching kg → lb relabels the list
rather than converting it, since the number you want is a property of your plates,
not of the previous unit.

### Motivation

**Target to beat** picks the metric behind three things at once: the target line
on every Log card, the *Next target* tile on Progress → Per exercise, and the
read-out when a session is finished. The choices are estimated 1RM (the default),
heaviest set, reps at your working weight, volume, or **None**, which removes all
three. A lift that has never carried a load is always measured in reps, whatever
is selected — its e1RM, top weight and volume are all zero, and a target of zero
is no target.

The number aimed at is the **nearer of two**: last session's, while you are still
under it, and your all-time best once you are past it. That keeps it reachable
after a layoff without letting it go slack once you are climbing. The session
being logged is excluded from its own history — otherwise clearing the target
would raise it in the same instant and the line could never read as beaten.

### Plot settings

The moving-average controls have their own header, apart from the logging
preferences: they change what a chart draws, not what a button does. The note
under **Averaged over** spells out the arithmetic for whichever kind is selected,
and the lengths it offers are an editable list like the two above it — anything
from 2 to 60 sessions, though a length longer than your history draws nothing at
all, by design.

## Version history

The foot of Settings reads `flexloop · v13 · offline`. That `v13` is the build,
and the offline cache is named after it (`flexloop-v13`); tapping it opens the
changelog — what changed in each release, newest first, a line or two per thing.
The changelog lives in `js/version.js` beside the version itself, so bumping one
without the other is hard to miss.

## The info button

The (i) beside the wordmark explains **the tab you are on** — the Log's
long-press gestures, what History groups and how to delete a session, how
Progress computes e1RM and volume, and on Settings the editable dropdowns, the
two moving averages, and why exporting regularly is not optional. One entry per
tab, in `INFO` at the bottom of `app.js`.

Settings also nags for a backup once **six days** have passed since your last
export (`EXPORT_NAG_DAYS` in `app.js`). iOS can clear a site's storage after
roughly a week of not opening it, so a reminder that arrives later than that is
a reminder about data you no longer have.

## Light and dark

The whole palette is a set of CSS custom properties in `:root`, and the light
theme is the same names with different values under `:root[data-theme="light"]` —
nothing downstream knows which one is live. Tokens are named for their role, so
`--ink` is always "the page" and `--chalk` always "text on it"; they swap ends of
the scale rather than gaining a second rule. The accent darkens to `#B26A00` in
light mode (`#FFB020` on white is about 1.9:1 and unreadable), and `--on-signal`
carries whatever has to sit on top of an accent fill.

- The **sun/moon beside the wordmark** flips between light and dark from any
  screen. **Settings → Appearance** adds *Match system*, which follows
  `prefers-color-scheme` live.
- The stored value is `theme: 'dark' | 'light' | 'auto'`. `auto` is resolved in
  JavaScript, not in CSS, so `data-theme` on `<html>` always states which palette
  is actually on screen.
- A small inline script in `index.html` applies the theme **before first paint**.
  `app.js` is a module and therefore deferred; without it a light-theme user gets
  a dark flash on every launch. It is deliberately duplicated logic — it has to
  run without importing anything.
- Charts inherit all of it: their colours are the same variables, including the
  area gradient, whose stops are styled from CSS because an SVG `stop-color`
  attribute cannot hold a custom property.

## Files

```
index.html              app shell, PWA meta tags
manifest.webmanifest    relative start_url and scope, icons
sw.js                   precache list, cache named after APP_VERSION
css/app.css             the whole visual system
js/version.js           the version string + changelog, shared by sw.js and app.js
js/app.js               routing, views, all interaction
js/db.js                IndexedDB wrapper (exercises, sessions, routines),
                        export/import, settings
js/stats.js             e1RM, volume, PRs, targets, weekly aggregates, dates
js/charts.js            hand-written SVG line and bar charts
js/importers.js         CSV reader and writer
js/demo.js              the sample dataset behind "Load sample data"
icons/                  192, 512, and the 180px apple-touch-icon
.nojekyll               stops Pages from running Jekyll
```

No build step, no npm, no bundler. Open `index.html` through any static server and
it runs. (A `file://` URL will not work — ES modules and service workers both need
an origin. `python3 -m http.server` is enough for local work.)

## How the numbers are calculated

- **Estimated 1RM** — Epley: `weight × (1 + reps / 30)`, taking the best set of each
  session. It is an estimate and drifts optimistic above about 12 reps, which is why
  the formula is printed on the chart.
- **Volume** — `Σ weight × reps` across completed sets. Warmups are excluded
  everywhere, including from personal records.
- **Volume trend line** — the moving average drawn over *Volume per session* in
  Progress → Per exercise. **Settings → Plot settings → Volume trend line** picks
  between none, a simple average and an exponential one, and how many sessions
  it runs over (5 by default). The exponential average weights recent sessions
  more heavily (`k = 2 / (n + 1)`) and is seeded with the simple average of its
  first window, so both kinds begin at the same session and the same number.
  Nothing is drawn until there are as many sessions as the average asks for —
  the chart's label says `NEEDS 5+` until then, rather than plotting a partial
  average that would look like a trend. The average always runs over the whole
  history and is then cut to the window on screen, so switching 1M/3M/6M moves
  the view without changing the line.
- **Heaviest at each rep count** — the heaviest set that reached *at least* that many
  reps, so a 5-rep PR is never beaten only on a technicality.
- **Week streak** — consecutive Monday-anchored weeks containing at least one
  session. Not having trained yet this week does not break a live streak.
- **The target to beat** — the metric's own formula, run backwards. For e1RM that
  is Epley inverted: the reps needed at today's weight are
  `floor(30 × (target / weight − 1)) + 1`, and the weight needed at today's reps
  is `target / (1 + reps / 30)`, rounded up to the next weight step. Both are
  strict — a set that merely ties the target does not clear it. Suggestions above
  20 reps, or more than 12 extra sets of volume, are dropped rather than printed:
  past that they stop being targets. Warmups are excluded, as everywhere else.
- **Sessions climbing** — consecutive session-to-session improvements in the
  chosen metric, counting back from the most recent. A plateau ends the run; one
  improvement spans two sessions, which is why the label reads one higher than
  the count.

## Design notes

High contrast, one accent, system fonts only — dark by default, with a light
theme carrying the same shapes and spacing. Numbers are set in
the system monospace with tabular figures so digits do not jump as you tap a
stepper. The one deliberate flourish is the **ghost line**: last session's weight
and reps sit under every exercise as you log, in dim mono, so the loop from last
time to this time is always on screen without a tap. That is also why new sets
prefill themselves — typing should be rare.

Directly under it, built the same way and sharing its leading rule, sits the
**target**: what would beat that number today. The two read as one block — what
you did, then what would beat it — and the target is deliberately a derived line
rather than a stored goal, for the same reason routines hold no target weights:
a number the app works out from your history cannot go stale, and a second place
to keep it would only disagree with the first.

Tapping an exercise's **name** on a card — while logging, or in any saved session —
opens Progress → Per exercise on that exercise. The small chart glyph beside the
name is the affordance; the name itself is not underlined, which on a card reads
as an error rather than a link. A name shown as *Removed exercise* is plain text,
since there is nothing left to chart.

## Assumptions made while building

- Default unit is **kg**, weight step **2.5**, rep step **1**. All changeable in Settings.
- **RPE** is kept in the data model but not surfaced in the UI; it was clutter on a
  390px screen. The field is there if you want it back.
- Charts are hand-written SVG rather than a vendored library — no dependency, and
  full control of styling.
- Nothing on a chart is highlighted until you tap it. A bar chart used to leave
  its newest bar lit by default, which read as a selection nobody had made and
  put a tooltip-less highlight on screen at all times.
- The charts on Progress → Per exercise are one figure. Tapping a session in any
  of them highlights that session in all of them **and** opens every tooltip in
  the column, so one touch answers "what happened that day" without tapping the
  same date three times. Where a session is several sets, the tooltip of "Every
  set" reads out the heaviest of them, which is the set the chart below is
  plotting anyway.
- The trend line is drawn in chalk, not in the accent: orange already means
  "this is the bar you tapped", and a trend in the same colour would read as a
  selection stretched across the whole chart.
- Deleting a set is a **long-press** on the set row (which also offers warmup and
  duplicate) rather than a swipe, because swipe conflicts with page scrolling.
- A session left open for more than 18 hours is closed automatically, so a workout
  you forgot to finish never hijacks the Log screen the next morning.
- Cardio distance/duration is not logged. Duration is read from imported files and
  preserved, but there is no UI for it.
- A routine stores no weights, and no days-of-the-week schedule. It is a list to
  work down, not a programme to obey.
- The theme defaults to **dark**, not to the system setting. *Match system* is one
  tap away for anyone who wants it, but a gym at 6am is not a place to be handed a
  white screen because the phone thinks it is daytime.
- Neither theme uses `black-translucent` for the iOS status bar: dark mode asks for
  `black`, light mode for `default`. `black-translucent` is the only value that makes
  the web view full-screen, and the one thing that buys is the strip behind the home
  indicator — which the tab bar then has to pad straight back out, so it costs height
  and returns nothing. Of the two opaque styles, `black` draws the clock in white and
  would be invisible on a light page, hence the split. iOS reads that meta tag while
  parsing the head, so a theme changed mid-session only reaches the status bar at the
  next launch.

## Licence

TODO.
