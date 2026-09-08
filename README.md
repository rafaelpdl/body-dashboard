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

Under each of those sits a **change chart**: the same metric expressed as the difference
from one period to the next, as bars above and below a zero baseline. What it compares
follows the aggregation control — with *Daily* selected it is day over day, with
*7-day average* it is the change in the 7-day average, with *Monthly* it is month over
month. Increases and decreases are drawn in two different colours, so a run of gain or
loss reads as a block rather than needing to be traced.

Two details worth knowing:

- Changes are computed **before** the time range is applied, so the leftmost bar is a real
  change from the period just before the window rather than a gap.
- With *Show values* on, a change chart labels every bar while they still fit and
  otherwise labels only the largest rise and the largest fall — a number on all 180 bars
  is unreadable.

Global controls:

- **Aggregation** — daily · 7-day · 14-day · 30-day rolling average · weekly · monthly · quarterly · yearly.
  The 7/14/30-day options are *trailing calendar-day windows*: they average whatever
  measurements exist in the trailing period, so a missed weigh-in never blanks the line.
- **Time range** — 7 days · 14 days · 30 days · 90 days · 6 months · 1 year · 3 years · all history.
- **Data values** — hide or show the numbers on the lines.

The composition chart adds two controls of its own:

- **Lines shown** — fat + lean · fat only · lean only.
- **Axis references** — *one on each side* (independent scales, the two shapes are
  comparable) or *both on left* (a single shared kg scale, so the real distance between
  fat mass and lean mass is visible).

Touch or drag anywhere on a chart to read the date and value for that point.

## Your data stays on your device

There is no backend, no database, no analytics and no third-party JavaScript.

- Measurements live in **IndexedDB in your iPhone's browser**.
- New measurements reach the page through the URL **fragment** (`#sync=…`). Browsers
  do not send the fragment to the server, so GitHub never receives a measurement.
- The fragment is removed from the address bar as soon as it has been imported.
- Apple Health remains the source of truth. This repository holds no copy of it.

## Architecture

```
Scale → Fitdays → Apple Health → Apple Shortcut → browser dashboard → IndexedDB (iPhone)
```

The Shortcut resends a rolling window (about the last 30 days) on every run. That is
deliberate: each measurement has a stable key (metric + exact instant + source), so
re-sending is idempotent — repeats update the existing record instead of adding a new
one, and any day the sync missed is silently recovered.

### One browser, one storage

Measurements live in the browser's own storage, and **each browser on iOS keeps a
completely separate store**. Whatever browser the Shortcut opens has to be the same
browser you read the dashboard in — otherwise you end up with two half-full dashboards
and no error message to tell you so.

Two ways that goes wrong:

- **Chrome vs. Safari.** The Shortcuts *Open URLs* action opens the iPhone's **default
  browser**. If you read the dashboard in Chrome, make Chrome the default:
  **Settings → Chrome → Default Browser App → Chrome**. Otherwise the Shortcut writes
  into Safari's storage while you are looking at Chrome.
- **Installed web app vs. browser.** Do not use *Add to Home Screen* on the dashboard
  page itself. An installed web app gets its own storage container, separate again from
  the browser the Shortcut opens. `manifest.webmanifest` declares `"display": "browser"`
  on purpose. Put the **Shortcut** on the Home Screen instead.

Already put measurements in the wrong browser? Move them: open the dashboard there,
**Data & backup → Export backup**, then open the dashboard in the browser you actually
use and **Import JSON** that file.

### A note on Chrome for iOS

Every iOS browser, Chrome included, renders with WebKit, so the dashboard behaves the
same as it does in Safari. One difference: Chrome for iOS runs in a web view where
service workers are generally unavailable, so `sw.js` will not register and the
dashboard's *code* is not cached for offline use — it needs a connection to load. The
registration is wrapped in a feature check and a `try`, so nothing breaks, and **your
measurements are local and unaffected either way**.

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

1. Open the dashboard in the browser you use on the iPhone.
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

### When a sync looks wrong

A reading the dashboard cannot trust is never stored: weight has to fall between
20 and 400 kg and body fat between 0 and 80 %. Rather than dropping those silently,
the dashboard shows a note under the header saying how many readings it kept per
metric, how many it ignored and why — including the case where the sync brings weight
but no body fat at all. If one chart updates and another does not, that note says
which of the two is arriving.

### Export a backup

**Data & backup → Export backup** writes a JSON file with every stored sample.
Save it somewhere private, e.g. iCloud Drive. It is a plain user-initiated download —
nothing is uploaded anywhere.

Do this occasionally. iOS browser storage is not permanent: WebKit clears a site's
script-writable storage after roughly seven consecutive days without visiting that
site. Daily use resets the clock, but a long break, a cleared-site-data tap, or a
device reset would empty the dashboard. Apple Health remains the source of truth, and
a backup makes recovery a single tap.

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
| `.nojekyll` | tells GitHub Pages to serve the files as-is |
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
