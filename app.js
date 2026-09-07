'use strict';

const DB_NAME = 'body-dashboard-local-v1';
const STORE = 'samples';
const DB_VERSION = 1;
const SHORTCUT_NAME = 'Sync Body Dashboard';
const SOURCE_PRIORITY = ['Fitdays', 'Zepp Life', 'Santé', 'Apple Health'];

const $ = (id) => document.getElementById(id);
const controls = {
  aggregation: $('aggregation'), range: $('range'), labels: $('labels'),
  compositionLines: $('compositionLines'), axisMode: $('axisMode')
};
let rawSamples = [];

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp');
        store.createIndex('type', 'type');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const TYPE_ALIASES = {
  weight: 'weight', bodymass: 'weight', bodyweight: 'weight', w: 'weight',
  hkquantitytypeidentifierbodymass: 'weight',
  bodyfat: 'bodyFat', bodyfatpercentage: 'bodyFat', fat: 'bodyFat', b: 'bodyFat',
  hkquantitytypeidentifierbodyfatpercentage: 'bodyFat'
};

function canonicalType(v) {
  return TYPE_ALIASES[String(v ?? '').trim().toLowerCase()] || null;
}

// Accepts "2026-01-02T08:00:00-03:00", "2026-01-02T08:00:00Z",
// "2026-01-02 08:00:00" and bare "2026-01-02".
function normalizeTimestamp(v) {
  let s = String(v ?? '').trim().replace(' ', 'T');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += 'T12:00:00';
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return null;
  return s;
}

// Stable key: one measurement instant, per metric, per source.
// Deliberately independent of the timestamp's written form (offset vs. Z,
// with or without milliseconds) and of the value, so that a repeated
// Shortcut sync updates the existing record instead of adding a new one.
function stableId(r) {
  return [r.type, new Date(r.instant).toISOString(), r.source || 'Apple Health'].join('|');
}

// Tolerates "70.5", "70,5", "18,5%", "1,234.5" and "1.234,5".
// When both separators are present the one written last is the decimal point.
function parseNumber(v) {
  if (typeof v === 'number') return v;
  let s = String(v ?? '').trim().replace(/\s/g,'').replace('%','');
  const comma = s.lastIndexOf(','), dot = s.lastIndexOf('.');
  if (comma > -1 && dot > -1) s = comma > dot ? s.replace(/\./g,'').replace(',','.') : s.replace(/,/g,'');
  else if (comma > -1) s = s.replace(/,/g,'.');
  s = s.replace(/[^0-9.+-]/g,'');
  return Number(s);
}

function normalizeRecord(r) {
  if (!r) return null;
  const type = canonicalType(r.type);
  if (!type) return null;
  let value = parseNumber(r.value ?? r.quantity);
  if (!Number.isFinite(value)) return null;
  // Body fat expressed as a fraction (0.185) becomes percentage points (18.5).
  if (type === 'bodyFat' && value > 0 && value <= 1) value *= 100;
  const timestamp = normalizeTimestamp(r.timestamp ?? r.date ?? r.startDate);
  if (!timestamp) return null;
  const instant = Date.parse(timestamp);
  if (!Number.isFinite(instant)) return null;
  if (type === 'weight' && (value < 20 || value > 400)) return null;
  if (type === 'bodyFat' && (value <= 0 || value > 80)) return null;
  const out = {
    type, timestamp, instant,
    localDate: timestamp.slice(0,10),
    value,
    source: String(r.source || 'Apple Health').slice(0,80)
  };
  out.id = stableId(out);
  return out;
}

async function saveRecords(records) {
  const valid = records.map(normalizeRecord).filter(Boolean);
  if (!valid.length) return 0;
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    valid.forEach(r => store.put(r));
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  try { if (navigator.storage?.persist) await navigator.storage.persist(); } catch (_) {}
  return valid.length;
}

async function loadRecords() {
  const db = await openDB();
  const data = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  for (const r of data) {
    if (!Number.isFinite(r.instant)) r.instant = Date.parse(r.timestamp) || 0;
    if (!r.localDate) r.localDate = String(r.timestamp).slice(0,10);
  }
  return data.sort((a,b) => a.instant - b.instant);
}

