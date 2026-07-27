// ============================================================================
//  CRM-UI — Modul-Umschalter, Statistik-Tooltip, Detail-Modal, Logistik-Ansicht
// ============================================================================

// ---------- Modul-Umschalter oben ----------
function crmSetupModuleSwitcher(){
  const bar = document.getElementById('moduleSwitcher');
  if(!bar) return;
  bar.querySelectorAll('.module-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      crmModule = btn.dataset.module;
      bar.querySelectorAll('.module-btn').forEach(b=> b.classList.toggle('active', b===btn));
      crmApplyModule();
    });
  });
}

function crmApplyModule(){
  const body = document.body;
  body.classList.toggle('mode-crm', crmModule==='crm');
  body.classList.toggle('mode-logistik', crmModule==='logistik');
  body.classList.toggle('mode-preise', crmModule==='preise');
  // Karte neu einfärben (CRM-Modus: Einheiten mit Kunden hervorheben)
  if(typeof renderMap === 'function') renderMap();
  // Sidebar-Panels umschalten
  const crmPanel = document.getElementById('crmSidePanel');
  const pricePanels = document.querySelectorAll('.price-only');
  if(crmModule==='preise'){
    if(crmPanel) crmPanel.style.display = 'none';
    pricePanels.forEach(p=> p.style.display = '');
  } else {
    if(crmPanel){ crmPanel.style.display = ''; crmRenderSidePanel(); }
    pricePanels.forEach(p=> p.style.display = 'none');
  }
}

// ---------- Erweiterter Tooltip (CRM-Statistik beim Hover) ----------
function crmTooltipHtml(country, unit){
  const s = crmUnitStats(country, unit.id, unit.name);
  if(s.kundenAnzahl === 0){
    return `<div class="tt-crm"><b>${unit.name}</b>${unit.id?` · Nr. ${unit.id}`:''}
      <div class="tt-empty">Keine CRM-Daten erfasst</div></div>`;
  }
  return `<div class="tt-crm">
    <div class="tt-head"><b>${unit.name}</b>${unit.id?` · Nr. ${unit.id}`:''}
      <span class="tt-cust">${s.kundenAnzahl} Kund${s.kundenAnzahl===1?'e':'en'}</span></div>
    <table class="tt-tab">
      <tr><td>Umsatz YTD</td><td class="tt-v">${fmtEur(s.umsatzYtd)}</td></tr>
      <tr><td>Transportkosten</td><td class="tt-v">${fmtEur(s.transportkosten)}</td></tr>
      <tr><td>Fahrten YTD</td><td class="tt-v">${fmtNum(s.fahrtenYtd)}</td></tr>
    </table>
    <div class="tt-foot">Klick öffnet Detailansicht</div>
  </div>`;
}

// ---------- Detail-Modal beim Klick ----------
let crmModalUnit = null;   // {country, id, name}
let crmModalTab  = 'kunden';

function crmOpenDetail(country, unit){
  crmModalUnit = { country, id: unit.id, name: unit.name };
  crmModalTab  = crmModule === 'logistik' ? 'logistik' : 'kunden';
  document.getElementById('crmModal').style.display = 'flex';
  crmRenderModal();
}
function crmCloseDetail(){
  document.getElementById('crmModal').style.display = 'none';
  crmModalUnit = null;
}

