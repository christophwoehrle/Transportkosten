// ============================================================================
//  CRM-MODUL — Kundendaten, Umsätze, Produkte, Logistik je Verwaltungseinheit
//  Datenquellen: Excel-Upload (jetzt) · SharePoint-Liste · Warenwirtschaft-API
//  Alle Beträge in Euro, Mengen in LKW (Fahrzeugen) und Tonnen.
// ============================================================================

const CRM_PREFIX = 'crm::';
// Datenversion: bei jeder Änderung an den eingebetteten Demo-/Realdaten erhöhen.
// Ist die gespeicherte Version älter, werden die eingebetteten Daten neu geladen
// (so verschwinden z. B. alte 2025-Demo-Fahrten aus dem lokalen Speicher).
const CRM_DATA_VERSION = 5;
const CRM_KEYS = {
  kunden:   CRM_PREFIX + 'kunden',
  umsaetze: CRM_PREFIX + 'umsaetze',
  produkte: CRM_PREFIX + 'produkte',
  logistik: CRM_PREFIX + 'logistik',
  fahrten:  CRM_PREFIX + 'fahrten',
  meta:     CRM_PREFIX + 'meta',
};

// ---- aktives Modul: 'preise' | 'crm' | 'logistik' ----
let crmModule = 'preise';

// ---- In-Memory-Cache der CRM-Tabellen ----
// fahrten liegt im kompakten Spaltenformat vor (Nachschlagetabellen + Zahlen-Zeilen),
// damit auch zehntausende Einzelfahrten in den localStorage passen:
//   { epoch:'YYYY-MM-DD', speditionen:[...], einheiten:[[land,id,name],...],
//     warentypen:[...], rows:[[tagOffset, spedIdx, einheitIdx, warentypIdx, anzahl, kosten], ...] }
let CRM = { kunden: [], umsaetze: [], produkte: [], logistik: [], fahrten: null, meta: {} };

// ===================== FAHRTEN: KOMPAKTFORMAT =====================
const FAHRT_COLS = ['Datum','Spedition','EinheitLand','EinheitID','EinheitName','Warentyp','Fahrten','Kosten_EUR'];

function crmEmptyFahrten(){
  return {epoch: new Date().toISOString().slice(0,10), speditionen: [], einheiten: [], warentypen: [], rows: []};
}

// Tagesoffset → ISO-Datum
function crmFahrtDate(F, tagOffset){
  const d = new Date(F.epoch + 'T00:00:00');
  d.setDate(d.getDate() + tagOffset);
  return d.toISOString().slice(0,10);
}
// ISO-Datum → Tagesoffset
function crmDayOffset(F, iso){
  const a = new Date(F.epoch + 'T00:00:00'), b = new Date(iso + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}

// ISO-Kalenderwoche + ISO-Wochenjahr eines Datums (Woche beginnt Montag,
// KW1 ist die Woche mit dem ersten Donnerstag des Jahres).
function isoWeek(dateObj){
  const d = new Date(Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()));
  const day = (d.getUTCDay() + 6) % 7;          // Mo=0 … So=6
  d.setUTCDate(d.getUTCDate() - day + 3);        // Donnerstag dieser Woche
  const isoYear = d.getUTCFullYear();
  const firstThu = new Date(Date.UTC(isoYear, 0, 4));
  const firstDay = (firstThu.getUTCDay() + 6) % 7;
  firstThu.setUTCDate(firstThu.getUTCDate() - firstDay + 3);
  const week = 1 + Math.round((d - firstThu) / (7 * 86400000));
  return {year: isoYear, week};
}
// "YYYY-Www" Schlüssel (z. B. 2026-W27) aus ISO-Datumstext
function isoWeekKey(iso){
  const w = isoWeek(new Date(iso + 'T00:00:00'));
  return w.year + '-W' + String(w.week).padStart(2, '0');
}