async function clearRecords() {
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

function safeDecode(s) {
  try { return decodeURIComponent(s); } catch (_) {}
  try { return decodeURIComponent(s.replace(/%(?![0-9A-Fa-f]{2})/g, '%25')); } catch (_) {}
  return s; // already decoded by the browser, or not encoded at all
}

function parseSyncFragment(hash = location.hash) {
  const m = /^#sync=/i.exec(hash || '');
  if (!m) return [];
  const text = safeDecode(hash.slice(m[0].length));
  const records = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parts = line.split('|');
    if (parts.length < 3) continue;
    const [kind,timestamp,value,...sourceParts] = parts;
    const type = canonicalType(kind.trim());
    if (!type) continue;
    records.push({type,timestamp:timestamp.trim(),value,source:sourceParts.join('|').trim() || 'Apple Health'});
  }
  return records;
}

function stripFragment() {
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
}

function localDate(record) { return record.localDate || String(record.timestamp).slice(0,10); }
function sourceRank(name) { const i = SOURCE_PRIORITY.indexOf(name); return i < 0 ? 999 : i; }
function mean(values) { return values.reduce((a,b)=>a+b,0)/values.length; }
function median(values) {
  const a=[...values].sort((x,y)=>x-y), m=Math.floor(a.length/2);
  return a.length%2?a[m]:(a[m-1]+a[m])/2;
}

function dailyMetric(type) {
  const byDate = new Map();
  for (const r of rawSamples) {
    if (r.type !== type) continue;
    const date = localDate(r);
    if (!byDate.has(date)) byDate.set(date, new Map());
    const bySource = byDate.get(date);
    if (!bySource.has(r.source)) bySource.set(r.source, []);
    bySource.get(r.source).push(r.value);
  }
  const out=[];
  for (const [date, bySource] of byDate) {
    const sources=[...bySource.keys()].sort((a,b)=>sourceRank(a)-sourceRank(b));
    const chosen=sources[0];
    out.push({date,value:median(bySource.get(chosen)),source:chosen,count:bySource.get(chosen).length});
  }
  return out.sort((a,b)=>a.date.localeCompare(b.date));
}

function dailyComposition() {
  const w = new Map(dailyMetric('weight').map(x=>[x.date,x]));
  const b = new Map(dailyMetric('bodyFat').map(x=>[x.date,x]));
  return [...w.keys()].filter(d=>b.has(d)).sort().map(date=>{
    const weight=w.get(date).value, bodyFat=b.get(date).value;
    const fat=weight*bodyFat/100;
    return {date,fat,lean:weight-fat};
  });
}

function dateUTC(s){ return new Date(s+'T00:00:00Z'); }
function dateKey(d, mode) {
  const x=new Date(d), y=x.getUTCFullYear(), m=x.getUTCMonth();
  if(mode==='yearly') return `${y}-01-01`;
  if(mode==='quarterly') return `${y}-${String(Math.floor(m/3)*3+1).padStart(2,'0')}-01`;
  if(mode==='monthly') return `${y}-${String(m+1).padStart(2,'0')}-01`;
  x.setUTCDate(x.getUTCDate()-((x.getUTCDay()+6)%7));
  return x.toISOString().slice(0,10);
}

function aggregateSeries(series, mode) {
  if (!series.length) return [];
  if (mode === 'daily') return series.map(x=>({...x}));
  if (/^r(7|14|30)$/.test(mode)) {
    const days=Number(mode.slice(1)), out=[];
    let queue=[], sum=0;
    for(const p of series){
      const t=dateUTC(p.date).getTime(); queue.push({t,v:p.value}); sum+=p.value;
      const min=t-(days-1)*86400000;
      while(queue.length && queue[0].t<min) sum-=queue.shift().v;
      out.push({date:p.date,value:sum/queue.length,count:queue.length});
    }
    return out;
  }
  const g=new Map();
  for(const p of series){ const k=dateKey(dateUTC(p.date),mode); if(!g.has(k))g.set(k,[]); g.get(k).push(p.value); }
  return [...g.entries()].map(([date,vals])=>({date,value:mean(vals),count:vals.length})).sort((a,b)=>a.date.localeCompare(b.date));
}

