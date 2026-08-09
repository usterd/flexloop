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

## Ship an update

1. Edit whatever you want to change.
2. Open `sw.js` and bump the version at the top:

   ```js
   const CACHE_VERSION = 'flexloop-v4';   // was v3
   ```

   **This is the only step people forget.** Without a bump the old cache keeps
   serving the old files and your change never appears.

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
7. **Check the ghost.** Add the same exercise again in a new session. The
   "Last …" line under its name must show what you just did.
8. **Render a chart.** Tap the exercise's name on its card in the Log. Progress →
   Per exercise should open on that exercise and the estimated 1RM chart should
   draw. Tap a point; a tooltip appears.
9. **Save and start a routine.** Still offline: at the bottom of a session tap
   "Save as routine" and name it. Finish the session; the routine appears under
   "Start from a routine" on the Log. Tap it — the sets should already be there.
10. **Reboot the phone.** Still in airplane mode, relaunch from the Home Screen.
    Everything from steps 6–9 must still be there.
11. **Export:** go to Data → Export backup and confirm a `flexloop-YYYY-MM-DD.json`
    lands in your Files app. (export never touches the network)

Step 11 is not optional. iOS clears the storage of sites it considers unused, and
an installed Home Screen app reduces that risk without removing it. The exported
file is the only real backup.

---

## Importing your history

**Data → Import Strongify CSV** reads a Strongify backup and merges it in. Sets
recorded on the same calendar day become one session; the routine name is kept as
the session note. Nothing already on the device is deleted.

**Data → Import backup** restores a flexloop `.json` export. This one *replaces*
everything, and asks first.

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
- **Data → Manage routines → New routine** builds one from scratch.

Starting a routine from the Log opens a session with every set already laid out
and prefilled. Start one while a session is already open and it offers to fold the
exercises into that session instead, so you never end up with two sessions running
at once. Exercises you have since deleted are skipped, and the toast says how many.

Backups carry routines from schema v2 onward. A v1 backup still imports — it simply
has none.

## Files

```
index.html              app shell, PWA meta tags
manifest.webmanifest    relative start_url and scope, icons
sw.js                   precache list + CACHE_VERSION
css/app.css             the whole visual system
js/app.js               routing, views, all interaction
js/db.js                IndexedDB wrapper (exercises, sessions, routines),
                        export/import, settings
js/stats.js             e1RM, volume, PRs, weekly aggregates, dates
js/charts.js            hand-written SVG line and bar charts
js/importers.js         Strongify CSV reader
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
  Progress → Per exercise. **Data → Preferences → Volume trend line** picks
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

## Design notes

Dark, high contrast, one accent (`#FFB020`), system fonts only. Numbers are set in
the system monospace with tabular figures so digits do not jump as you tap a
stepper. The one deliberate flourish is the **ghost line**: last session's weight
and reps sit under every exercise as you log, in dim mono, so the loop from last
time to this time is always on screen without a tap. That is also why new sets
prefill themselves — typing should be rare.

Tapping an exercise's **name** on a card — while logging, or in any saved session —
opens Progress → Per exercise on that exercise. The small chart glyph beside the
name is the affordance; the name itself is not underlined, which on a card reads
as an error rather than a link. A name shown as *Removed exercise* is plain text,
since there is nothing left to chart.

## Assumptions made while building

- Default unit is **kg**, weight step **2.5**, rep step **1**. All changeable in Data.
- **RPE** is kept in the data model but not surfaced in the UI; it was clutter on a
  390px screen. The field is there if you want it back.
- Charts are hand-written SVG rather than a vendored library — no dependency, and
  full control of styling.
- Nothing on a chart is highlighted until you tap it. A bar chart used to leave
  its newest bar lit by default, which read as a selection nobody had made and
  put a tooltip-less highlight on screen at all times.
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

## Licence

TODO.