// Baut aus einer Liste flacher Fahrten-Objekte das Kompaktformat (für Excel/API-Import).
function crmPackFahrten(records){
  if(!records || !records.length) return crmEmptyFahrten();
  const dates = records.map(r => String(r.Datum || '').slice(0,10)).filter(Boolean).sort();
  const epoch = dates[0] || new Date().toISOString().slice(0,10);
  const speds = [...new Set(records.map(r => String(r.Spedition || '').trim()))].sort();
  const sIdx = new Map(speds.map((s,i)=>[s,i]));
  const unitKeys = [...new Set(records.map(r =>
    JSON.stringify([String(r.EinheitLand||''), String(r.EinheitID||''), String(r.EinheitName||'')])))].sort();
  const units = unitKeys.map(k => JSON.parse(k));
  const uIdx = new Map(unitKeys.map((k,i)=>[k,i]));
  const cargos = [...new Set(records.map(r => String(r.Warentyp||'Gemischt').trim()))].sort();
  const cIdx = new Map(cargos.map((c,i)=>[c,i]));
  const F = {epoch, speditionen: speds, einheiten: units, warentypen: cargos, rows: []};
  for(const r of records){
    const iso = String(r.Datum||'').slice(0,10);
    if(!iso) continue;
    const uk = JSON.stringify([String(r.EinheitLand||''), String(r.EinheitID||''), String(r.EinheitName||'')]);
    F.rows.push([
      crmDayOffset(F, iso),
      sIdx.get(String(r.Spedition||'').trim()) ?? 0,
      uIdx.get(uk) ?? 0,
      cIdx.get(String(r.Warentyp||'Gemischt').trim()) ?? 0,
      Number(r.Fahrten) || 1,
      Number(r.Kosten_EUR) || 0,
    ]);
  }
  F.rows.sort((a,b)=> a[0]-b[0]);
  return F;
}

// ===================== FAHRTEN-STATISTIK =====================
// Wertet aus, welche Spedition in welchem Zeitraum wie oft gefahren ist.
// filter: {von, bis (ISO), warentyp ('*'|Typ), land ('*'|Land), einheitId (optional)}
function crmFahrtStats(filter){
  const F = CRM.fahrten;
  const empty = {gesamtFahrten:0, gesamtKosten:0, speditionen:[], monate:[], wochen:[], warentypen:[], zeitraum:null};
  if(!F || !F.rows || !F.rows.length) return empty;

  const von = filter.von ? crmDayOffset(F, filter.von) : -Infinity;
  const bis = filter.bis ? crmDayOffset(F, filter.bis) : Infinity;
  const wtIdx = (filter.warentyp && filter.warentyp !== '*')
    ? F.warentypen.indexOf(filter.warentyp) : -1;
  if(filter.warentyp && filter.warentyp !== '*' && wtIdx < 0) return empty;

  const perSped   = new Map();   // Spedition → {fahrten, kosten}
  const perMonth  = new Map();   // 'YYYY-MM' → {fahrten, kosten}
  const perWeek   = new Map();   // 'YYYY-Www' → {fahrten, kosten}
  const perCargo  = new Map();   // Warentyp → {fahrten, kosten}
  let gesamtFahrten = 0, gesamtKosten = 0;

  for(const row of F.rows){
    const [tag, si, ui, ci, anzahl, kosten] = row;
    if(tag < von || tag > bis) continue;
    if(wtIdx >= 0 && ci !== wtIdx) continue;
    const unit = F.einheiten[ui] || ['','',''];
    if(filter.land && filter.land !== '*' && unit[0] !== filter.land) continue;
    if(filter.einheitId && String(unit[1]) !== String(filter.einheitId)) continue;
    if(filter.einheitName && unit[2] !== filter.einheitName) continue;

    const sped = F.speditionen[si] || '—';
    const cargo = F.warentypen[ci] || '—';
    const iso = crmFahrtDate(F, tag);
    const ym = iso.slice(0,7);
    const yw = isoWeekKey(iso);

    if(!perSped.has(sped)) perSped.set(sped, {fahrten:0, kosten:0});
    const s = perSped.get(sped); s.fahrten += anzahl; s.kosten += kosten;

    if(!perMonth.has(ym)) perMonth.set(ym, {fahrten:0, kosten:0});
    const m = perMonth.get(ym); m.fahrten += anzahl; m.kosten += kosten;

    if(!perWeek.has(yw)) perWeek.set(yw, {fahrten:0, kosten:0});
    const w = perWeek.get(yw); w.fahrten += anzahl; w.kosten += kosten;

    if(!perCargo.has(cargo)) perCargo.set(cargo, {fahrten:0, kosten:0});
    const c = perCargo.get(cargo); c.fahrten += anzahl; c.kosten += kosten;

    gesamtFahrten += anzahl;
    gesamtKosten  += kosten;
  }

  const speditionen = [...perSped.entries()]
    .map(([name, v]) => ({
      name, fahrten: v.fahrten, kosten: v.kosten,
      anteil: gesamtFahrten ? v.fahrten / gesamtFahrten : 0,
      schnitt: v.fahrten ? v.kosten / v.fahrten : 0,
    }))
    .sort((a,b)=> b.fahrten - a.fahrten);

  const monate = [...perMonth.entries()]
    .map(([ym, v]) => ({monat: ym, fahrten: v.fahrten, kosten: v.kosten}))
    .sort((a,b)=> a.monat.localeCompare(b.monat));

  // Kalenderwochen: Schlüssel "YYYY-Www" → lesbares "KW nn" + ISO-Jahr
  const wochen = [...perWeek.entries()]
    .map(([yw, v]) => {
      const [jahr, wk] = yw.split('-W');
      return {woche: yw, jahr: +jahr, kw: +wk, label: 'KW ' + wk, fahrten: v.fahrten, kosten: v.kosten};
    })
    .sort((a,b)=> a.woche.localeCompare(b.woche));

  const warentypen = [...perCargo.entries()]
    .map(([name, v]) => ({name, fahrten: v.fahrten, kosten: v.kosten,
      anteil: gesamtFahrten ? v.fahrten/gesamtFahrten : 0}))
    .sort((a,b)=> b.fahrten - a.fahrten);

  return {gesamtFahrten, gesamtKosten, speditionen, monate, wochen, warentypen,
          zeitraum: {von: filter.von, bis: filter.bis}};
}