function aggregateComposition(series, mode) {
  const fat=aggregateSeries(series.map(x=>({date:x.date,value:x.fat})),mode);
  const lean=aggregateSeries(series.map(x=>({date:x.date,value:x.lean})),mode);
  const fm=new Map(fat.map(x=>[x.date,x.value])), lm=new Map(lean.map(x=>[x.date,x.value]));
  return [...new Set([...fm.keys(),...lm.keys()])].sort().map(date=>({date,fat:fm.get(date)??null,lean:lm.get(date)??null}));
}

function latestDate() {
  return rawSamples.length ? localDate(rawSamples[rawSamples.length-1]) : null;
}

// Last calendar day covered by a bucket that starts on `date`.
function periodEnd(date, mode) {
  const d = dateUTC(date);
  if (mode === 'weekly') { d.setUTCDate(d.getUTCDate()+6); return d; }
  if (mode === 'monthly') { d.setUTCMonth(d.getUTCMonth()+1); d.setUTCDate(0); return d; }
  if (mode === 'quarterly') { d.setUTCMonth(d.getUTCMonth()+3); d.setUTCDate(0); return d; }
  if (mode === 'yearly') return new Date(Date.UTC(d.getUTCFullYear(), 11, 31));
  return d;
}

// A bucket is shown when its period overlaps the selected window, so that
// e.g. "Yearly + 6 months" still shows the current year instead of nothing.
function filterRange(series) {
  if (!series.length || controls.range.value==='all') return series;
  const end=latestDate(); if(!end) return series;
  const start=dateUTC(end); start.setUTCDate(start.getUTCDate()-Number(controls.range.value)+1);
  const mode=controls.aggregation.value;
  return series.filter(x=>periodEnd(x.date,mode)>=start);
}

