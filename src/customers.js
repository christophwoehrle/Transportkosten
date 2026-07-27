/* ══════════════════════════════════════════════════════════════════════════
   KUNDEN-STECKNADELN

   Zeigt für jeden Kunden aus der Frachtenauswertung eine Stecknadel an der PLZ
   (verortet über den Zentroid der Verwaltungseinheit). Sichtbar erst ab der
   Länderansicht — in der Europaübersicht sind die Nadeln ausgeblendet.
   Ein Klick öffnet ein Panel mit den Zahlen der letzten Fahrt und den KPIs.
   ══════════════════════════════════════════════════════════════════════════ */

// FRACHT_DATA wird im Build als globales Objekt eingebettet (Kunden, Fahrten, Speditionen).
// CUSTOMERS/TRIPS sind mit let deklariert, damit ein Frachten/Logistik-Upload sie
// zur Laufzeit ersetzen kann (die Karte liest die Ø-Frachtpreise daraus).
let CUSTOMERS = (typeof FRACHT_DATA !== 'undefined' && FRACHT_DATA.customers) ? FRACHT_DATA.customers : [];
let TRIPS     = (typeof FRACHT_DATA !== 'undefined' && FRACHT_DATA.trips)     ? FRACHT_DATA.trips     : [];

// Leert die Ø-Frachtpreis-Caches (nach einem Frachten-Upload aufzurufen).
function resetFreightCaches(){
  for(const k in _freightAvgCache) delete _freightAvgCache[k];
  for(const k in _countryRevCache) delete _countryRevCache[k];
  if(typeof _countryFreightCache === 'object'){ for(const k in _countryFreightCache) delete _countryFreightCache[k]; }
  _revenueRefDate = null;
}

// UMSATZ_DATA (aus Umsatz.xls): Umsatzsumme je Einheit + je Kunde.
// UNIT_REVENUE/CUSTOMER_REVENUE/REVENUE_TRIPS sind veränderbar, damit ein
// Umsatz-Upload sie vollständig zur Laufzeit ersetzen kann.
let UNIT_REVENUE     = (typeof UMSATZ_DATA !== 'undefined' && UMSATZ_DATA.unitRevenue)     ? UMSATZ_DATA.unitRevenue     : {};
let CUSTOMER_REVENUE = (typeof UMSATZ_DATA !== 'undefined' && UMSATZ_DATA.customerRevenue) ? UMSATZ_DATA.customerRevenue : {};
let REVENUE_TRIPS    = (typeof UMSATZ_DATA !== 'undefined' && UMSATZ_DATA.revenueTrips)    ? UMSATZ_DATA.revenueTrips    : [];

// Umsatzsumme einer Verwaltungseinheit (CRM-Pendant zum Ø-Frachtpreis).
function unitRevenueSum(country, unitName){
  if(!country || !unitName) return null;
  const e = UNIT_REVENUE[country + '::' + unitName];
  return e ? {sum: e.sum, count: e.count} : null;
}

// Referenz-„heute": jüngstes Belegdatum in den Umsatzdaten (die Daten sind eine
// Momentaufnahme, daher richtet sich Woche/YTD nach dem letzten Datenstand).
let _revenueRefDate = null;
function revenueRefDate(){
  if(_revenueRefDate) return _revenueRefDate;
  let max = null;
  for(const t of REVENUE_TRIPS){ if(t.date && (!max || t.date > max)) max = t.date; }
  _revenueRefDate = max ? new Date(max) : new Date();
  return _revenueRefDate;
}

// Start der aktuellen Woche (Montag 00:00) relativ zum Referenzdatum.
function revenueWeekStart(){
  const ref = revenueRefDate();
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const day = d.getDay();                     // 0=So..6=Sa
  const sinceMonday = (day + 6) % 7;          // Mo=0
  d.setDate(d.getDate() - sinceMonday);
  return d;
}

// Kumulierter Umsatz je Land: aktuelle Woche + Year-to-date.
const _countryRevCache = {};
function countryRevenue(country){
  if(country in _countryRevCache) return _countryRevCache[country];
  const weekStart = revenueWeekStart();
  const ref = revenueRefDate();
  const yearStart = new Date(ref.getFullYear(), 0, 1);
  let week = 0, ytd = 0;
  for(const t of REVENUE_TRIPS){
    if(t.country !== country || t.revenue == null || !t.date) continue;
    const d = new Date(t.date);
    if(d >= yearStart) ytd += t.revenue;
    if(d >= weekStart) week += t.revenue;
  }
  const res = {week: Math.round(week), ytd: Math.round(ytd)};
  _countryRevCache[country] = res;
  return res;
}