function crmRenderModal(){
  if(!crmModalUnit) return;
  const {country, id, name} = crmModalUnit;
  const s = crmUnitStats(country, id, name);
  const head = document.getElementById('crmModalHead');
  head.innerHTML = `
    <div class="cm-title">
      <div>
        <div class="cm-unit">${name}${id?` · Nr. ${id}`:''}</div>
        <div class="cm-country">${country}</div>
      </div>
      <button class="cm-close" id="cmCloseBtn" title="Schließen">✕</button>
    </div>
    <div class="cm-kpis">
      <div class="kpi"><div class="kpi-l">Umsatz YTD</div><div class="kpi-v">${fmtEur(s.umsatzYtd)}</div></div>
      <div class="kpi"><div class="kpi-l">Transportkosten</div><div class="kpi-v">${fmtEur(s.transportkosten)}</div></div>
      <div class="kpi"><div class="kpi-l">Fahrten YTD</div><div class="kpi-v">${fmtNum(s.fahrtenYtd)}</div></div>
      <div class="kpi"><div class="kpi-l">Kunden</div><div class="kpi-v">${s.kundenAnzahl}</div></div>
    </div>
    <div class="cm-tabs">
      <button class="cm-tab ${crmModalTab==='kunden'?'active':''}" data-tab="kunden">Kunden &amp; Umsätze</button>
      <button class="cm-tab ${crmModalTab==='logistik'?'active':''}" data-tab="logistik">Logistik</button>
    </div>`;
  document.getElementById('cmCloseBtn').addEventListener('click', crmCloseDetail);
  head.querySelectorAll('.cm-tab').forEach(t=>{
    t.addEventListener('click', ()=>{ crmModalTab = t.dataset.tab; crmRenderModal(); });
  });

  const bodyEl = document.getElementById('crmModalBody');
  bodyEl.innerHTML = crmModalTab === 'kunden'
    ? crmRenderCustomers(country, id, name)
    : crmRenderLogistics(country, id, name);

  // Statistik-Button im Logistik-Tab (vorgefiltert auf diese Einheit)
  const sb = bodyEl.querySelector('#cmStatsBtn');
  if(sb) sb.addEventListener('click', ()=>{
    crmCloseDetail();
    crmOpenStats({land: country, einheitName: name, einheitId: id});
  });

  // Burgermenü-Handler (Produkte je Kunde auf-/zuklappen)
  bodyEl.querySelectorAll('.cust-row .burger').forEach(b=>{
    b.addEventListener('click', (e)=>{
      e.stopPropagation();
      const kid = b.closest('.cust-row').dataset.kid;
      const panel = bodyEl.querySelector(`.prod-panel[data-kid="${kid}"]`);
      if(panel){
        const open = panel.classList.toggle('open');
        b.classList.toggle('open', open);
      }
    });
  });
}

function crmRenderCustomers(country, id, name){
  const custs = crmCustomersOf(country, id, name);
  if(!custs.length) return `<div class="cm-empty">Für diese Einheit sind keine Kunden erfasst.</div>`;
  // nach Umsatz YTD sortieren
  const withTotals = custs.map(c => ({c, t: crmCustomerTotals(c.KundenID)}))
                          .sort((a,b)=> b.t.ytd - a.t.ytd);
  let html = `<table class="cust-tab">
    <thead><tr>
      <th></th><th>Kunde</th><th>Ort / Adresse</th>
      <th class="num">Umsatz YTD</th><th class="num">Akt. Monat</th>
      <th class="num">LKW</th><th class="num">Tonnen</th><th class="num">Auftrag</th>
    </tr></thead><tbody>`;
  for(const {c, t} of withTotals){
    const prods = crmCustomerProducts(c.KundenID);
    html += `<tr class="cust-row" data-kid="${c.KundenID}">
      <td><button class="burger" title="Produkte anzeigen"><span></span><span></span><span></span></button></td>
      <td class="cust-name">${escapeHtml(c.Kundenname)}<div class="cust-contact">${escapeHtml(c.Ansprechpartner||'')}</div></td>
      <td class="cust-addr">${escapeHtml(c.Strasse||'')}<div class="cust-city">${escapeHtml((c.PLZ||'')+' '+(c.Ort||''))}</div></td>
      <td class="num strong">${fmtEur(t.ytd)}</td>
      <td class="num">${fmtEur(t.monat)}</td>
      <td class="num">${fmtNum(t.lkw)}</td>
      <td class="num">${fmtNum(t.tonnen,1)}</td>
      <td class="num">${fmtEur(t.backlog)}</td>
    </tr>
    <tr class="prod-row"><td colspan="8" class="prod-cell">
      <div class="prod-panel" data-kid="${c.KundenID}">
        <div class="prod-inner">
          ${prods.length ? `<table class="prod-tab">
            <thead><tr><th>Produkt</th><th>Kategorie</th><th class="num">Umsatz YTD</th><th class="num">Tonnen</th></tr></thead>
            <tbody>${prods.map(p=>`<tr>
              <td>${escapeHtml(p.produkt)}</td><td class="pcat">${escapeHtml(p.kategorie||'')}</td>
              <td class="num">${fmtEur(p.umsatz)}</td><td class="num">${fmtNum(p.tonnen,1)} t</td>
            </tr>`).join('')}</tbody>
          </table>` : `<div class="prod-empty">Keine Produktdaten.</div>`}
        </div>
      </div>
    </td></tr>`;
  }
  html += `</tbody></table>`;
  return html;
}