// Verfügbarer Datenzeitraum (für die Vorbelegung der Filter)
function crmFahrtRange(){
  const F = CRM.fahrten;
  if(!F || !F.rows || !F.rows.length) return null;
  let min = Infinity, max = -Infinity;
  for(const r of F.rows){ if(r[0]<min) min=r[0]; if(r[0]>max) max=r[0]; }
  return {von: crmFahrtDate(F, min), bis: crmFahrtDate(F, max)};
}
function crmFahrtCargoTypes(){
  const F = CRM.fahrten;
  return (F && F.warentypen) ? F.warentypen : [];
}

// ===================== PERSISTENZ =====================
function crmLoad(){
  try{
    for(const t of ['kunden','umsaetze','produkte','logistik']){
      const raw = localStorage.getItem(CRM_KEYS[t]);
      CRM[t] = raw ? JSON.parse(raw) : [];
    }
    const f = localStorage.getItem(CRM_KEYS.fahrten);
    CRM.fahrten = f ? JSON.parse(f) : null;
    const m = localStorage.getItem(CRM_KEYS.meta);
    CRM.meta = m ? JSON.parse(m) : {};
  }catch(e){ console.warn('CRM load failed', e); }
}
function crmSave(){
  try{
    for(const t of ['kunden','umsaetze','produkte','logistik'])
      localStorage.setItem(CRM_KEYS[t], JSON.stringify(CRM[t]));
    if(CRM.fahrten) localStorage.setItem(CRM_KEYS.fahrten, JSON.stringify(CRM.fahrten));
    localStorage.setItem(CRM_KEYS.meta, JSON.stringify(CRM.meta));
  }catch(e){
    // Bei Platzmangel im localStorage: Fahrten sind der größte Block — Hinweis ausgeben,
    // die Daten bleiben für diese Sitzung im Arbeitsspeicher nutzbar.
    console.warn('CRM save failed (Speicherlimit?)', e);
    if(typeof crmToast === 'function')
      crmToast('Daten konnten nicht dauerhaft gespeichert werden (Browser-Speicherlimit). Sie bleiben für diese Sitzung verfügbar.', 'err');
  }
}

// Beim Start Demo-/Realdaten aus dem eingebetteten Block laden, wenn der lokale
// Speicher leer ODER veraltet ist (Datenversion niedriger als eingebettet).
function crmPreloadIfEmpty(){
  crmLoad();
  let storedVersion = 0;
  try{ storedVersion = parseInt(localStorage.getItem(CRM_PREFIX + 'dataVersion') || '0', 10) || 0; }catch(e){}
  const upToDate = storedVersion >= CRM_DATA_VERSION;
  if(CRM.kunden.length && upToDate) return;
  const el = document.getElementById('crm-demo-data');
  if(el){
    try{
      const demo = JSON.parse(el.textContent);
      CRM.kunden = demo.kunden || [];
      CRM.umsaetze = demo.umsaetze || [];
      CRM.produkte = demo.produkte || [];
      CRM.logistik = demo.logistik || [];
      CRM.fahrten = demo.fahrten || null;   // bereits im Kompaktformat
      CRM.meta = demo.meta || {};
      crmSave();
      try{ localStorage.setItem(CRM_PREFIX + 'dataVersion', String(CRM_DATA_VERSION)); }catch(e){}
    }catch(e){ console.warn('CRM demo preload failed', e); }
  }
}

// ===================== AGGREGATIONEN =====================
function crmYear(){ return CRM.meta.jahr || new Date().getFullYear(); }
function crmMonth(){ return CRM.meta.aktuellerMonat || (new Date().getMonth()+1); }