const fmtDay = new Intl.DateTimeFormat(undefined,{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'});
const fmtMonth = new Intl.DateTimeFormat(undefined,{month:'short',year:'2-digit',timeZone:'UTC'});
const fmtLongMonth = new Intl.DateTimeFormat(undefined,{month:'long',year:'numeric',timeZone:'UTC'});
function formatPeriod(date, mode) {
  const d=dateUTC(date);
  if(mode==='daily'||mode.startsWith('r')) return fmtDay.format(d);
  if(mode==='monthly') return fmtLongMonth.format(d);
  if(mode==='quarterly') return `Q${Math.floor(d.getUTCMonth()/3)+1} ${d.getUTCFullYear()}`;
  if(mode==='yearly') return String(d.getUTCFullYear());
  const e=new Date(d); e.setUTCDate(e.getUTCDate()+6); return `${fmtDay.format(d)} – ${fmtDay.format(e)}`;
}
function aggName(mode){return({daily:'Daily',r7:'7-day rolling average',r14:'14-day rolling average',r30:'30-day rolling average',weekly:'Weekly average',monthly:'Monthly average',quarterly:'Quarterly average',yearly:'Yearly average'})[mode]||mode;}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}

function niceScale(values, includeZero=false){
  if(!values.length) return {lo:0,hi:1};
  let lo=Math.min(...values), hi=Math.max(...values);
  if(includeZero) lo=0;
  const span=Math.max(hi-lo,1), pad=includeZero?span*.06:span*.12;
  lo=includeZero?0:lo-pad; hi+=pad;
  return {lo,hi};
}

function pathFor(points, x, y, key='value'){
  let d='',open=false;
  points.forEach((p,i)=>{const v=p[key];if(v==null||!Number.isFinite(v)){open=false;return;}d+=(open?'L':'M')+` ${x(i).toFixed(2)} ${y(v).toFixed(2)} `;open=true;});
  return d;
}

function emptySVG(svg, message='No measurements in this period'){
  svg.innerHTML=`<text class="empty-chart" x="380" y="150" text-anchor="middle">${esc(message)}</text>`;
}

function drawSingle({svgId,subId,dateId,valueId,series,unit}){
  const svg=$(svgId), mode=controls.aggregation.value, s=filterRange(aggregateSeries(series,mode));
  if(!s.length){emptySVG(svg);$(subId).textContent='—';$(dateId).textContent='—';$(valueId).textContent='—';return;}
  $(subId).textContent=`${aggName(mode)} · ${formatPeriod(s[0].date,mode)} → ${formatPeriod(s.at(-1).date,mode)}`;
  const W=760,H=300,L=55,R=16,T=18,B=43,PW=W-L-R,PH=H-T-B;
  const scale=niceScale(s.map(p=>p.value));
  const X=i=>L+(s.length===1?PW/2:i*PW/(s.length-1)), Y=v=>T+(scale.hi-v)*PH/(scale.hi-scale.lo);
  let h='';
  for(let i=0;i<5;i++){const y=T+i*PH/4,v=scale.hi-i*(scale.hi-scale.lo)/4;h+=`<line class="grid" x1="${L}" y1="${y}" x2="${W-R}" y2="${y}"/><text class="axis-text" x="${L-8}" y="${y+4}" text-anchor="end">${v.toFixed(1)}</text>`;}
  const ticks=Math.min(5,s.length); for(let j=0;j<ticks;j++){const i=Math.round(j*(s.length-1)/Math.max(1,ticks-1)),d=dateUTC(s[i].date);h+=`<text class="axis-text" x="${X(i)}" y="${H-13}" text-anchor="middle">${mode==='yearly'?d.getUTCFullYear():fmtMonth.format(d)}</text>`;}
  h+=`<path class="line-primary" d="${pathFor(s,X,Y)}"/>`;
  if(controls.labels.value==='on') s.forEach((p,i)=>{h+=`<text class="data-label" x="${X(i)}" y="${Y(p.value)-7}" text-anchor="middle">${p.value.toFixed(1)}</text>`;});
  h+=`<g id="cursor"><line class="cursor-line" x1="0" y1="${T}" x2="0" y2="${H-B}"/><circle class="cursor-primary" cx="0" cy="0" r="5"/></g><rect id="hit" x="${L}" y="${T}" width="${PW}" height="${PH}" fill="transparent" tabindex="0"/>`;
  svg.innerHTML=h; const c=svg.querySelector('#cursor'),hit=svg.querySelector('#hit');
  function pick(i){i=Math.max(0,Math.min(s.length-1,i));const p=s[i],x=X(i),y=Y(p.value);c.querySelector('line').setAttribute('x1',x);c.querySelector('line').setAttribute('x2',x);c.querySelector('circle').setAttribute('cx',x);c.querySelector('circle').setAttribute('cy',y);$(dateId).textContent=formatPeriod(p.date,mode);$(valueId).textContent=`${p.value.toFixed(1)} ${unit}`;hit.dataset.i=i;}
  function move(e){const b=svg.getBoundingClientRect(),x=(e.clientX-b.left)*W/b.width;pick(Math.round((x-L)/PW*(s.length-1)));}
  hit.addEventListener('pointermove',move);hit.addEventListener('pointerdown',move);hit.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();pick(Number(hit.dataset.i||s.length-1)+(e.key==='ArrowRight'?1:-1));});pick(s.length-1);
}

