# Body Dashboard

A private, iPhone-first dashboard for body weight and body composition.

**Live site:** https://rafaelpdl.github.io/body-dashboard/

> This repository contains **only the dashboard code**. It contains no health
> measurements, and it never will. See [PRIVACY.md](PRIVACY.md).

## What it does

Three vertically stacked charts, drawn from measurements stored on your own iPhone:

1. **Weight** (kg)
2. **Body fat** (%)
3. **Fat mass & lean mass** — `fat mass = weight × body-fat %`, `lean mass = weight − fat mass`

Global controls:

- **Aggregation** — daily · 7-day · 14-day · 30-day rolling average · weekly · monthly · quarterly · yearly.
  The 7/14/30-day options are *trailing calendar-day windows*: they average whatever
  measurements exist in the trailing period, so a missed weigh-in never blanks the line.
- **Time range** — 30 days · 90 days · 6 months · 1 year · 3 years · all history.
- **Data values** — hide or show the numbers on the lines.

The composition chart adds two controls of its own:

- **Lines shown** — fat + lean · fat only · lean only.
- **Axis references** — *one on each side* (independent scales, the two shapes are
  comparable) or *both on left* (a single shared kg scale, so the real distance between
  fat mass and lean mass is visible).

Touch or drag anywhere on a chart to read the date and value for that point.

## Your data stays on your device

There is no backend, no database, no analytics and no third-party JavaScript.

- Measurements live in **IndexedDB in Safari on your iPhone**.
- New measurements reach the page through the URL **fragment** (`#sync=…`). Browsers
  do not send the fragment to the server, so GitHub never receives a measurement.
- The fragment is removed from the address bar as soon as it has been imported.
- Apple Health remains the source of truth. This repository holds no copy of it.

## Architecture

```
Scale → Fitdays → Apple Health → Apple Shortcut → Safari dashboard → IndexedDB (iPhone)
```

The Shortcut resends a rolling window (about the last 30 days) on every run. That is
deliberate: each measurement has a stable key (metric + exact instant + source), so
re-sending is idempotent — repeats update the existing record instead of adding a new
one, and any day the sync missed is silently recovered.

### Why Safari and not an installed PWA

Open the dashboard through **the Shortcut**, not through a Home Screen web app.
The Shortcut opens a normal URL, which lands in Safari; a Home Screen web app gets a
*separate* storage container. If you install the page to the Home Screen, the Shortcut
would write into Safari's storage while the installed app reads its own — the charts
would silently stop updating. `manifest.webmanifest` therefore declares
`"display": "browser"` on purpose.

Put the **Shortcut** on the Home Screen instead (Shortcuts app → the shortcut's
details → *Add to Home Screen*).

## Setting it up

1. **Configure the Shortcut** — follow [SHORTCUT_SETUP.md](SHORTCUT_SETUP.md).
   It builds a `Sync Body Dashboard` shortcut that reads Body Mass and Body Fat
   Percentage from Apple Health and opens the dashboard with them in the fragment.
2. **Import your history once** (optional) — see below.
3. **Add the Shortcut to the Home Screen** and use it as your daily entry point.

Daily routine: weigh yourself → wait for Fitdays to reach Apple Health → tap the Shortcut.

### One-time historical import

If you have exported your Apple Health history to a JSON file, keep that file private
(Files / iCloud Drive — **never** in this repository) and:

1. Open the dashboard in Safari.
2. Open **Data & backup**.
3. Tap **Import JSON** and pick the file.

Expected shape (an array of records, or an object with a `records` array):

```json
{
  "format": "body-dashboard-health-samples-v1",
  "records": [
    { "type": "weight",  "timestamp": "2001-02-03T08:00:00-03:00", "value": 70.5, "source": "Example Scale" },
    { "type": "bodyFat", "timestamp": "2001-02-03T08:00:00-03:00", "value": 18.0, "source": "Example Scale" }
  ]
}
```

The values above are synthetic examples. The importer accepts decimal points and
Brazilian decimal commas (`70,5`), body fat as percentage points (`18.5`) or as a
fraction (`0.185`), and re-importing the same file never multiplies records.

### Export a backup

**Data & backup → Export backup** writes a JSON file with every stored sample.
Save it somewhere private, e.g. iCloud Drive. It is a plain user-initiated download —
nothing is uploaded anywhere.

### Restore a backup

**Data & backup → Import JSON** and pick a previously exported backup. Restoring is
merge-and-deduplicate, so it is safe to restore on top of existing data.

**Clear local copy** wipes only this dashboard's IndexedDB. Apple Health is untouched.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | dashboard markup, CSP, no inline script |
| `styles.css` | mobile-first styling, light + dark |
| `app.js` | IndexedDB store, sync/import parsing, aggregation, SVG charts, backups |
| `sw.js` | offline cache for the dashboard's *own code* (never for data) |
| `manifest.webmanifest` | deliberately `display: browser` — see above |
| `icons/` | Home Screen / tab icons |
| `tests/run-tests.mjs` | headless validation suite (see below) |
| `SHORTCUT_SETUP.md` | how to build the Apple Shortcut |
| `DEPLOY_GITHUB_PAGES.md` | how the site is published |
| `PRIVACY.md` | privacy model and its limits |

## Tests

```bash
npm install -g playwright && npx playwright install chromium   # once
node tests/run-tests.mjs
```

The suite serves the repository under a `/body-dashboard/` sub-path — matching GitHub
Pages — and drives it in a 390 px mobile Chromium with touch enabled. It covers the
empty state, asset resolution, number parsing (commas, percentages, fractions), stable
de-duplication, fragment sync on both a cold open and a same-tab `hashchange`, JSON
import / export / restore / clear, persistence across reloads, every aggregation and
range combination, the shared-versus-split axis behaviour, data labels, touch scrubbing,
mobile layout, and the absence of any third-party request.

**All fixtures are synthetic and generated inside the test file.** Never commit real
measurements to this repository — `.gitignore` blocks the usual filenames, but the rule
matters more than the tooling.