function crmRenderLogistics(country, id, name){
  const rows = crmUnitLogistics(country, id, name);
  if(!rows.length) return `<div class="cm-empty">Für diese Einheit sind keine Logistikdaten erfasst.</div>`;
  const totalTrips = rows.reduce((a,r)=>a+(r.Fahrten_YTD||0),0);
  const totalCost  = rows.reduce((a,r)=>a+(r.Transportkosten_EUR||0),0);
  return `<table class="log-tab">
    <thead><tr>
      <th>Spedition</th><th class="num">Preis / Fahrt</th>
      <th class="num">Fahrten YTD</th><th class="num">Transportkosten YTD</th><th class="num">Anteil</th>
    </tr></thead><tbody>
    ${rows.map(r=>{
      const share = totalTrips? Math.round((r.Fahrten_YTD||0)/totalTrips*100):0;
      return `<tr>
        <td class="log-carrier">${escapeHtml(r.Spedition)}</td>
        <td class="num">${fmtEur(r.Preis_EUR)}</td>
        <td class="num">${fmtNum(r.Fahrten_YTD)}</td>
        <td class="num">${fmtEur(r.Transportkosten_EUR)}</td>
        <td class="num"><div class="share-bar"><div class="share-fill" style="width:${share}%"></div><span>${share}%</span></div></td>
      </tr>`;
    }).join('')}
    </tbody>
    <tfoot><tr>
      <td>Gesamt (${rows.length} Speditionen)</td><td></td>
      <td class="num strong">${fmtNum(totalTrips)}</td>
      <td class="num strong">${fmtEur(totalCost)}</td><td></td>
    </tr></tfoot>
  </table>
  <div class="st-actions">
    <button class="btn secondary" id="cmStatsBtn">Fahrten-Statistik für ${escapeHtml(name)} öffnen</button>
  </div>`;
}