function drawComposition(){
  const svg=$('compositionChart'), mode=controls.aggregation.value, s=filterRange(aggregateComposition(dailyComposition(),mode)), lines=controls.compositionLines.value, axis=controls.axisMode.value;
  controls.axisMode.disabled=lines!=='both';
  $('compositionLegend').innerHTML=lines==='fat'?'<span class="fat-key">● Fat mass</span>':lines==='lean'?'<span class="lean-key">● Lean mass</span>':'<span class="fat-key">● Fat mass</span><span class="lean-key">● Lean mass</span>';
  if(!s.length){emptySVG(svg);$('compositionSub').textContent='—';$('compositionDate').textContent='—';$('compositionValue').textContent='—';return;}
  $('compositionSub').textContent=`${aggName(mode)} · ${formatPeriod(s[0].date,mode)} → ${formatPeriod(s.at(-1).date,mode)}`;
  const split=lines==='both'&&axis==='split', shared=lines==='both'&&axis==='shared';
  const W=760,H=320,L=55,R=split?55:16,T=18,B=43,PW=W-L-R,PH=H-T-B, X=i=>L+(s.length===1?PW/2:i*PW/(s.length-1));
  const fatVals=s.map(x=>x.fat).filter(Number.isFinite), leanVals=s.map(x=>x.lean).filter(Number.isFinite);
  const sf=niceScale(fatVals), sl=niceScale(leanVals), sc=shared?niceScale([...fatVals,...leanVals]):null;
  const active=lines==='fat'?sf:sl;
  const YF=v=>T+((shared?sc:sf).hi-v)*PH/((shared?sc:sf).hi-(shared?sc:sf).lo);
  const YL=v=>T+((shared?sc:sl).hi-v)*PH/((shared?sc:sl).hi-(shared?sc:sl).lo);
  let h='';
  for(let i=0;i<5;i++){
    const y=T+i*PH/4; h+=`<line class="grid" x1="${L}" y1="${y}" x2="${W-R}" y2="${y}"/>`;
    if(split){const vf=sf.hi-i*(sf.hi-sf.lo)/4,vl=sl.hi-i*(sl.hi-sl.lo)/4;h+=`<text class="axis-text fat-axis" x="${L-8}" y="${y+4}" text-anchor="end">${vf.toFixed(1)}</text><text class="axis-text lean-axis" x="${W-R+8}" y="${y+4}">${vl.toFixed(1)}</text>`;}
    else {const q=shared?sc:active,v=q.hi-i*(q.hi-q.lo)/4;h+=`<text class="axis-text" x="${L-8}" y="${y+4}" text-anchor="end">${v.toFixed(1)}</text>`;}
  }
  if(split) h+=`<text class="axis-text fat-axis" x="${L-8}" y="${T-5}" text-anchor="end">Fat kg</text><text class="axis-text lean-axis" x="${W-R+8}" y="${T-5}">Lean kg</text>`;
  else h+=`<text class="axis-text" x="${L-8}" y="${T-5}" text-anchor="end">kg</text>`;
  const ticks=Math.min(5,s.length); for(let j=0;j<ticks;j++){const i=Math.round(j*(s.length-1)/Math.max(1,ticks-1)),d=dateUTC(s[i].date);h+=`<text class="axis-text" x="${X(i)}" y="${H-13}" text-anchor="middle">${mode==='yearly'?d.getUTCFullYear():fmtMonth.format(d)}</text>`;}
  if(lines!=='lean') h+=`<path class="line-fat" d="${pathFor(s,X,YF,'fat')}"/>`;
  if(lines!=='fat') h+=`<path class="line-lean" d="${pathFor(s,X,YL,'lean')}"/>`;
  if(controls.labels.value==='on') s.forEach((p,i)=>{if(lines!=='lean'&&p.fat!=null)h+=`<text class="data-label" x="${X(i)}" y="${YF(p.fat)-7}" text-anchor="middle">${p.fat.toFixed(1)}</text>`;if(lines!=='fat'&&p.lean!=null)h+=`<text class="data-label" x="${X(i)}" y="${YL(p.lean)+15}" text-anchor="middle">${p.lean.toFixed(1)}</text>`;});
  h+=`<g id="cursor"><line class="cursor-line" x1="0" y1="${T}" x2="0" y2="${H-B}"/><circle class="cursor-fat" cx="0" cy="0" r="5"/><circle class="cursor-lean" cx="0" cy="0" r="5"/></g><rect id="hit" x="${L}" y="${T}" width="${PW}" height="${PH}" fill="transparent" tabindex="0"/>`;
  svg.innerHTML=h; const c=svg.querySelector('#cursor'), hit=svg.querySelector('#hit');
  function pick(i){i=Math.max(0,Math.min(s.length-1,i));const p=s[i],x=X(i),cf=c.querySelector('.cursor-fat'),cl=c.querySelector('.cursor-lean');c.querySelector('line').setAttribute('x1',x);c.querySelector('line').setAttribute('x2',x);if(lines!=='lean'&&p.fat!=null){cf.style.display='';cf.setAttribute('cx',x);cf.setAttribute('cy',YF(p.fat));}else cf.style.display='none';if(lines!=='fat'&&p.lean!=null){cl.style.display='';cl.setAttribute('cx',x);cl.setAttribute('cy',YL(p.lean));}else cl.style.display='none';$('compositionDate').textContent=formatPeriod(p.date,mode);const q=[];if(lines!=='lean'&&p.fat!=null)q.push(`Fat ${p.fat.toFixed(1)} kg`);if(lines!=='fat'&&p.lean!=null)q.push(`Lean ${p.lean.toFixed(1)} kg`);$('compositionValue').textContent=q.join(' · ');hit.dataset.i=i;}
  function move(e){const b=svg.getBoundingClientRect(),x=(e.clientX-b.left)*W/b.width;pick(Math.round((x-L)/PW*(s.length-1)));}
  hit.addEventListener('pointermove',move);hit.addEventListener('pointerdown',move);hit.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();pick(Number(hit.dataset.i||s.length-1)+(e.key==='ArrowRight'?1:-1));});pick(s.length-1);
}

