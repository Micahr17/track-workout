# Track Workout

A mobile-first PWA for the 2026–27 track & field offseason plan (September 14, 2026 → March 7, 2027).
Open it at the track or gym and it shows exactly what to do today.

**The Google Sheet is the master training plan. The app is the athlete-facing interface.**
The app never changes a prescription — it displays, organises, tracks and visualises the plan.

## Features

- **Today** — auto-loads today's workout (local date), focus, coach note, completion %, START WORKOUT.
  Browse other days with ‹ › or via the calendar.
- **Workout mode** — each section (🔥 Warm-up · ⚡ Speed · 💥 Jumps/Plyos · 🏋️ Strength · 🧘 Recovery)
  broken into actionable items: per-set checkboxes, sprint rep counters, approach-run / jump pills.
  "Show exact prescription" always reveals the sheet's original text.
- **Rest timer** — parsed from the plan ("2–3 min" → 2:30, adjustable ±15/30 s), pause / resume / reset / stop,
  vibration + tone at zero. A manual timer is always one tap away.
- **Strength logging** — weight / reps / RPE per set, with "Last time" recall for the same lift.
- **Sprint timing** — optional "+ Add times" per rep; expanded automatically in testing weeks and time trials.
- **Hamstring check** — 🟢 / 🟡 / 🔴 before hard sprinting, with the plan's own stop rules.
- **Long-jump pit branch** — "Pit available?" reveals either the full LJ work or the plan's no-pit alternative.
- **Completion** — auto-detects 100 %, records duration, notes ("How did today feel?"), saves to History.
- **Plan** — phase timeline (tap for purpose / focus / dates), full calendar with hard/light/recovery/rest/completed markers.
- **Progress** — April 2027 targets vs current PRs, days until team practice, testing log with trend charts.
- **History** — completed days with logged weights, times and notes.
- **Settings** — light/dark/system, sound, vibration, units, sync status, backup / reset.
- **PWA** — installable on iPhone, works fully offline after first load.

## Data architecture

```
Google Sheet (master)  ──export CSV (public, read-only, CORS ok)──▶  app at runtime (js/plan.js)
        │                                                              ▲ validates → caches in localStorage
        └──tools/sync_sheet.py──▶ workouts.js + plan-meta.js (bundled)─┘ offline fallback
```

- `workouts.js` — the 175 daily rows (DAILY WORKOUTS tab). Same format as v1.
- `plan-meta.js` — per-day focus + coach note (OFFSEASON MASTER tab), phase overview, testing schedule,
  loading guide and safety text.
- At runtime the app fetches the Sheet's CSV export, validates it (≥100 rows, required columns, ISO dates)
  and swaps it in; if the network is down or the data is invalid it uses the cached / bundled copy and shows
  the sync state in Settings.

### Updating the plan

1. Edit the **DAILY WORKOUTS** tab in the Google Sheet. The app picks up changes on its next launch (online).
2. To bake the changes into the bundled files (recommended after larger edits, and required for the
   focus/notes/phase data which comes from the other tabs):

```bash
python tools/sync_sheet.py --check   # preview what changed
python tools/sync_sheet.py           # regenerate workouts.js + plan-meta.js
```

Then bump `CACHE` in `sw.js` and redeploy.

The Sheet must remain shared as *Anyone with the link → Viewer*. No API keys or Google login are used.

## Project layout

```
index.html            app shell
styles.css            all styling (mobile first, sidebar ≥ 900 px, light/dark)
js/utils.js           dates, formatting, DOM helpers
js/store.js           local persistence (localStorage, swappable for IndexedDB/backend)
js/parser.js          prose → actionable items (never alters a prescription)
js/plan.js            plan data, Google Sheet sync, derived facts (phases, deload/testing weeks)
js/timer.js           rest timer
js/app.js             screens + interactions
workouts.js           bundled daily plan (generated)
plan-meta.js          bundled focus/notes/phases/tests (generated)
sw.js                 service worker (offline cache)
manifest.webmanifest  PWA manifest
icons/                app icons (SVG + PNG, generated)
tools/sync_sheet.py   regenerate bundled data from the Sheet
vercel.json           headers for Vercel
```

## Run locally

```bash
python -m http.server 8765
```

Open http://localhost:8765. For live-reload development, run `localStorage.setItem("tw.nosw","1")` in the console
once to disable the service worker.

## Deploy (Vercel)

Static site, no build step.

**Option A — drag & drop:** vercel.com → Add New → Project → drag this folder.

**Option B — GitHub:** push this repo to GitHub, import it in Vercel, Framework preset *Other*, no build command,
output directory `.` (root).

## Install on iPhone

1. Open the deployed URL in **Safari**.
2. Tap **Share** → **Add to Home Screen**.
3. Name should read **Track Workout** → **Add**.
4. Open the new icon — it launches full-screen and works offline.

## Local data

Everything you log stays on the device (localStorage under `trackWorkout.v2`). Use Settings → *Copy backup*
to export as JSON.