// Gesamt-Frachtsumme je Land (Summe aller erfassten Frachtpreise/-entgelte).
const _countryFreightCache = {};
function countryFreightTotal(country){
  if(country in _countryFreightCache) return _countryFreightCache[country];
  let sum = 0, count = 0;
  for(const t of TRIPS){
    if(t.country !== country) continue;
    if(t.price != null && !isNaN(t.price)){ sum += t.price; count++; }
  }
  const res = {sum: Math.round(sum), count};
  _countryFreightCache[country] = res;
  return res;
}

// Schneller Zugriff je Kürzel
const CUSTOMER_BY_CODE = {};
CUSTOMERS.forEach(c => { CUSTOMER_BY_CODE[c.code] = c; });

// Kunden je Land (für schnelles Rendern der Nadeln)
const CUSTOMERS_BY_COUNTRY = {};
CUSTOMERS.forEach(c => {
  if(!c.lonlat) return;
  (CUSTOMERS_BY_COUNTRY[c.country] = CUSTOMERS_BY_COUNTRY[c.country] || []).push(c);
});

// Nadelfarbe je Land: kräftige, gut erkennbare Landesfarbe (aus der Flagge).
const COUNTRY_PIN_COLOR = {
  'Deutschland':'#DD0000', 'Frankreich':'#0055A4', 'Italien':'#009246',
  'UK':'#012169', 'Spanien':'#AA151B', 'Portugal':'#046A38',
  'Niederlande':'#AE1C28', 'Belgien':'#ED2939', 'Österreich':'#ED2939',
  'Schweiz':'#D52B1E', 'Polen':'#DC143C', 'Schweden':'#006AA7',
  'Norwegen':'#BA0C2F', 'Dänemark':'#C60C30', 'Finnland':'#003580',
  'Irland':'#169B62', 'Island':'#02529C', 'Slowenien':'#0000A0',
};
function pinColor(country){ return COUNTRY_PIN_COLOR[country] || '#C0392B'; }
// abgedunkelte Variante für den Nadelrand
function darken(hex, f){
  const n = parseInt(hex.slice(1),16);
  const r = Math.round(((n>>16)&255)*f), g = Math.round(((n>>8)&255)*f), b = Math.round((n&255)*f);
  return '#' + ((1<<24) + (r<<16) + (g<<8) + b).toString(16).slice(1);
}