// ---------- CRM-Seitenpanel (Übersicht + Datenquellen) ----------
function crmRenderSidePanel(){
  const el = document.getElementById('crmSidePanel');
  if(!el) return;
  // Gesamtkennzahlen aus den ECHTEN Daten (Umsatz.xls + Frachtenauswertung),
  // nicht mehr aus Demo-Werten.
  let totYtd = 0, totCost = 0;
  if(typeof UNIT_REVENUE === 'object'){
    for(const k in UNIT_REVENUE) totYtd += UNIT_REVENUE[k].sum || 0;
  }
  for(const l of CRM.logistik) totCost += l.Transportkosten_EUR||0;
  const nUnits = (typeof UNIT_REVENUE === 'object') ? Object.keys(UNIT_REVENUE).length : 0;
  const nKunden = (typeof CUSTOMER_REVENUE === 'object') ? Object.keys(CUSTOMER_REVENUE).length : 0;
  const quelle = (typeof UMSATZ_DATA !== 'undefined' && UMSATZ_DATA.meta) ? UMSATZ_DATA.meta.source : '—';
  const stand  = (typeof UMSATZ_DATA !== 'undefined' && UMSATZ_DATA.meta) ? UMSATZ_DATA.meta.dateTo : '—';

  el.innerHTML = `
    <div class="crm-panel-title">${crmModule==='logistik'?'Logistik-Übersicht':'Umsatz-Übersicht'}</div>
    <div class="crm-sum">
      <div class="crm-sum-row"><span>Umsatz gesamt</span><b>${fmtEur(totYtd)}</b></div>
      <div class="crm-sum-row"><span>Transportkosten</span><b>${fmtEur(totCost)}</b></div>
    </div>
    <div class="crm-meta">
      ${nKunden} Kunden · ${nUnits} Einheiten<br>
      Stand: ${stand||'—'} · Quelle: ${quelle||'—'}
    </div>
    <div class="divider"></div>
    <button class="btn" id="crmBtnStats">Fahrten-Statistik öffnen</button>
    <div class="crm-hint">Auswertung: welche Spedition ist in welchem Zeitraum wie oft gefahren.</div>
    <div class="divider"></div>
    <div class="crm-panel-title">Datenquellen</div>
    <button class="btn secondary" id="crmBtnUpload">Umsatz-Excel hochladen</button>
    <input type="file" id="crmFileInput" accept=".xlsx" style="display:none;">
    <button class="btn secondary" id="crmBtnSharepoint">Aus SharePoint aktualisieren</button>
    <button class="btn secondary" id="crmBtnApi">Warenwirtschaft synchronisieren</button>
    <div class="crm-hint" id="crmSyncHint">Excel-Upload sofort nutzbar. SharePoint &amp; API sind vorbereitet (Konfiguration erforderlich).</div>
    <div class="divider"></div>
    <div class="crm-tip">Tipp: Mit der Maus über eine Einheit fahren zeigt die Kennzahlen, ein Klick öffnet die Detailansicht mit Kunden, Produkten und Logistik.</div>
  `;
  // Handler
  const fi = document.getElementById('crmFileInput');
  document.getElementById('crmBtnUpload').addEventListener('click', ()=> fi.click());
  fi.addEventListener('change', crmHandleExcelUpload);
  const bs = document.getElementById('crmBtnStats');
  if(bs) bs.addEventListener('click', ()=> crmOpenStats());
  document.getElementById('crmBtnSharepoint').addEventListener('click', ()=> crmConnectorDialog('sharepoint'));
  document.getElementById('crmBtnApi').addEventListener('click', ()=> crmConnectorDialog('api'));
}

// ============================================================================
//  FAHRTEN-STATISTIK — welche Spedition ist in welchem Zeitraum wie oft gefahren
// ============================================================================
let crmStatFilter = {von:null, bis:null, warentyp:'*', land:'*'};
let crmStatVerlauf = 'monat';   // 'monat' | 'woche' — Umschaltung im Verlaufsdiagramm

function crmOpenStats(preset){
  const range = crmFahrtRange();
  if(!range){
    crmToast('Keine Fahrtdaten vorhanden. Bitte zuerst Daten laden (Blatt „Fahrten“).', 'err');
    return;
  }
  if(!crmStatFilter.von) crmStatFilter.von = range.von;
  if(!crmStatFilter.bis) crmStatFilter.bis = range.bis;
  if(preset && preset.land) crmStatFilter.land = preset.land;
  if(preset && preset.einheitName){
    crmStatFilter.einheitName = preset.einheitName;
    crmStatFilter.einheitId   = preset.einheitId;
  }
  document.getElementById('crmStatsModal').style.display = 'flex';
  crmRenderStats();
}
function crmCloseStats(){
  document.getElementById('crmStatsModal').style.display = 'none';
}

