/**
 * Headless validation for the Body Dashboard.
 *
 * The page is served under a `/body-dashboard/` sub-path so that the same
 * relative-URL assumptions GitHub Pages makes are exercised here too.
 *
 * All data used here is synthetic and generated in this file. No real
 * measurement ever belongs in this repository.
 *
 * Run with:  node tests/run-tests.mjs        (needs `playwright` + Chromium)
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE_PATH = '/body-dashboard/';
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.txt': 'text/plain', '.md': 'text/markdown'
};

let passed = 0;
const failures = [];
function check(name, condition, detail = '') {
  if (condition) { passed++; console.log(`  ok   ${name}`); }
  else { failures.push(`${name}${detail ? ' — ' + detail : ''}`); console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// --------------------------------------------------------------------------
// Synthetic fixtures
// --------------------------------------------------------------------------
const day = (n) => new Date(Date.UTC(2001, 5, 1 + n)).toISOString().slice(0, 10); // June 2001 onwards

function syntheticHistory(days = 40) {
  const records = [];
  for (let i = 0; i < days; i++) {
    records.push({ type: 'weight', timestamp: `${day(i)}T08:00:00-03:00`, value: 100 + i * 0.1, source: 'Example Scale' });
    records.push({ type: 'bodyFat', timestamp: `${day(i)}T08:00:00-03:00`, value: 30 + i * 0.05, source: 'Example Scale' });
  }
  return { format: 'body-dashboard-health-samples-v1', records };
}

// --------------------------------------------------------------------------
// Static server that mimics the GitHub Pages sub-path
// --------------------------------------------------------------------------
function startServer() {
  const server = http.createServer((req, res) => {
    let url = decodeURIComponent(req.url.split('?')[0]);
    if (!url.startsWith(BASE_PATH)) { res.writeHead(404).end('outside base path'); return; }
    let rel = url.slice(BASE_PATH.length) || 'index.html';
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// --------------------------------------------------------------------------
const server = await startServer();
const origin = `http://127.0.0.1:${server.address().port}`;
const URL_BASE = origin + BASE_PATH;

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },   // iPhone-ish
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  acceptDownloads: true
});
const page = await context.newPage();
page.on('dialog', (d) => d.accept());   // auto-accept import alerts and clear confirms

const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
const failedRequests = [];
page.on('requestfailed', (r) => failedRequests.push(`${r.url()} ${r.failure()?.errorText}`));
page.on('response', (r) => { if (r.status() >= 400) failedRequests.push(`${r.url()} -> ${r.status()}`); });

// ==========================================================================
console.log('\n1. Static load / asset resolution under /body-dashboard/');
await page.goto(URL_BASE, { waitUntil: 'networkidle' });
check('page loads with no JS errors', consoleErrors.length === 0, consoleErrors.join(' | '));
check('no failed/404 asset requests', failedRequests.length === 0, failedRequests.join(' | '));
check('title renders', (await page.title()) === 'Body Dashboard');
check('no absolute root-relative asset URLs in HTML/JS', await page.evaluate(() => {
  const bad = [...document.querySelectorAll('[src],[href]')]
    .map(el => el.getAttribute('src') || el.getAttribute('href'))
    .filter(v => v && v.startsWith('/'));
  return bad.length === 0;
}));

console.log('\n2. Empty state');
check('empty state visible with no data', await page.locator('#emptyState').isVisible());
check('status line reports no measurements', (await page.locator('#statusLine').textContent()).includes('No local measurements'));
check('charts show empty message', (await page.locator('#weightChart').innerHTML()).includes('No measurements'));

console.log('\n3. Parser unit checks (in-page)');
const parser = await page.evaluate(() => ({
  point: parseNumber('80.7'),
  comma: parseNumber('80,7'),
  percent: parseNumber('22,1%'),
  thousands: parseNumber('1.234,5'),
  thousandsUS: parseNumber('1,234.5'),
  fatFraction: normalizeRecord({ type: 'bodyFat', timestamp: '2001-01-01T08:00:00Z', value: 0.221 }).value,
  fatPercent: normalizeRecord({ type: 'bodyFat', timestamp: '2001-01-01T08:00:00Z', value: 22.1 }).value,
  fatCommaFraction: normalizeRecord({ type: 'bodyFat', timestamp: '2001-01-01T08:00:00Z', value: '0,221' }).value,
  weightComma: normalizeRecord({ type: 'weight', timestamp: '2001-01-01T08:00:00Z', value: '80,7' }).value,
  spaceTimestamp: !!normalizeRecord({ type: 'weight', timestamp: '2001-01-01 08:00:00', value: 80 }),
  dateOnly: !!normalizeRecord({ type: 'weight', timestamp: '2001-01-01', value: 80 }),
  rejectsGarbageType: normalizeRecord({ type: 'steps', timestamp: '2001-01-01T08:00:00Z', value: 80 }),
  rejectsBadDate: normalizeRecord({ type: 'weight', timestamp: 'yesterday', value: 80 }),
  rejectsOutOfRange: normalizeRecord({ type: 'weight', timestamp: '2001-01-01T08:00:00Z', value: 900 }),
  // a weight value leaking into a "B|" line must never be stored as body fat
  rejectsWeightAsBodyFat: normalizeRecord({ type: 'bodyFat', timestamp: '2001-01-01T08:00:00Z', value: 83.90000152587891 }),
  floatNoiseWeight: normalizeRecord({ type: 'weight', timestamp: '2001-01-01T08:00:00Z', value: 83.90000152587891 }).value,
  floatNoiseFat: normalizeRecord({ type: 'bodyFat', timestamp: '2001-01-01T08:00:00Z', value: 22.900000762939453 }).value,
  floatNoiseFraction: normalizeRecord({ type: 'bodyFat', timestamp: '2001-01-01T08:00:00Z', value: 0.22900000762939453 }).value,
  hkAlias: normalizeRecord({ type: 'HKQuantityTypeIdentifierBodyMass', timestamp: '2001-01-01T08:00:00Z', value: 80 })?.type,
  // same instant written three different ways must collapse to one id
  idOffset: normalizeRecord({ type: 'weight', timestamp: '2001-01-01T08:00:00-03:00', value: 80.7, source: 'S' }).id,
  idZulu: normalizeRecord({ type: 'weight', timestamp: '2001-01-01T11:00:00Z', value: 80.7, source: 'S' }).id,
  idRounded: normalizeRecord({ type: 'weight', timestamp: '2001-01-01T11:00:00.000Z', value: 80.69999, source: 'S' }).id,
  fragment: parseSyncFragment('#sync=' + encodeURIComponent(
    'W|2001-03-04T07:30:00-03:00|80,7|Example Scale\nB|2001-03-04T07:30:00-03:00|0,221|Example Scale\nX|bogus|1\n')),
  fragmentUndecoded: parseSyncFragment('#sync=W|2001-03-04T07:30:00-03:00|80.7|Example Scale').length
}));
check('decimal point parses', near(parser.point, 80.7));
check('Brazilian decimal comma parses', near(parser.comma, 80.7));
check('percent sign + comma parses', near(parser.percent, 22.1));
check('pt-BR thousands "1.234,5" parses', near(parser.thousands, 1234.5));
check('en-US thousands "1,234.5" parses', near(parser.thousandsUS, 1234.5));
check('fractional body fat 0.221 -> 22.1', near(parser.fatFraction, 22.1, 1e-9));
check('percentage body fat 22.1 stays 22.1', near(parser.fatPercent, 22.1));
check('fractional body fat "0,221" -> 22.1', near(parser.fatCommaFraction, 22.1, 1e-9));
check('weight "80,7" -> 80.7', near(parser.weightComma, 80.7));
check('space-separated timestamp accepted', parser.spaceTimestamp);
check('date-only timestamp accepted', parser.dateOnly);
check('unknown metric rejected', parser.rejectsGarbageType === null);
check('unparseable date rejected', parser.rejectsBadDate === null);
check('implausible weight rejected', parser.rejectsOutOfRange === null);
check('a weight value in a body-fat line is rejected, not stored', parser.rejectsWeightAsBodyFat === null);
check('32-bit float noise is rounded off (weight)', parser.floatNoiseWeight === 83.9, String(parser.floatNoiseWeight));
check('32-bit float noise is rounded off (body fat)', parser.floatNoiseFat === 22.9, String(parser.floatNoiseFat));
check('float noise rounded after fraction conversion', parser.floatNoiseFraction === 22.9, String(parser.floatNoiseFraction));
check('Apple Health type identifier accepted', parser.hkAlias === 'weight');
check('same instant, different offset -> same id', parser.idOffset === parser.idZulu, `${parser.idOffset} vs ${parser.idZulu}`);
check('same instant, rounded value -> same id', parser.idOffset === parser.idRounded);
check('fragment parses 2 valid lines and drops the invalid one', parser.fragment.length === 2);
check('fragment keeps the source field', parser.fragment[0].source === 'Example Scale');
check('already-decoded fragment still parses', parser.fragmentUndecoded === 1);

console.log('\n4. Aggregation unit checks (in-page)');
const agg = await page.evaluate(() => {
  const mk = (arr) => arr.map(([date, value]) => ({ date, value }));
  // Sparse series: 4 measurements inside a 7-day window, gaps included.
  const sparse = mk([['2001-01-01', 10], ['2001-01-03', 20], ['2001-01-06', 30], ['2001-01-20', 100]]);
  const r7 = aggregateSeries(sparse, 'r7');
  const daily = aggregateSeries(sparse, 'daily');
  const monthly = aggregateSeries(mk([['2001-01-05', 10], ['2001-01-25', 20], ['2001-02-05', 40]]), 'monthly');
  const quarterly = aggregateSeries(mk([['2001-01-05', 10], ['2001-03-25', 20], ['2001-07-05', 40]]), 'quarterly');
  const yearly = aggregateSeries(mk([['2001-01-05', 10], ['2001-12-25', 20], ['2002-07-05', 40]]), 'yearly');
  const weekly = aggregateSeries(mk([['2001-01-01', 10], ['2001-01-03', 20], ['2001-01-08', 40]]), 'weekly');
  const r14 = aggregateSeries(mk([['2001-01-01', 10], ['2001-01-10', 20], ['2001-01-20', 30]]), 'r14');
  const r30 = aggregateSeries(mk([['2001-01-01', 10], ['2001-01-20', 20], ['2001-03-01', 60]]), 'r30');
  rawSamples = [
    { type: 'weight', timestamp: '2001-01-01T08:00:00Z', localDate: '2001-01-01', instant: 1, value: 100, source: 'Example Scale' },
    { type: 'bodyFat', timestamp: '2001-01-01T08:00:00Z', localDate: '2001-01-01', instant: 1, value: 25, source: 'Example Scale' }
  ];
  const comp = dailyComposition();
  return {
    dailyLen: daily.length, dailyValues: daily.map(x => x.value),
    r7: r7.map(x => [x.value, x.count]),
    r14last: r14.at(-1), r30: r30.map(x => x.value),
    monthly: monthly.map(x => [x.date, x.value]),
    quarterly: quarterly.map(x => [x.date, x.value]),
    yearly: yearly.map(x => [x.date, x.value]),
    weekly: weekly.map(x => [x.date, x.value]),
    comp
  };
});
check('daily aggregation passes values through', agg.dailyLen === 4 && near(agg.dailyValues[2], 30));
check('7-day window averages only what exists (no 7-sample requirement)',
  near(agg.r7[2][0], 20) && agg.r7[2][1] === 3, JSON.stringify(agg.r7));
check('7-day window drops points older than the window', near(agg.r7[3][0], 100) && agg.r7[3][1] === 1);
check('14-day trailing window works', near(agg.r14last.value, 25) && agg.r14last.count === 2, JSON.stringify(agg.r14last));
check('30-day trailing window works', near(agg.r30[1], 15) && near(agg.r30[2], 60), JSON.stringify(agg.r30));
check('weekly buckets start on Monday', agg.weekly[0][0] === '2001-01-01' && near(agg.weekly[0][1], 15) && agg.weekly[1][0] === '2001-01-08');
check('monthly aggregation groups by month', agg.monthly.length === 2 && agg.monthly[0][0] === '2001-01-01' && near(agg.monthly[0][1], 15));
check('quarterly aggregation groups by quarter', agg.quarterly.length === 2 && agg.quarterly[0][0] === '2001-01-01' && agg.quarterly[1][0] === '2001-07-01');
check('yearly aggregation groups by year', agg.yearly.length === 2 && agg.yearly[0][0] === '2001-01-01' && near(agg.yearly[0][1], 15));
check('fat mass = weight x body fat %', near(agg.comp[0].fat, 25));
check('lean mass = weight - fat mass', near(agg.comp[0].lean, 75));

console.log('\n5. URL-fragment sync + idempotency');
const fragment = ['W|2001-02-09T08:00:00-03:00|100,5|Example Scale',
                  'B|2001-02-09T08:00:00-03:00|0,300|Example Scale',
                  'W|2001-02-10T08:00:00-03:00|100.6|Example Scale',
                  'B|2001-02-10T08:00:00-03:00|29.8|Example Scale'].join('\n');
// Cold open: the Shortcut launches the browser on a page that is not already loaded.
await page.goto('about:blank');
await page.goto(`${URL_BASE}#sync=${encodeURIComponent(fragment)}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => rawSamples.length > 0);
const afterSync = await page.evaluate(() => rawSamples.length);
check('fragment sync imported 4 samples', afterSync === 4, String(afterSync));
check('fragment removed from the visible URL', await page.evaluate(() => location.hash === ''));
check('fragment path preserved (still under /body-dashboard/)', await page.evaluate(() => location.pathname) === BASE_PATH);
check('comma decimal from the Shortcut stored as 100.5',
  await page.evaluate(() => rawSamples.some(r => r.type === 'weight' && Math.abs(r.value - 100.5) < 1e-9)));
check('fraction 0,300 stored as 30 %',
  await page.evaluate(() => rawSamples.some(r => r.type === 'bodyFat' && Math.abs(r.value - 30) < 1e-9)));

// Warm open: the browser reuses the already-open tab, so only `hashchange` fires.
// Re-send the same window, plus one same-instant record written differently
// (Z instead of -03:00, extra decimal) and one genuinely new day.
const resend = fragment
  + '\nW|2001-02-10T11:00:00Z|100.60001|Example Scale'
  + '\nW|2001-02-11T08:00:00-03:00|100,7|Example Scale';
await page.evaluate((f) => { location.hash = 'sync=' + encodeURIComponent(f); }, resend);
await page.waitForFunction(() => rawSamples.length === 5, null, { timeout: 5000 }).catch(() => {});
const afterResync = await page.evaluate(() => rawSamples.length);
check('same-tab hashchange sync imports without a reload', afterResync === 5, String(afterResync));
check('repeated sync does not duplicate the 4 already-stored records', afterResync === 5, String(afterResync));
check('hashchange sync also clears the fragment', await page.evaluate(() => location.hash === ''));
check('status line shows the sample count', (await page.locator('#statusLine').textContent()).includes('5 local samples'));
check('empty state hidden once data exists', !(await page.locator('#emptyState').isVisible()));

console.log('\n5b. Rejected readings are reported, not silently dropped');
const rejects = await page.evaluate(async () => {
  const out = {};
  const stats = {};
  // a weight value arriving on a body-fat line - the classic mis-wired Shortcut
  out.bodyFatTooHigh = normalizeRecord({ type: 'bodyFat', timestamp: '2001-05-05T08:00:00Z', value: 81.2 }, stats);
  normalizeRecord({ type: 'weight', timestamp: '2001-05-05T08:00:00Z', value: 5 }, stats);
  normalizeRecord({ type: 'weight', timestamp: 'not a date', value: 80 }, stats);
  normalizeRecord({ type: 'steps', timestamp: '2001-05-05T08:00:00Z', value: 80 }, stats);
  out.stats = stats;
  const res = await saveRecords([
    { type: 'weight',  timestamp: '2001-05-05T08:00:00-03:00', value: 80.1, source: 'Example Scale' },
    { type: 'bodyFat', timestamp: '2001-05-05T08:00:00-03:00', value: 80.1, source: 'Example Scale' },
    { type: 'bodyFat', timestamp: '2001-05-06T08:00:00-03:00', value: 81.9, source: 'Example Scale' }
  ]);
  out.res = res;
  describeImport(res, 'Last sync');
  const note = document.getElementById('syncNote');
  out.noteVisible = !note.classList.contains('hidden');
  out.noteText = note.textContent;
  return out;
});
check('a body-fat value above 80 % is rejected', rejects.bodyFatTooHigh === null);
check('rejection reasons are counted by cause',
  rejects.stats.bodyFatOutOfRange === 1 && rejects.stats.weightOutOfRange === 1
  && rejects.stats.unreadableDate === 1 && rejects.stats.unknownMetric === 1,
  JSON.stringify(rejects.stats));
check('saveRecords reports kept counts per metric',
  rejects.res.weight === 1 && rejects.res.bodyFat === 0, JSON.stringify(rejects.res));
check('saveRecords reports the rejected count', rejects.res.rejected === 2, String(rejects.res.rejected));
check('a note is shown when readings are rejected', rejects.noteVisible);
check('the note names the body-fat range problem', /body-fat reading/.test(rejects.noteText), rejects.noteText);
check('the note points at the likely Shortcut cause',
  /Repeat with Each/.test(rejects.noteText), rejects.noteText);

const cleanNote = await page.evaluate(async () => {
  const res = await saveRecords([
    { type: 'weight',  timestamp: '2001-05-07T08:00:00-03:00', value: 80.2, source: 'Example Scale' },
    { type: 'bodyFat', timestamp: '2001-05-07T08:00:00-03:00', value: 21.5, source: 'Example Scale' }
  ]);
  describeImport(res, 'Last sync');
  return { hidden: document.getElementById('syncNote').classList.contains('hidden'), res };
});
check('a clean sync hides the note again', cleanNote.hidden, JSON.stringify(cleanNote.res));

const oneSided = await page.evaluate(async () => {
  const res = await saveRecords([
    { type: 'weight', timestamp: '2001-05-08T08:00:00-03:00', value: 80.3, source: 'Example Scale' }
  ]);
  describeImport(res, 'Last sync');
  const note = document.getElementById('syncNote');
  return { visible: !note.classList.contains('hidden'), text: note.textContent };
});
check('weight-only sync with nothing rejected is still flagged',
  oneSided.visible && /no body-fat readings/.test(oneSided.text), oneSided.text);
// remove only what this section added, so later sections see the state they expect
const restored = await page.evaluate(async () => {
  const mine = [
    { type: 'weight',  timestamp: '2001-05-05T08:00:00-03:00', value: 80.1, source: 'Example Scale' },
    { type: 'weight',  timestamp: '2001-05-07T08:00:00-03:00', value: 80.2, source: 'Example Scale' },
    { type: 'bodyFat', timestamp: '2001-05-07T08:00:00-03:00', value: 21.5, source: 'Example Scale' },
    { type: 'weight',  timestamp: '2001-05-08T08:00:00-03:00', value: 80.3, source: 'Example Scale' }
  ].map(r => normalizeRecord(r).id);
  const db = await openDB();
  await new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    mine.forEach(id => tx.objectStore(STORE).delete(id));
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
  db.close();
  document.getElementById('syncNote').classList.add('hidden');
  await refresh();
  return rawSamples.length;
});
check('section cleanup leaves the earlier synced records intact', restored === 5, String(restored));

console.log('\n6. Historical JSON import, dedup, export, restore, clear');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bd-'));
const historyFile = path.join(tmp, 'synthetic_history.json');
fs.writeFileSync(historyFile, JSON.stringify(syntheticHistory(40)));
await page.locator('.data-panel > summary').click();     // expand "Data & backup"
check('data & backup actions become reachable', await page.locator('#importBtn').isVisible());
await page.locator('#importBtn').click();
await page.locator('#importFile').setInputFiles(historyFile);
await page.waitForFunction(() => rawSamples.length > 10);
const afterImport = await page.evaluate(() => rawSamples.length);
check('historical import loaded 80 synthetic samples (+5 synced)', afterImport === 85, String(afterImport));

await page.locator('#importFile').setInputFiles(historyFile);
await page.waitForTimeout(400);
check('re-importing the same file does not multiply records',
  (await page.evaluate(() => rawSamples.length)) === 85);

const [download] = await Promise.all([
  page.waitForEvent('download'),
  page.locator('#exportBtn').click()
]);
const backupPath = path.join(tmp, 'backup.json');
await download.saveAs(backupPath);
const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
check('backup export produces a JSON file', backup.format === 'body-dashboard-health-samples-v1');
check('backup contains every stored sample', backup.records.length === 85, String(backup.records.length));
check('backup omits internal derived fields',
  backup.records.every(r => !('id' in r) && !('instant' in r) && !('localDate' in r)));

await page.locator('#clearBtn').click();
await page.waitForFunction(() => rawSamples.length === 0);
check('clear empties the local copy', (await page.evaluate(() => rawSamples.length)) === 0);
check('empty state returns after clearing', await page.locator('#emptyState').isVisible());

await page.locator('#importFile').setInputFiles(backupPath);
await page.waitForFunction(() => rawSamples.length === 85);
check('restoring a backup rebuilds the full dataset', (await page.evaluate(() => rawSamples.length)) === 85);

console.log('\n7. Persistence across a reload');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => rawSamples.length === 85);
check('IndexedDB data survives a page reload', (await page.evaluate(() => rawSamples.length)) === 85);

console.log('\n8. Charts render for every aggregation and range');
await page.selectOption('#range', 'all');
for (const mode of ['daily', 'r7', 'r14', 'r30', 'weekly', 'monthly', 'quarterly', 'yearly']) {
  await page.selectOption('#aggregation', mode);
  const ok = await page.evaluate(() => ['weightChart', 'bodyFatChart', 'compositionChart']
    .every(id => document.getElementById(id).querySelector('path[d]:not([d=""])')));
  check(`charts draw a line for aggregation "${mode}"`, ok);
}
for (const range of ['30', '90', '183', '365', '1095', 'all']) {
  for (const mode of ['r7', 'monthly', 'quarterly', 'yearly']) {
    await page.selectOption('#range', range);
    await page.selectOption('#aggregation', mode);
    const n = await page.evaluate(() =>
      filterRange(aggregateSeries(dailyMetric('weight'), controls.aggregation.value)).length);
    check(`range "${range}" + "${mode}" keeps at least one period visible`, n >= 1, String(n));
  }
}
await page.selectOption('#range', 'all');
await page.selectOption('#aggregation', 'daily');

console.log('\n9. Composition axis modes');
// "Both on left" must mean ONE kg scale shared by both series. Tick labels are
// printed rounded to 0.1 kg, so the scale is recovered from the plotted path
// coordinates (exact to 0.01) and the labels are only used for bracketing.
const axes = await page.evaluate(() => {
  const chart = () => document.getElementById('compositionChart');
  const lines = document.getElementById('compositionLines');
  const axis = document.getElementById('axisMode');
  const set = (el, v) => { el.value = v; el.dispatchEvent(new Event('change')); };

  const points = (sel) => {
    const d = chart().querySelector(sel)?.getAttribute('d') || '';
    return [...d.matchAll(/[ML] ([\d.]+) ([\d.]+)/g)].map(m => ({ x: Number(m[1]), y: Number(m[2]) }));
  };
  const tickValues = (side) => [...chart().querySelectorAll('text.axis-text')]
    .filter(t => (side === 'left') === (t.getAttribute('text-anchor') === 'end'))
    .map(t => Number(t.textContent))
    .filter(Number.isFinite);
  const brackets = (side, vals) => {
    const t = tickValues(side);
    return Math.min(...t) <= Math.min(...vals) && Math.max(...t) >= Math.max(...vals);
  };
  // Affine map value -> y recovered from a series' own end points.
  const fitFrom = (pts, vals) => {
    const slope = (pts.at(-1).y - pts[0].y) / (vals.at(-1) - vals[0]);
    return { slope, intercept: pts[0].y - slope * vals[0] };
  };
  const maxErr = (pts, vals, f) => Math.max(...pts.map((p, i) => Math.abs(p.y - (f.intercept + f.slope * vals[i]))));

  const data = () => aggregateComposition(dailyComposition(), controls.aggregation.value)
    .filter(d => Number.isFinite(d.fat) && Number.isFinite(d.lean));

  const out = {};

  set(lines, 'both'); set(axis, 'split');
  let d = data(), fatV = d.map(x => x.fat), leanV = d.map(x => x.lean);
  out.splitFatPoints = points('.line-fat').length;
  out.splitLeanPoints = points('.line-lean').length;
  out.splitLeftTicks = chart().querySelectorAll('text.fat-axis').length;
  out.splitRightTicks = chart().querySelectorAll('text.lean-axis').length;
  out.splitLeftBracketsFat = brackets('left', fatV);
  out.splitRightBracketsLean = brackets('right', leanV);
  out.splitLeanUnderFatScale = maxErr(points('.line-lean'), leanV, fitFrom(points('.line-fat'), fatV));

  set(axis, 'shared');
  d = data(); fatV = d.map(x => x.fat); leanV = d.map(x => x.lean);
  const sharedFatFit = fitFrom(points('.line-fat'), fatV);
  out.sharedSideTicks = chart().querySelectorAll('text.fat-axis, text.lean-axis').length;
  out.sharedRightTickCount = tickValues('right').length;
  out.sharedLeftTickCount = tickValues('left').length;
  out.sharedLeftBracketsBoth = brackets('left', [...fatV, ...leanV]);
  out.sharedFatSelfErr = maxErr(points('.line-fat'), fatV, sharedFatFit);
  out.sharedLeanUnderFatScale = maxErr(points('.line-lean'), leanV, sharedFatFit);
  out.sharedGap = points('.line-fat')[0].y - points('.line-lean')[0].y;

  set(lines, 'fat');
  out.fatOnly = { fat: !!chart().querySelector('.line-fat'), lean: !!chart().querySelector('.line-lean'), axisDisabled: axis.disabled };
  set(lines, 'lean');
  out.leanOnly = { fat: !!chart().querySelector('.line-fat'), lean: !!chart().querySelector('.line-lean') };
  set(lines, 'both');
  out.bothAgain = { fat: !!chart().querySelector('.line-fat'), lean: !!chart().querySelector('.line-lean') };
  return out;
});
check('split mode draws both lines', axes.splitFatPoints > 1 && axes.splitLeanPoints > 1);
check('split mode prints one axis on each side', axes.splitLeftTicks >= 5 && axes.splitRightTicks >= 5,
  JSON.stringify({ left: axes.splitLeftTicks, right: axes.splitRightTicks }));
check('split mode: left axis covers the fat-mass range', axes.splitLeftBracketsFat);
check('split mode: right axis covers the lean-mass range', axes.splitRightBracketsLean);
check('split mode uses genuinely independent scales',
  axes.splitLeanUnderFatScale > 50, String(axes.splitLeanUnderFatScale));

check('shared mode prints exactly one (left) kg axis and no side-coloured ticks',
  axes.sharedSideTicks === 0 && axes.sharedRightTickCount === 0 && axes.sharedLeftTickCount >= 5,
  JSON.stringify({ sided: axes.sharedSideTicks, right: axes.sharedRightTickCount, left: axes.sharedLeftTickCount }));
check('shared mode: the one printed scale covers both series', axes.sharedLeftBracketsBoth);
check('shared mode: fat mass maps linearly onto it', axes.sharedFatSelfErr < 0.05, String(axes.sharedFatSelfErr));
check('shared mode: lean mass uses the EXACT same y mapping as fat',
  axes.sharedLeanUnderFatScale < 0.5, String(axes.sharedLeanUnderFatScale));
check('shared mode keeps the two lines far apart (one common kg scale)', axes.sharedGap > 40, String(axes.sharedGap));
check('fat-only mode hides the lean line', axes.fatOnly.fat && !axes.fatOnly.lean);
check('fat-only mode disables the axis selector', axes.fatOnly.axisDisabled);
check('lean-only mode hides the fat line', !axes.leanOnly.fat && axes.leanOnly.lean);
check('both mode restores the two lines', axes.bothAgain.fat && axes.bothAgain.lean);

console.log('\n9b. Change-over-time charts');
const deltas = await page.evaluate(() => {
  const out = {};
  const mk = (arr) => arr.map(([date, value]) => ({ date, value }));
  const d = deltaSeries(mk([['2001-01-01', 10], ['2001-01-02', 12], ['2001-01-03', 11.5], ['2001-01-04', 11.5]]));
  out.values = d.map(x => Number(x.value.toFixed(4)));
  out.dates = d.map(x => x.date);
  out.singlePoint = deltaSeries(mk([['2001-01-01', 10]])).length;
  out.empty = deltaSeries([]).length;
  // a gap in the source must not invent a delta
  out.comp = deltaComposition([{ date: 'a', fat: 10, lean: 60 }, { date: 'b', fat: 11, lean: 59 },
                               { date: 'c', fat: null, lean: 58 }])
             .map(x => [x.fat, x.lean]);
  // the change scale must always contain zero
  const s1 = deltaScale([2, 3, 4]), s2 = deltaScale([-4, -3]), s3 = deltaScale([]);
  out.scaleAllPositive = [s1.lo <= 0, s1.hi > 0];
  out.scaleAllNegative = [s2.lo < 0, s2.hi >= 0];
  out.scaleEmptyFinite = Number.isFinite(s3.lo) && Number.isFinite(s3.hi);
  // selective labelling
  out.labelsFew = labelIndexes([1, -2, 3], 3).length;
  out.labelsMany = labelIndexes(Array.from({ length: 100 }, (_, i) => i === 7 ? 9 : i === 40 ? -9 : 0), 100).sort();
  out.fmt = [fmtDelta(0.25, 'kg'), fmtDelta(-0.25, 'kg'), fmtDelta(0, 'kg'), fmtDelta(null, 'kg')];
  return out;
});
check('delta is the difference from the previous period',
  JSON.stringify(deltas.values) === JSON.stringify([2, -0.5, 0]), JSON.stringify(deltas.values));
check('each delta is dated to the later period', deltas.dates[0] === '2001-01-02');
check('a single period yields no change points', deltas.singlePoint === 0);
check('an empty series yields no change points', deltas.empty === 0);
check('composition deltas are computed per series', JSON.stringify(deltas.comp[0]) === JSON.stringify([1, -1]));
check('a gap produces a null, never a fabricated change', deltas.comp[1][0] === null && deltas.comp[1][1] === -1);
check('change scale includes zero when all values are positive', deltas.scaleAllPositive.every(Boolean));
check('change scale includes zero when all values are negative', deltas.scaleAllNegative.every(Boolean));
check('change scale is finite with no data', deltas.scaleEmptyFinite);
check('few bars are all labelled', deltas.labelsFew === 3);
check('many bars label only the largest rise and fall',
  JSON.stringify(deltas.labelsMany) === JSON.stringify([40, 7].sort()), JSON.stringify(deltas.labelsMany));
check('delta readout is signed', JSON.stringify(deltas.fmt) ===
  JSON.stringify(['+0.25 kg', '\u22120.25 kg', '0.00 kg', '—']), JSON.stringify(deltas.fmt));

// The rendered charts
await page.selectOption('#range', 'all');
for (const mode of ['daily', 'r7', 'r30', 'monthly', 'quarterly', 'yearly']) {
  await page.selectOption('#aggregation', mode);
  const r = await page.evaluate(() => ({
    periods: filterRange(aggregateSeries(dailyMetric('weight'), controls.aggregation.value)).length,
    bars: ['weightDeltaChart', 'bodyFatDeltaChart', 'compositionDeltaChart']
      .map(id => document.getElementById(id).querySelectorAll('path[class^="bar-"]').length),
    msg: document.getElementById('weightDeltaChart').textContent
  }));
  if (r.periods >= 2) {
    check(`change charts draw bars for "${mode}"`, r.bars.every(n => n > 0), JSON.stringify(r.bars));
  } else {
    // the fixture spans a single calendar year, so yearly has nothing to compare
    check(`"${mode}" with one period says so instead of drawing a bar`,
      r.bars.every(n => n === 0) && /Two periods/.test(r.msg), JSON.stringify(r));
  }
}
await page.selectOption('#aggregation', 'daily');

const bars = await page.evaluate(() => {
  const svg = document.getElementById('weightDeltaChart');
  const zero = svg.querySelector('.zero-line');
  const y0 = Number(zero.getAttribute('y1'));
  const rise = [...svg.querySelectorAll('.bar-rise')];
  const fall = [...svg.querySelectorAll('.bar-fall')];
  const startY = (el) => Number(/^M[\d.]+ ([\d.]+)/.exec(el.getAttribute('d'))[1]);
  const endY = (el) => {
    const ys = [...el.getAttribute('d').matchAll(/[ML][\d.]+ ([\d.]+)/g)].map(m => Number(m[1]));
    return Math.min(...ys.map(v => Math.abs(v - y0))) === 0 ? Math.max(...ys) : Math.min(...ys);
  };
  return {
    hasZeroLine: !!zero,
    riseCount: rise.length,
    fallCount: fall.length,
    everyBarStartsAtZero: [...rise, ...fall].every(el => Math.abs(startY(el) - y0) < 0.01),
    risesGoUp: rise.every(el => endY(el) <= y0 + 0.01),
    fallsGoDown: fall.every(el => endY(el) >= y0 - 0.01),
    distinctFill: getComputedStyle(rise[0]).fill !== getComputedStyle(fall[0]).fill,
    withinPlot: [...rise, ...fall].every(el => {
      const xs = [...el.getAttribute('d').matchAll(/[MLQ]([\d.]+) /g)].map(m => Number(m[1]));
      return Math.min(...xs) >= 54.9 && Math.max(...xs) <= 744.1;
    })
  };
});
check('change chart has a zero baseline', bars.hasZeroLine);
check('both rises and falls are present in the sample data', bars.riseCount > 0 && bars.fallCount > 0,
  `${bars.riseCount} up / ${bars.fallCount} down`);
check('every bar is anchored to the zero baseline', bars.everyBarStartsAtZero);
check('increases are drawn above the baseline', bars.risesGoUp);
check('decreases are drawn below the baseline', bars.fallsGoDown);
check('increase and decrease use different colours', bars.distinctFill);
check('no bar escapes the plot area', bars.withinPlot);

const compDelta = await page.evaluate(() => {
  const svg = () => document.getElementById('compositionDeltaChart');
  const lines = document.getElementById('compositionLines');
  const set = (v) => { lines.value = v; lines.dispatchEvent(new Event('change')); };
  const out = {};
  set('both');
  out.both = [svg().querySelectorAll('.bar-fat').length, svg().querySelectorAll('.bar-lean').length];
  out.legendBoth = document.getElementById('compositionDeltaLegend').textContent;
  // one shared kg scale: a single zero line, no second axis
  out.zeroLines = svg().querySelectorAll('.zero-line').length;
  out.sideAxes = svg().querySelectorAll('.fat-axis, .lean-axis').length;
  set('fat');
  out.fatOnly = [svg().querySelectorAll('.bar-fat').length, svg().querySelectorAll('.bar-lean').length];
  set('lean');
  out.leanOnly = [svg().querySelectorAll('.bar-fat').length, svg().querySelectorAll('.bar-lean').length];
  set('both');
  return out;
});
check('composition change draws both series', compDelta.both[0] > 0 && compDelta.both[1] > 0);
check('composition change follows the lines-shown control',
  compDelta.fatOnly[1] === 0 && compDelta.leanOnly[0] === 0, JSON.stringify(compDelta));
check('composition change carries a legend for its two series',
  /Fat mass/.test(compDelta.legendBoth) && /Lean mass/.test(compDelta.legendBoth));
check('composition change uses one shared scale, not two axes',
  compDelta.zeroLines === 1 && compDelta.sideAxes === 0, JSON.stringify(compDelta));

// touch scrubbing on a change chart
const deltaPoint = await (async () => {
  const el = page.locator('#weightDeltaChart');
  await el.scrollIntoViewIfNeeded();
  const box = await el.boundingBox();
  return { x: box.x + box.width * 0.35, y: box.y + box.height * 0.5 };
})();
const beforeDeltaDate = await page.locator('#weightDeltaDate').textContent();
await page.touchscreen.tap(deltaPoint.x, deltaPoint.y);
await page.waitForTimeout(150);
const afterDelta = (await page.locator('#weightDeltaValue').textContent()).trim();
const afterDeltaDate = await page.locator('#weightDeltaDate').textContent();
const deltaIndex = await page.evaluate(() =>
  Number(document.querySelector('#weightDeltaChart #hit').dataset.i));
const deltaLen = await page.evaluate(() =>
  filterRange(deltaSeries(aggregateSeries(dailyMetric('weight'), controls.aggregation.value))).length);
// the fixture steps weight by exactly +0.1 a day, so every delta reads the same:
// track the selected period instead of the number.
check('change chart responds to touch', afterDeltaDate !== beforeDeltaDate,
  `${beforeDeltaDate} -> ${afterDeltaDate}`);
check('tap selects a period near 35 % across',
  Math.abs(deltaIndex - Math.round(0.35 * (deltaLen - 1))) <= 1, `index ${deltaIndex} of ${deltaLen}`);
check('change readout is signed and carries a unit', /^[+\u2212]?\d+\.\d+ (kg|pp)$/.test(afterDelta), afterDelta);
check('change chart date readout is populated',
  /\d{4}/.test(await page.locator('#weightDeltaDate').textContent()));

check('empty state covers the change charts too', await page.evaluate(() => {
  const saved = rawSamples;
  rawSamples = [];
  render();
  const msg = document.getElementById('weightDeltaChart').textContent;
  rawSamples = saved;
  render();
  return /Two periods/.test(msg);
}));

console.log('\n10. Data value labels');
await page.selectOption('#labels', 'off');
check('labels hidden by default', (await page.locator('#weightChart .data-label').count()) === 0);
await page.selectOption('#labels', 'on');
check('labels shown when enabled', (await page.locator('#weightChart .data-label').count()) > 0);
const deltaLabels = await page.locator('#weightDeltaChart .data-label').count();
check('change chart labels only the extremes when bars are dense', deltaLabels > 0 && deltaLabels <= 2,
  String(deltaLabels));
check('change labels are signed',
  /^[+\u2212]/.test((await page.locator('#weightDeltaChart .data-label').first().textContent()).trim()));
await page.selectOption('#labels', 'off');
check('change chart labels hidden again', (await page.locator('#weightDeltaChart .data-label').count()) === 0);

console.log('\n11. Touch inspection on a mobile-width viewport');
await page.selectOption('#aggregation', 'daily');
await page.selectOption('#range', 'all');

// Translate a viewBox x into a page coordinate inside the chart's hit area.
async function chartPoint(chartId, viewBoxFraction) {
  const el = page.locator('#' + chartId);
  await el.scrollIntoViewIfNeeded();
  const box = await el.boundingBox();
  const geom = await page.evaluate((id) => {
    const svg = document.getElementById(id);
    const hit = svg.querySelector('#hit');
    const vb = svg.viewBox.baseVal;
    return { vbW: vb.width, vbH: vb.height, x: +hit.getAttribute('x'), w: +hit.getAttribute('width'),
             y: +hit.getAttribute('y'), h: +hit.getAttribute('height') };
  }, chartId);
  const vbX = geom.x + geom.w * viewBoxFraction;
  const vbY = geom.y + geom.h * 0.5;
  return { x: box.x + (vbX / geom.vbW) * box.width, y: box.y + (vbY / geom.vbH) * box.height, box };
}

const seriesLen = await page.evaluate(() =>
  filterRange(aggregateSeries(dailyMetric('weight'), controls.aggregation.value)).length);
check('weight series has enough points to scrub', seriesLen > 5, String(seriesLen));

const start20 = await chartPoint('weightChart', 0.2);
const last = await page.locator('#weightValue').textContent();   // pick() leaves the cursor on the newest point
await page.touchscreen.tap(start20.x, start20.y);
await page.waitForTimeout(150);
const tapValue = (await page.locator('#weightValue').textContent()).trim();
const tapDate = (await page.locator('#weightDate').textContent()).trim();
const tapIndex = await page.evaluate(() => Number(document.querySelector('#weightChart #hit').dataset.i));
check('tap reaches the chart hit area', Number.isFinite(tapIndex), String(tapIndex));
check('tap selects a point near 20 % across', Math.abs(tapIndex - Math.round(0.2 * (seriesLen - 1))) <= 1,
  `index ${tapIndex} of ${seriesLen}`);
check('tap moves the readout off the latest value', tapValue !== last.trim(), `${last} -> ${tapValue}`);
check('readout shows the matching date', /\d{4}/.test(tapDate), tapDate);
check('readout shows a kg value', /kg$/.test(tapValue), tapValue);

// Drag across the plot: the readout must track the finger.
const dragEnd = await chartPoint('weightChart', 0.85);
await page.mouse.move(start20.x, start20.y);
await page.mouse.down();
await page.mouse.move(dragEnd.x, dragEnd.y, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(150);
const dragIndex = await page.evaluate(() => Number(document.querySelector('#weightChart #hit').dataset.i));
check('dragging tracks across the chart', dragIndex > tapIndex + 2, `${tapIndex} -> ${dragIndex}`);
check('dragged readout still well formed', /kg$/.test((await page.locator('#weightValue').textContent()).trim()));

const fatPoint = await chartPoint('bodyFatChart', 0.3);
await page.touchscreen.tap(fatPoint.x, fatPoint.y);
await page.waitForTimeout(150);
check('body-fat chart readout responds to touch',
  /%$/.test((await page.locator('#bodyFatValue').textContent()).trim()),
  await page.locator('#bodyFatValue').textContent());

const compPoint = await chartPoint('compositionChart', 0.4);
await page.touchscreen.tap(compPoint.x, compPoint.y);
await page.waitForTimeout(150);
check('composition readout reports both masses',
  /Fat .* kg · Lean .* kg/.test(await page.locator('#compositionValue').textContent()),
  await page.locator('#compositionValue').textContent());
check('svg allows vertical page scrolling (touch-action: pan-y)',
  (await page.evaluate(() => getComputedStyle(document.getElementById('weightChart')).touchAction)) === 'pan-y');
check('no hover-only interaction: pointerdown alone updates the readout', tapValue !== last.trim());

console.log('\n12. Mobile layout sanity');
const layout = await page.evaluate(() => ({
  docWidth: document.documentElement.scrollWidth,
  viewport: window.innerWidth,
  chartCount: document.querySelectorAll('.chart-wrap svg').length,
  chartsWithinViewport: [...document.querySelectorAll('.chart-wrap svg')]
    .every(s => s.getBoundingClientRect().width <= window.innerWidth + 1),
  stacked: (() => {
    const cards = [...document.querySelectorAll('.chart-card')].map(c => c.getBoundingClientRect());
    return cards.every((r, i) => i === 0 || r.top >= cards[i - 1].bottom - 1);
  })(),
  smallestTapTarget: Math.min(...[...document.querySelectorAll('button, select')]
    .filter(el => el.offsetParent !== null)          // skip controls in collapsed/hidden sections
    .map(el => el.getBoundingClientRect().height)),
  hiddenControlsAreOptional: [...document.querySelectorAll('button, select')]
    .filter(el => el.offsetParent === null).map(el => el.id),
  bodyFont: parseFloat(getComputedStyle(document.body).fontSize),
  selectFont: parseFloat(getComputedStyle(document.querySelector('select')).fontSize)
}));
check('no horizontal overflow at 390px', layout.docWidth <= layout.viewport + 1,
  `${layout.docWidth} > ${layout.viewport}`);
check('charts fit the viewport width', layout.chartsWithinViewport);
check('six charts are present (three metrics + three change charts)', layout.chartCount === 6,
  String(layout.chartCount));
check('chart cards remain vertically stacked', layout.stacked);
check('tap targets are at least 44px tall', layout.smallestTapTarget >= 44, String(layout.smallestTapTarget));
check('body text is at least 15px', layout.bodyFont >= 15, String(layout.bodyFont));
check('only the collapsed/empty-state controls are hidden',
  layout.hiddenControlsAreOptional.every(id => ['emptyImportBtn', 'importBtn', 'exportBtn', 'clearBtn'].includes(id)),
  layout.hiddenControlsAreOptional.join(','));
check('selects use >=16px (no iOS zoom-on-focus)', layout.selectFont >= 16, String(layout.selectFont));

console.log('\n13. No network egress of health data');
const external = [];
page.on('request', (r) => { if (!r.url().startsWith(origin) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) external.push(r.url()); });
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(300);
check('page makes no third-party requests', external.length === 0, external.join(' | '));
check('no page errors after the full run', consoleErrors.length === 0, consoleErrors.join(' | '));

// ==========================================================================
await browser.close();
server.close();
fs.rmSync(tmp, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { failures.forEach(f => console.log(' - ' + f)); process.exit(1); }