// Kunden einer Verwaltungseinheit
function crmCustomersOf(country, unitId, unitName){
  return CRM.kunden.filter(k =>
    k.EinheitLand === country &&
    ((unitId && k.EinheitID === unitId) || (!unitId && k.EinheitName === unitName)));
}

// Umsatz-Datensätze eines Kunden
function crmRevenueOf(kundenId){
  return CRM.umsaetze.filter(u => u.KundenID === kundenId);
}
// Produkt-Datensätze eines Kunden
function crmProductsOf(kundenId){
  return CRM.produkte.filter(p => p.KundenID === kundenId);
}

// Kennzahlen-Aggregat einer Verwaltungseinheit (für Tooltip + Detailpanel)
function crmUnitStats(country, unitId, unitName){
  const custs = crmCustomersOf(country, unitId, unitName);
  const ids = new Set(custs.map(c => c.KundenID));
  const M = crmMonth();
  let umsatzYtd = 0, umsatzMonat = 0, auftragsbestand = 0, lkwYtd = 0, tonnenYtd = 0;
  for(const u of CRM.umsaetze){
    if(!ids.has(u.KundenID)) continue;
    umsatzYtd     += u.Umsatz_EUR || 0;
    lkwYtd        += u.Menge_LKW || 0;
    tonnenYtd     += u.Menge_Tonnen || 0;
    auftragsbestand += u.Auftragsbestand_EUR || 0;
    if(u.Monat === M) umsatzMonat += u.Umsatz_EUR || 0;
  }
  // Echten Umsatz je Einheit (aus Umsatz.xls) bevorzugen, falls vorhanden.
  if(typeof unitRevenueSum === 'function'){
    const rev = unitRevenueSum(country, unitName);
    if(rev && rev.sum > 0) umsatzYtd = rev.sum;
  }
  // Transportkosten + Fahrten aus Logistik
  let transportkosten = 0, fahrtenYtd = 0;
  for(const l of CRM.logistik){
    if(l.EinheitLand === country && ((unitId && l.EinheitID===unitId) || (!unitId && l.EinheitName===unitName))){
      transportkosten += l.Transportkosten_EUR || 0;
      fahrtenYtd      += l.Fahrten_YTD || 0;
    }
  }
  return {
    kundenAnzahl: custs.length,
    umsatzYtd, umsatzMonat, auftragsbestand,
    lkwYtd, tonnenYtd, transportkosten, fahrtenYtd,
  };
}

// Umsatz je Kunde (YTD) — für die Detailliste
function crmCustomerTotals(kundenId){
  let ytd = 0, monat = 0, lkw = 0, tonnen = 0, backlog = 0;
  const M = crmMonth();
  for(const u of crmRevenueOf(kundenId)){
    ytd += u.Umsatz_EUR||0; lkw += u.Menge_LKW||0; tonnen += u.Menge_Tonnen||0;
    backlog += u.Auftragsbestand_EUR||0;
    if(u.Monat===M) monat += u.Umsatz_EUR||0;
  }
  return { ytd, monat, lkw, tonnen, backlog };
}

// Produktumsätze eines Kunden (YTD aggregiert je Produkt)
function crmCustomerProducts(kundenId){
  const map = new Map();
  for(const p of crmProductsOf(kundenId)){
    const k = p.Produkt;
    if(!map.has(k)) map.set(k, {produkt:p.Produkt, kategorie:p.Kategorie, umsatz:0, tonnen:0});
    const e = map.get(k);
    e.umsatz += p.Umsatz_EUR||0;
    e.tonnen += p.Menge_Tonnen||0;
  }
  return [...map.values()].sort((a,b)=> b.umsatz - a.umsatz);
}

// Logistik einer Einheit (Speditionen + Preise + Fahrten)
function crmUnitLogistics(country, unitId, unitName){
  return CRM.logistik.filter(l =>
    l.EinheitLand===country && ((unitId && l.EinheitID===unitId) || (!unitId && l.EinheitName===unitName))
  ).sort((a,b)=> (b.Fahrten_YTD||0) - (a.Fahrten_YTD||0));
}

// Gibt es für eine Einheit überhaupt CRM-Daten? (für Karten-Einfärbung im CRM-Modus)
function crmUnitHasData(country, unitId, unitName){
  return crmCustomersOf(country, unitId, unitName).length > 0;
}

// ===================== FORMATIERUNG =====================
function fmtEur(v){
  if(v===null||v===undefined||isNaN(v)) return '–';
  return new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(v);
}
function fmtNum(v, dec=0){
  if(v===null||v===undefined||isNaN(v)) return '–';
  return new Intl.NumberFormat('de-DE',{minimumFractionDigits:dec,maximumFractionDigits:dec}).format(v);
}