// Schnellwahl-Zeiträume
function crmStatPreset(kind){
  const range = crmFahrtRange();
  if(!range) return;
  const today = range.bis;                       // jüngstes Datum im Datenbestand
  const d = new Date(today + 'T00:00:00');
  const iso = x => x.toISOString().slice(0,10);
  if(kind === 'alles'){
    crmStatFilter.von = range.von; crmStatFilter.bis = range.bis;
  } else if(kind === '30'){
    const v = new Date(d); v.setDate(v.getDate() - 29);
    crmStatFilter.von = iso(v); crmStatFilter.bis = today;
  } else if(kind === '90'){
    const v = new Date(d); v.setDate(v.getDate() - 89);
    crmStatFilter.von = iso(v); crmStatFilter.bis = today;
  } else if(kind === 'ytd'){
    crmStatFilter.von = today.slice(0,4) + '-01-01'; crmStatFilter.bis = today;
  } else if(kind === 'monat'){
    crmStatFilter.von = today.slice(0,7) + '-01'; crmStatFilter.bis = today;
  }
  crmRenderStats();
}

function crmRenderStats(){
  const s = crmFahrtStats(crmStatFilter);
  const range = crmFahrtRange() || {von:'', bis:''};
  const cargos = crmFahrtCargoTypes();
  const laender = [...new Set((CRM.fahrten?.einheiten || []).map(e=>e[0]))].sort();
  const unitLabel = crmStatFilter.einheitName
    ? `${crmStatFilter.einheitName}${crmStatFilter.einheitId?' · Nr. '+crmStatFilter.einheitId:''}` : null;

  const head = document.getElementById('crmStatsHead');
  head.innerHTML = `
    <div class="cm-title">
      <div>
        <div class="cm-unit">Fahrten-Statistik</div>
        <div class="cm-country">Fahrten je Spedition im gewählten Zeitraum${unitLabel?' · '+escapeHtml(unitLabel):''}</div>
      </div>
      <button class="cm-close" id="stCloseBtn" title="Schließen">✕</button>
    </div>
    <div class="st-filters">
      <div class="st-f">
        <label>Von</label>
        <input type="date" id="stVon" value="${crmStatFilter.von}" min="${range.von}" max="${range.bis}">
      </div>
      <div class="st-f">
        <label>Bis</label>
        <input type="date" id="stBis" value="${crmStatFilter.bis}" min="${range.von}" max="${range.bis}">
      </div>
      <div class="st-f">
        <label>Warentyp</label>
        <select id="stWarentyp">
          <option value="*">Alle</option>
          ${cargos.map(c=>`<option value="${c}" ${crmStatFilter.warentyp===c?'selected':''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="st-f">
        <label>Land</label>
        <select id="stLand">
          <option value="*">Alle</option>
          ${laender.map(l=>`<option value="${l}" ${crmStatFilter.land===l?'selected':''}>${escapeHtml(l)}</option>`).join('')}
        </select>
      </div>
      ${unitLabel ? `<button class="btn secondary st-clear" id="stClearUnit">Einheiten-Filter aufheben</button>` : ''}
    </div>
    <div class="st-presets">
      <button class="st-preset" data-p="monat">Aktueller Monat</button>
      <button class="st-preset" data-p="30">Letzte 30 Tage</button>
      <button class="st-preset" data-p="90">Letzte 90 Tage</button>
      <button class="st-preset" data-p="ytd">Jahr bis heute</button>
      <button class="st-preset" data-p="alles">Gesamter Zeitraum</button>
    </div>
    <div class="cm-kpis st-kpis">
      <div class="kpi"><div class="kpi-l">Fahrten gesamt</div><div class="kpi-v">${fmtNum(s.gesamtFahrten)}</div></div>
      <div class="kpi"><div class="kpi-l">Transportkosten</div><div class="kpi-v">${fmtEur(s.gesamtKosten)}</div></div>
      <div class="kpi"><div class="kpi-l">Ø Kosten / Fahrt</div><div class="kpi-v">${fmtEur(s.gesamtFahrten? s.gesamtKosten/s.gesamtFahrten : 0)}</div></div>
      <div class="kpi"><div class="kpi-l">Speditionen</div><div class="kpi-v">${s.speditionen.length}</div></div>
    </div>`;

  document.getElementById('stCloseBtn').addEventListener('click', crmCloseStats);
  document.getElementById('stVon').addEventListener('change', e=>{ crmStatFilter.von = e.target.value; crmRenderStats(); });
  document.getElementById('stBis').addEventListener('change', e=>{ crmStatFilter.bis = e.target.value; crmRenderStats(); });
  document.getElementById('stWarentyp').addEventListener('change', e=>{ crmStatFilter.warentyp = e.target.value; crmRenderStats(); });
  document.getElementById('stLand').addEventListener('change', e=>{ crmStatFilter.land = e.target.value; crmRenderStats(); });
  head.querySelectorAll('.st-preset').forEach(b=> b.addEventListener('click', ()=> crmStatPreset(b.dataset.p)));
  const clr = document.getElementById('stClearUnit');
  if(clr) clr.addEventListener('click', ()=>{
    delete crmStatFilter.einheitName; delete crmStatFilter.einheitId; crmRenderStats();
  });

  // ---- Inhalt: Speditions-Ranking + Monatsverlauf + Warentypen ----
  const body = document.getElementById('crmStatsBody');
  if(!s.gesamtFahrten){
    body.innerHTML = `<div class="cm-empty">Im gewählten Zeitraum wurden keine Fahrten erfasst.</div>`;
    return;
  }
  const maxSped = Math.max(...s.speditionen.map(x=>x.fahrten));
  const maxMon  = Math.max(...s.monate.map(x=>x.fahrten));
  const maxWoche = s.wochen.length ? Math.max(...s.wochen.map(x=>x.fahrten)) : 1;

  body.innerHTML = `
    <div class="st-section-title">Fahrten je Spedition</div>
    <table class="st-tab">
      <thead><tr>
        <th>Spedition</th><th class="num">Fahrten</th><th class="num">Anteil</th>
        <th class="num">Ø Kosten/Fahrt</th><th class="num">Kosten gesamt</th><th class="bar-col">Verteilung</th>
      </tr></thead>
      <tbody>
        ${s.speditionen.map(x=>`<tr>
          <td class="log-carrier">${escapeHtml(x.name)}</td>
          <td class="num strong">${fmtNum(x.fahrten)}</td>
          <td class="num">${(x.anteil*100).toFixed(1)}%</td>
          <td class="num">${fmtEur(x.schnitt)}</td>
          <td class="num">${fmtEur(x.kosten)}</td>
          <td class="bar-col"><div class="st-bar"><div class="st-bar-fill" style="width:${(x.fahrten/maxSped*100).toFixed(1)}%"></div></div></td>
        </tr>`).join('')}
      </tbody>
      <tfoot><tr>
        <td>Gesamt</td><td class="num strong">${fmtNum(s.gesamtFahrten)}</td><td class="num">100%</td>
        <td class="num">${fmtEur(s.gesamtKosten/s.gesamtFahrten)}</td>
        <td class="num strong">${fmtEur(s.gesamtKosten)}</td><td></td>
      </tr></tfoot>
    </table>

    <div class="st-section-title st-verlauf-head">
      <span>Verlauf je ${crmStatVerlauf==='woche'?'Kalenderwoche':'Monat'}</span>
      <span class="st-toggle">
        <button class="st-toggle-btn ${crmStatVerlauf==='monat'?'active':''}" data-v="monat">Monat</button>
        <button class="st-toggle-btn ${crmStatVerlauf==='woche'?'active':''}" data-v="woche">KW</button>
      </span>
    </div>
    <div class="st-chart${crmStatVerlauf==='woche'?' st-chart-week':''}">
      ${crmStatVerlauf==='woche'
        ? s.wochen.map(w=>`
            <div class="st-col" title="${w.label} / ${w.jahr}: ${fmtNum(w.fahrten)} Fahrten · ${fmtEur(w.kosten)}">
              <div class="st-col-val">${fmtNum(w.fahrten)}</div>
              <div class="st-col-bar" style="height:${Math.max(4, w.fahrten/maxWoche*100)}%"></div>
              <div class="st-col-lab">${w.kw}</div>
            </div>`).join('')
        : s.monate.map(m=>`
            <div class="st-col" title="${m.monat}: ${fmtNum(m.fahrten)} Fahrten · ${fmtEur(m.kosten)}">
              <div class="st-col-val">${fmtNum(m.fahrten)}</div>
              <div class="st-col-bar" style="height:${Math.max(4, m.fahrten/maxMon*100)}%"></div>
              <div class="st-col-lab">${m.monat.slice(5)}/${m.monat.slice(2,4)}</div>
            </div>`).join('')}
    </div>
    ${crmStatVerlauf==='woche' ? `<div class="st-verlauf-note">KW nach ISO 8601 (Woche beginnt montags)</div>` : ''}

    <div class="st-section-title">Aufteilung nach Warentyp</div>
    <table class="st-tab st-tab-compact">
      <thead><tr><th>Warentyp</th><th class="num">Fahrten</th><th class="num">Anteil</th><th class="num">Kosten</th><th class="bar-col"></th></tr></thead>
      <tbody>
        ${s.warentypen.map(w=>`<tr>
          <td><span class="cargo-badge cargo-${String(w.name).toLowerCase()}">${escapeHtml(w.name)}</span></td>
          <td class="num strong">${fmtNum(w.fahrten)}</td>
          <td class="num">${(w.anteil*100).toFixed(1)}%</td>
          <td class="num">${fmtEur(w.kosten)}</td>
          <td class="bar-col"><div class="st-bar"><div class="st-bar-fill" style="width:${(w.anteil*100).toFixed(1)}%"></div></div></td>
        </tr>`).join('')}
      </tbody>
    </table>

    <div class="st-actions">
      <button class="btn secondary" id="stExportCsv">Auswertung als CSV exportieren</button>
    </div>`;

  const exp = document.getElementById('stExportCsv');
  if(exp) exp.addEventListener('click', ()=> crmExportStatsCsv(s));

  // Umschaltung Monat / Kalenderwoche im Verlaufsdiagramm
  body.querySelectorAll('.st-toggle-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{ crmStatVerlauf = btn.dataset.v; crmRenderStats(); });
  });
}

// Auswertung als CSV herunterladen
function crmExportStatsCsv(s){
  const lines = [];
  lines.push(`Fahrten-Statistik;Zeitraum;${crmStatFilter.von} bis ${crmStatFilter.bis}`);
  lines.push(`Warentyp;${crmStatFilter.warentyp==='*'?'Alle':crmStatFilter.warentyp};Land;${crmStatFilter.land==='*'?'Alle':crmStatFilter.land}`);
  lines.push('');
  lines.push('Spedition;Fahrten;Anteil %;Ø Kosten je Fahrt (EUR);Kosten gesamt (EUR)');
  for(const x of s.speditionen){
    lines.push([x.name, x.fahrten, (x.anteil*100).toFixed(1), x.schnitt.toFixed(2), x.kosten.toFixed(2)].join(';'));
  }
  lines.push(['Gesamt', s.gesamtFahrten, '100.0',
    (s.gesamtKosten/s.gesamtFahrten).toFixed(2), s.gesamtKosten.toFixed(2)].join(';'));
  lines.push('');
  lines.push('Monat;Fahrten;Kosten (EUR)');
  for(const m of s.monate) lines.push([m.monat, m.fahrten, m.kosten.toFixed(2)].join(';'));
  lines.push('');
  lines.push('Kalenderwoche;Jahr;Fahrten;Kosten (EUR)');
  for(const w of (s.wochen||[])) lines.push([w.label, w.jahr, w.fahrten, w.kosten.toFixed(2)].join(';'));
  lines.push('');
  lines.push('Warentyp;Fahrten;Anteil %;Kosten (EUR)');
  for(const w of s.warentypen) lines.push([w.name, w.fahrten, (w.anteil*100).toFixed(1), w.kosten.toFixed(2)].join(';'));

  const blob = new Blob(['\ufeff' + lines.join('\n')], {type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Fahrten-Statistik_${crmStatFilter.von}_bis_${crmStatFilter.bis}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  crmToast('CSV-Datei wurde erstellt.');
}