function fmtEur(n){
  if(n == null || isNaN(n)) return '—';
  return Math.round(n).toLocaleString('de-DE') + ' €';
}
function fmtNum(n, dec){
  if(n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('de-DE', {minimumFractionDigits: dec||0, maximumFractionDigits: dec||0});
}
function fmtDate(iso){
  if(!iso) return '—';
  const [y,m,d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

// ── Stecknadeln rendern ─────────────────────────────────────────────────────
// Wird am Ende von renderMap() aufgerufen. layer = #mapLayer (SVG-Gruppe),
// bbox = aktueller Kartenausschnitt, isEurope = Europaübersicht (dann keine Nadeln).
function renderCustomerPins(layer, bbox, isEurope){
  if(isEurope) return;                          // Nadeln erst ab Länderansicht
  const list = CUSTOMERS_BY_COUNTRY[state.country];
  if(!list || !list.length) return;

  list.forEach(c => {
    const [x, y] = project(c.lonlat[0], c.lonlat[1], bbox);
    const g = document.createElementNS('http://www.w3.org/2000/svg','g');
    g.setAttribute('class', 'cust-pin');
    g.dataset.code = c.code;
    g.dataset.px = x;   // Rohkoordinaten für applyTransform
    g.dataset.py = y;

    // Nadel: Tropfenform + Kopf, in der Landesfarbe
    const col = pinColor(c.country);
    const pin = document.createElementNS('http://www.w3.org/2000/svg','path');
    pin.setAttribute('d', 'M0,0 C-6,-9 -6,-16 0,-20 C6,-16 6,-9 0,0 Z');
    pin.setAttribute('class', 'cust-pin-body');
    pin.style.fill = col;
    pin.style.stroke = darken(col, 0.62);
    const dot = document.createElementNS('http://www.w3.org/2000/svg','circle');
    dot.setAttribute('cx','0'); dot.setAttribute('cy','-13'); dot.setAttribute('r','3.1');
    dot.setAttribute('class','cust-pin-dot');

    g.appendChild(pin);
    g.appendChild(dot);

    // Kürzel-Label unter der Nadel
    const label = document.createElementNS('http://www.w3.org/2000/svg','text');
    label.setAttribute('class','cust-pin-label');
    label.setAttribute('text-anchor','middle');
    label.setAttribute('y','9');
    label.textContent = c.code;
    g.appendChild(label);

    g.addEventListener('click', (ev)=>{ ev.stopPropagation(); openCustomerPanel(c.code); });
    g.addEventListener('mouseenter', ()=> g.classList.add('hover'));
    g.addEventListener('mouseleave', ()=> g.classList.remove('hover'));

    layer.appendChild(g);
  });
}

// Nadeln bei Zoom/Pan mitführen (im applyTransform aufgerufen)
function transformCustomerPins(tx, ty, sc){
  document.querySelectorAll('.cust-pin').forEach(g=>{
    const px = parseFloat(g.dataset.px), py = parseFloat(g.dataset.py);
    // Position transformieren, Nadel selbst NICHT skalieren (gegenskalieren)
    const sx = px*sc + tx, sy = py*sc + ty;
    g.setAttribute('transform', `translate(${sx.toFixed(2)},${sy.toFixed(2)})`);
  });
}

// ── Kunden-Detailpanel ──────────────────────────────────────────────────────
function openCustomerPanel(code){
  const c = CUSTOMER_BY_CODE[code];
  if(!c) return;

  // KPIs aus den Fahrten dieses Kunden
  const myTrips = TRIPS.filter(t => t.customer === code);
  const total = myTrips.length;
  const revenue = myTrips.reduce((s,t)=> s + (t.price||0), 0);
  const volume = myTrips.reduce((s,t)=> s + (t.volume||0), 0);
  const docs = myTrips.reduce((s,t)=> s + (t.docs||0), 0);
  const avgPrice = total ? revenue/total : 0;

  // Speditionsverteilung
  const carrierCount = {};
  myTrips.forEach(t=>{ if(t.carrier) carrierCount[t.carrier] = (carrierCount[t.carrier]||0)+1; });
  const topCarriers = Object.entries(carrierCount).sort((a,b)=>b[1]-a[1]).slice(0,3);

  const last = c.lastTrip || {};

  // Umsatz dieses Kunden (aus Umsatz.xls)
  const rev = CUSTOMER_REVENUE[code];
  const custRevenue = rev ? rev.sum : 0;
  const custRevCount = rev ? rev.count : 0;
  // meistbestellte Artikel
  const topArticles = rev && rev.articles
    ? Object.entries(rev.articles).sort((a,b)=>b[1]-a[1]).slice(0,3)
    : [];

  const panel = document.getElementById('customerPanel');
  const unitLabel = c.unit ? `${c.unit}` : '—';

  panel.innerHTML = `
    <div class="cust-panel-head">
      <div>
        <div class="cust-panel-code">${escapeHtml(c.code)}</div>
        <div class="cust-panel-loc">${escapeHtml(c.country)}${c.unit ? ' · '+escapeHtml(c.unit) : ''}${c.plz ? ' · '+escapeHtml(c.plz) : ''}</div>
      </div>
      <button class="cust-panel-close" onclick="closeCustomerPanel()" aria-label="Schließen">×</button>
    </div>

    <div class="cust-panel-section">
      <div class="cust-panel-title">Letzte Fahrt</div>
      <div class="cust-last-grid">
        <div><span class="cl-label">Datum</span><span class="cl-val">${fmtDate(last.date)}</span></div>
        <div><span class="cl-label">Frachtpreis</span><span class="cl-val">${fmtEur(last.price)}</span></div>
        <div><span class="cl-label">Spedition</span><span class="cl-val">${last.carrier ? escapeHtml(last.carrier) : '—'}</span></div>
        <div><span class="cl-label">Menge</span><span class="cl-val">${fmtNum(last.volume,2)} m³</span></div>
        <div><span class="cl-label">Lieferschein</span><span class="cl-val">${last.ls ? escapeHtml(last.ls) : '—'}</span></div>
        <div><span class="cl-label">Belege</span><span class="cl-val">${last.docs != null ? last.docs : '—'}</span></div>
      </div>
    </div>

    <div class="cust-panel-section">
      <div class="cust-panel-title">Kennzahlen (Gesamtzeitraum)</div>
      <div class="cust-kpi-grid">
        <div class="cust-kpi"><span class="ck-val">${total}</span><span class="ck-label">Fahrten</span></div>
        <div class="cust-kpi"><span class="ck-val">${fmtEur(revenue)}</span><span class="ck-label">Frachtumsatz</span></div>
        <div class="cust-kpi"><span class="ck-val">${fmtEur(avgPrice)}</span><span class="ck-label">Ø Fracht</span></div>
        <div class="cust-kpi"><span class="ck-val">${fmtNum(volume,0)} m³</span><span class="ck-label">Volumen</span></div>
        <div class="cust-kpi"><span class="ck-val">${docs}</span><span class="ck-label">Belege</span></div>
        <div class="cust-kpi"><span class="ck-val">${Object.keys(carrierCount).length}</span><span class="ck-label">Speditionen</span></div>
      </div>
    </div>

    ${custRevenue > 0 ? `
    <div class="cust-panel-section cust-revenue-section">
      <div class="cust-panel-title">Umsatz (aus Umsatz-Auswertung)</div>
      <div class="cust-kpi-grid">
        <div class="cust-kpi cust-kpi-revenue"><span class="ck-val">${fmtEur(custRevenue)}</span><span class="ck-label">Gesamtumsatz</span></div>
        <div class="cust-kpi"><span class="ck-val">${custRevCount}</span><span class="ck-label">Belege</span></div>
        <div class="cust-kpi"><span class="ck-val">${fmtEur(custRevCount ? custRevenue/custRevCount : 0)}</span><span class="ck-label">Ø Beleg</span></div>
      </div>
      ${topArticles.length ? `
      <div class="cust-article-line">Artikel: ${topArticles.map(([a,n])=>`${escapeHtml(a)} <span class="ca-count">(${n})</span>`).join(', ')}</div>` : ''}
    </div>` : ''}

    ${topCarriers.length ? `
    <div class="cust-panel-section">
      <div class="cust-panel-title">Häufigste Speditionen</div>
      <div class="cust-carrier-list">
        ${topCarriers.map(([name,n])=>`
          <div class="cust-carrier-row">
            <span class="cc-name">${escapeHtml(name)}</span>
            <span class="cc-count">${n} Fahrt${n===1?'':'en'}</span>
          </div>`).join('')}
      </div>
    </div>` : ''}
  `;
  panel.classList.add('open');

  // Nadel hervorheben
  document.querySelectorAll('.cust-pin').forEach(p=> p.classList.toggle('active', p.dataset.code===code));
}

function closeCustomerPanel(){
  const panel = document.getElementById('customerPanel');
  if(panel){ panel.classList.remove('open'); }
  document.querySelectorAll('.cust-pin.active').forEach(p=> p.classList.remove('active'));
}

// ── Frachtkosten-Mittelwert je Verwaltungseinheit ──────────────────────────
// Bildet den Durchschnitt aller Fahrt-Frachtpreise in eine Einheit (z. B. alle
// Fahrten nach Departement 85 / Vendée). Wird als Label im Gebiet angezeigt.
const _freightAvgCache = {};
function unitFreightAvg(country, unitName){
  if(!country || !unitName) return null;
  const key = country + '||' + unitName;
  if(key in _freightAvgCache) return _freightAvgCache[key];
  let sum = 0, n = 0;
  for(const t of TRIPS){
    if(t.country === country && t.unit === unitName && t.price != null && !isNaN(t.price)){
      sum += t.price; n++;
    }
  }
  const res = n > 0 ? {avg: sum/n, count: n} : null;
  _freightAvgCache[key] = res;
  return res;
}

// ── Funktion E: Kundensuche per Freitext ────────────────────────────────────
// Sucht nach Kundenkürzel (Spalte I der Frachtenauswertung) und führt zum
// Standort: wechselt ins Land des Kunden, zoomt zur Einheit und öffnet das
// Kunden-Panel mit letzter Fahrt und KPIs.
function wechselZuKunde(code){
  const c = CUSTOMER_BY_CODE[code];
  if(!c) return;

  // Land wechseln (falls nötig) und Karte neu aufbauen
  if(c.country && COUNTRIES[c.country] && state.country !== c.country){
    state.country = c.country;
    state.zoom = 1; state.pan = {x:0,y:0};
    state.isZoomedToSelection = false;
    state.selectedUnit = null;
    if(typeof populateSelectors === 'function') populateSelectors();
    if(typeof renderCountryTabs === 'function') renderCountryTabs();
    if(typeof renderMap === 'function') renderMap();
    if(typeof updateResultCard === 'function') updateResultCard();
    const sel = document.getElementById('selCountry');
    if(sel) sel.value = c.country;
  }

  // Zur Einheit des Kunden zentrieren (leichter Zoom auf die Region)
  if(c.lonlat){
    const bbox = (typeof currentBBox === 'function') ? currentBBox() : null;
    if(bbox && typeof project === 'function'){
      const [px, py] = project(c.lonlat[0], c.lonlat[1], bbox);
      const targetZoom = 3.2;
      // so pannen, dass der Kundenpunkt in die Bildmitte rückt
      state.zoom = targetZoom;
      state.pan = { x: VB_W/2 - px*targetZoom, y: VB_H/2 - py*targetZoom };
      if(typeof applyTransform === 'function') applyTransform();
    }
  }

  // Panel öffnen und Nadel hervorheben
  openCustomerPanel(code);
  document.querySelectorAll('.cust-pin').forEach(p=>{
    p.classList.toggle('search-hit', p.dataset.code === code);
  });
  setTimeout(()=> document.querySelectorAll('.cust-pin.search-hit')
    .forEach(p=> p.classList.remove('search-hit')), 2600);
}

function renderCustomerSearch(query){
  const box = document.getElementById('customerSearchResults');
  if(!box) return;
  const q = (query || '').trim().toUpperCase();
  if(!q){ box.innerHTML = ''; box.classList.remove('open'); return; }

  // Treffer: Kürzel beginnt mit der Eingabe (bevorzugt) oder enthält sie
  const starts = [], contains = [];
  for(const c of CUSTOMERS){
    const code = c.code.toUpperCase();
    if(code.startsWith(q)) starts.push(c);
    else if(code.includes(q)) contains.push(c);
  }
  const hits = starts.concat(contains).slice(0, 8);

  if(!hits.length){
    box.innerHTML = '<div class="cust-search-empty">Kein Kunde gefunden</div>';
    box.classList.add('open');
    return;
  }

  box.innerHTML = hits.map(c=>{
    const loc = [c.country, c.unit].filter(Boolean).join(' · ');
    const noPin = c.lonlat ? '' : ' <span class="cust-search-nopin">(kein Standort)</span>';
    return `<button type="button" class="cust-search-item" data-code="${escapeHtml(c.code)}">
      <span class="cs-code">${escapeHtml(c.code)}</span>
      <span class="cs-loc">${escapeHtml(loc)}${noPin}</span>
    </button>`;
  }).join('');
  box.classList.add('open');

  box.querySelectorAll('.cust-search-item').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const code = btn.dataset.code;
      wechselZuKunde(code);
      const inp = document.getElementById('inputCustomer');
      if(inp) inp.value = code;
      box.classList.remove('open');
    });
  });
}

function initCustomerSearch(){
  const inp = document.getElementById('inputCustomer');
  const box = document.getElementById('customerSearchResults');
  if(!inp || !box) return;
  inp.addEventListener('input', ()=> renderCustomerSearch(inp.value));
  inp.addEventListener('focus', ()=>{ if(inp.value.trim()) renderCustomerSearch(inp.value); });
  // Enter → ersten Treffer nehmen
  inp.addEventListener('keydown', (e)=>{
    if(e.key === 'Enter'){
      const first = box.querySelector('.cust-search-item');
      if(first) first.click();
    } else if(e.key === 'Escape'){
      box.classList.remove('open');
    }
  });
  // Klick außerhalb schließt die Liste
  document.addEventListener('click', (e)=>{
    if(!box.contains(e.target) && e.target !== inp) box.classList.remove('open');
  });
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', initCustomerSearch);
} else {
  initCustomerSearch();
}