function renderStatus(){
  const n=rawSamples.length, last=latestDate();
  $('emptyState').classList.toggle('hidden',n>0);
  $('statusLine').textContent=n?`${n.toLocaleString()} local samples · latest ${fmtDay.format(dateUTC(last))}`:'No local measurements';
  const sources=[...new Set(rawSamples.map(x=>x.source))];
  $('sourceNote').textContent=sources.length?`Sources present: ${sources.join(', ')}. For overlapping days, the dashboard prefers Fitdays, then Zepp Life, then Santé.`:'';
}
function render(){renderStatus();drawSingle({svgId:'weightChart',subId:'weightSub',dateId:'weightDate',valueId:'weightValue',series:dailyMetric('weight'),unit:'kg'});drawSingle({svgId:'bodyFatChart',subId:'bodyFatSub',dateId:'bodyFatDate',valueId:'bodyFatValue',series:dailyMetric('bodyFat'),unit:'%'});drawComposition();}

async function refresh(){rawSamples=await loadRecords();render();}
async function importJSON(file){
  const text=await file.text(); const payload=JSON.parse(text); const records=Array.isArray(payload)?payload:(payload?.records||payload?.samples||payload?.data);
  if(!Array.isArray(records)) throw new Error('This JSON does not contain a records array.');
  const n=await saveRecords(records);localStorage.setItem('body-dashboard-last-sync',new Date().toISOString());await refresh();return n;
}
function exportBackup(){
  const payload={format:'body-dashboard-health-samples-v1',exportedAt:new Date().toISOString(),records:rawSamples.map(({id,instant,localDate,...r})=>r)};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`body-dashboard-backup-${new Date().toISOString().slice(0,10)}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function loadPrefs(){for(const [k,el] of Object.entries(controls)){const v=localStorage.getItem('pref-'+k);if(v&&[...el.options].some(o=>o.value===v))el.value=v;}}
function savePref(k,el){localStorage.setItem('pref-'+k,el.value);}

// iOS browsers reuse an already-open tab when the Shortcut opens the same URL
// with a new #sync= fragment: that is a same-document navigation, so the page
// is NOT reloaded and only `hashchange` fires. Sync import therefore has to
// work both at boot and on hashchange.
async function importFromFragment(){
  const sync=parseSyncFragment();
  if(!sync.length) return 0;
  const n=await saveRecords(sync);
  localStorage.setItem('body-dashboard-last-sync',new Date().toISOString());
  stripFragment();
  return n;
}

async function boot(){
  loadPrefs();
  await importFromFragment();
  await refresh();
  window.addEventListener('hashchange',()=>{importFromFragment().then(n=>{if(n)return refresh();}).catch(e=>{$('statusLine').textContent=`Sync failed: ${e.message}`;});});
  for(const [k,el] of Object.entries(controls)) el.addEventListener('change',()=>{savePref(k,el);render();});
  $('syncBtn').addEventListener('click',()=>{location.href=`shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}`;});
  const file=$('importFile'); $('importBtn').addEventListener('click',()=>file.click()); $('emptyImportBtn').addEventListener('click',()=>file.click());
  file.addEventListener('change',async()=>{if(!file.files?.[0])return;try{const n=await importJSON(file.files[0]);alert(`Imported/updated ${n} samples.`);}catch(e){alert(`Import failed: ${e.message}`);}finally{file.value='';}});
  $('exportBtn').addEventListener('click',exportBackup);
  $('clearBtn').addEventListener('click',async()=>{if(!confirm('Clear the dashboard’s local copy? Apple Health is not affected.'))return;if(!confirm('Confirm again: delete all locally stored dashboard measurements?'))return;await clearRecords();await refresh();});
  if('serviceWorker' in navigator){try{await navigator.serviceWorker.register('./sw.js');}catch(_){} }
}
boot().catch(e=>{$('statusLine').textContent=`Could not open local data: ${e.message}`;});
