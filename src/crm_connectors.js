// ============================================================================
//  CRM-CONNECTORS — Datenquellen für tagesaktuelle Informationen
//    1. Excel-Upload      (sofort nutzbar, offline, via SheetJS)
//    2. SharePoint-Liste  (Microsoft Graph API — Konfiguration erforderlich)
//    3. Warenwirtschaft   (REST-API — Konfiguration erforderlich)
//  Alle drei liefern dieselbe Datenstruktur (kunden/umsaetze/produkte/logistik).
// ============================================================================

// Erwartete Excel-Blätter und Spalten (siehe CRM_Vorlage.xlsx)
const CRM_SHEETS = {
  Kunden:   ['KundenID','Kundenname','Strasse','PLZ','Ort','Land','EinheitLand','EinheitID','EinheitName','Ansprechpartner','Email','Telefon'],
  Umsaetze: ['KundenID','Jahr','Monat','Umsatz_EUR','Menge_LKW','Menge_Tonnen','Auftragsbestand_EUR'],
  Produkte: ['KundenID','Jahr','Monat','Produkt','Kategorie','Umsatz_EUR','Menge_Tonnen'],
  Logistik: ['EinheitLand','EinheitID','EinheitName','Spedition','Preis_EUR','Fahrten_YTD','Transportkosten_EUR'],
  Fahrten:  ['Datum','Spedition','EinheitLand','EinheitID','EinheitName','Warentyp','Fahrten','Kosten_EUR'],
};

function crmToast(msg, kind='ok'){
  let t = document.getElementById('crmToast');
  if(!t){
    t = document.createElement('div'); t.id='crmToast'; document.body.appendChild(t);
  }
  t.className = 'crm-toast ' + kind;
  t.textContent = msg;
  t.style.display = 'block';
  clearTimeout(t._to);
  t._to = setTimeout(()=>{ t.style.display='none'; }, 4200);
}

// ---------- 1. EXCEL-UPLOAD ----------
function crmHandleExcelUpload(ev){
  const file = ev.target.files && ev.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (e)=>{
    try{
      const wb = XLSX.read(new Uint8Array(e.target.result), {type:'array'});
      const parsed = { kunden:[], umsaetze:[], produkte:[], logistik:[], fahrten:[] };
      const map = {Kunden:'kunden', Umsaetze:'umsaetze', Umsätze:'umsaetze', Produkte:'produkte',
                   Logistik:'logistik', Fahrten:'fahrten'};
      let sheetsFound = 0;
      for(const sn of wb.SheetNames){
        const target = map[sn];
        if(!target) continue;
        sheetsFound++;
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], {defval:'', raw:false});
        parsed[target] = rows.map(crmCoerceRow.bind(null, target));
      }
      if(!sheetsFound){
        crmToast('Keine passenden Blätter gefunden (erwartet: Kunden, Umsaetze, Produkte, Logistik).', 'err');
        return;
      }
      // Übernehmen (ersetzt bestehende CRM-Daten)
      if(parsed.kunden.length)   CRM.kunden   = parsed.kunden;
      if(parsed.umsaetze.length) CRM.umsaetze = parsed.umsaetze;
      if(parsed.produkte.length) CRM.produkte = parsed.produkte;
      if(parsed.logistik.length) CRM.logistik = parsed.logistik;
      if(parsed.fahrten.length)  CRM.fahrten  = crmPackFahrten(parsed.fahrten);
      CRM.meta = Object.assign({}, CRM.meta, {
        generiert: new Date().toISOString().slice(0,10),
        quelle: 'Excel-Upload',
      });
      crmSave();
      crmApplyModule();
      crmRenderSidePanel();
      if(typeof renderMap==='function') renderMap();
      const nFahrten = CRM.fahrten ? CRM.fahrten.rows.reduce((a,r)=>a+r[4],0) : 0;
      crmToast(`CRM aktualisiert: ${CRM.kunden.length} Kunden, ${CRM.umsaetze.length} Umsatzsätze, ${CRM.produkte.length} Produkte, ${CRM.logistik.length} Logistikzeilen` + (nFahrten? `, ${nFahrten} Fahrten.` : '.'));
    }catch(err){
      console.error(err);
      crmToast('Fehler beim Lesen der Excel-Datei.', 'err');
    }
  };
  reader.readAsArrayBuffer(file);
  ev.target.value = '';
}

// Typkonvertierung je Zieltabelle (Zahlen als Number, IDs als String)
function crmCoerceRow(target, row){
  const numFields = {
    umsaetze: ['Jahr','Monat','Umsatz_EUR','Menge_LKW','Menge_Tonnen','Auftragsbestand_EUR'],
    produkte: ['Jahr','Monat','Umsatz_EUR','Menge_Tonnen'],
    logistik: ['Preis_EUR','Fahrten_YTD','Transportkosten_EUR'],
    fahrten:  ['Fahrten','Kosten_EUR'],
    kunden:   [],
  }[target] || [];
  const out = {};
  for(const k of Object.keys(row)){
    let v = row[k];
    if(numFields.includes(k)){
      if(typeof v === 'string') v = parseFloat(v.replace(/\./g,'').replace(',','.'));
      v = isNaN(v) ? 0 : v;
    } else if(k === 'Datum'){
      v = crmNormalizeDate(v);
    } else {
      v = (v===null||v===undefined) ? '' : String(v).trim();
    }
    out[k] = v;
  }
  return out;
}

// ---------- 2. SHAREPOINT (Microsoft Graph) — Skelett ----------
// Konfiguration wird aus localStorage 'crm::config-sharepoint' gelesen:
//   { tenantId, clientId, siteId, lists:{kunden,umsaetze,produkte,logistik} }
// Authentifizierung über MSAL.js (im Betrieb einzubinden). Hier nur Gerüst.
async function crmSyncSharePoint(){
  const cfg = crmGetConfig('sharepoint');
  if(!cfg || !cfg.siteId){
    throw new Error('SharePoint nicht konfiguriert. Bitte tenantId, clientId, siteId und Listennamen hinterlegen.');
  }
  // TODO (Betrieb): MSAL-Token holen
  //   const token = await msalInstance.acquireTokenSilent({scopes:['Sites.Read.All']});
  // TODO: je Liste GET /sites/{siteId}/lists/{listId}/items?expand=fields
  //   const res = await fetch(url, {headers:{Authorization:`Bearer ${token.accessToken}`}});
  // Die Feldnamen der SharePoint-Liste müssen den CRM_SHEETS-Spalten entsprechen.
  throw new Error('SharePoint-Anbindung ist vorbereitet, aber im Offline-Prototyp nicht aktiv. Siehe crm_connectors.js → crmSyncSharePoint().');
}

// ---------- 3. WARENWIRTSCHAFT (REST-API) — Skelett ----------
// Konfiguration 'crm::config-api': { baseUrl, apiKey, endpoints:{...} }
async function crmSyncErpApi(){
  const cfg = crmGetConfig('api');
  if(!cfg || !cfg.baseUrl){
    throw new Error('Warenwirtschafts-API nicht konfiguriert. Bitte baseUrl und apiKey hinterlegen.');
  }
  // TODO (Betrieb): parallele Fetches auf die vier Endpunkte
  //   const [k,u,p,l] = await Promise.all([
  //     fetch(cfg.baseUrl+cfg.endpoints.kunden,   {headers:{'X-Api-Key':cfg.apiKey}}).then(r=>r.json()),
  //     ...
  //   ]);
  // Antwort-Mapping auf die CRM-Struktur; anschließend crmSave() + renderMap().
  throw new Error('Warenwirtschafts-Anbindung ist vorbereitet, aber im Offline-Prototyp nicht aktiv. Siehe crm_connectors.js → crmSyncErpApi().');
}

// ---------- Konfig-Helfer ----------
function crmGetConfig(which){
  try{ return JSON.parse(localStorage.getItem('crm::config-'+which) || 'null'); }
  catch(e){ return null; }
}
function crmSetConfig(which, cfg){
  localStorage.setItem('crm::config-'+which, JSON.stringify(cfg));
}

// ---------- Dialog für SharePoint/API ----------
function crmConnectorDialog(which){
  const isSp = which==='sharepoint';
  const cfg = crmGetConfig(which) || {};
  const title = isSp ? 'SharePoint-Anbindung' : 'Warenwirtschafts-API';
  const fields = isSp
    ? [['tenantId','Tenant-ID'],['clientId','Client-ID (App-Registrierung)'],['siteId','SharePoint Site-ID'],
       ['listKunden','Listenname Kunden'],['listUmsaetze','Listenname Umsätze'],
       ['listProdukte','Listenname Produkte'],['listLogistik','Listenname Logistik']]
    : [['baseUrl','Basis-URL der API'],['apiKey','API-Schlüssel'],
       ['epKunden','Endpunkt Kunden'],['epUmsaetze','Endpunkt Umsätze'],
       ['epProdukte','Endpunkt Produkte'],['epLogistik','Endpunkt Logistik']];
  const overlay = document.getElementById('crmConfigModal');
  document.getElementById('crmConfigBody').innerHTML = `
    <div class="cfg-title">${title}<button class="cm-close" id="cfgClose">✕</button></div>
    <p class="cfg-intro">Zugangsdaten werden lokal im Browser gespeichert. Nach dem Speichern kann die Synchronisation im Betrieb aktiviert werden (siehe Architekturdokument).</p>
    ${fields.map(([k,l])=>`<label class="cfg-field"><span>${l}</span>
      <input type="text" data-k="${k}" value="${cfg[k]?String(cfg[k]).replace(/"/g,'&quot;'):''}"></label>`).join('')}
    <div class="cfg-actions">
      <button class="btn" id="cfgSave">Speichern</button>
      <button class="btn secondary" id="cfgTest">Verbindung testen</button>
    </div>
    <div class="cfg-status" id="cfgStatus"></div>`;
  overlay.style.display='flex';
  document.getElementById('cfgClose').addEventListener('click', ()=> overlay.style.display='none');
  document.getElementById('cfgSave').addEventListener('click', ()=>{
    const nc = {};
    overlay.querySelectorAll('input[data-k]').forEach(i=> nc[i.dataset.k]=i.value.trim());
    if(isSp){ nc.lists = {kunden:nc.listKunden,umsaetze:nc.listUmsaetze,produkte:nc.listProdukte,logistik:nc.listLogistik}; }
    else    { nc.endpoints = {kunden:nc.epKunden,umsaetze:nc.epUmsaetze,produkte:nc.epProdukte,logistik:nc.epLogistik}; }
    crmSetConfig(which, nc);
    crmToast('Konfiguration gespeichert.');
    overlay.style.display='none';
  });
  document.getElementById('cfgTest').addEventListener('click', async ()=>{
    const st = document.getElementById('cfgStatus');
    st.textContent = 'Teste Verbindung…';
    try{ await (isSp?crmSyncSharePoint():crmSyncErpApi()); st.textContent='Verbindung erfolgreich.'; st.className='cfg-status ok'; }
    catch(err){ st.textContent = err.message; st.className='cfg-status err'; }
  });
}


// Datumsangaben aus Excel auf ISO (YYYY-MM-DD) normalisieren
function crmNormalizeDate(v){
  if(v === null || v === undefined || v === '') return '';
  if(v instanceof Date) return v.toISOString().slice(0,10);
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(m) return s.slice(0,10);
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);          // TT.MM.JJJJ
  if(m) return `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);          // MM/TT/JJJJ
  if(m) return `${m[3]}-${String(m[1]).padStart(2,'0')}-${String(m[2]).padStart(2,'0')}`;
  if(/^\d+(\.\d+)?$/.test(s)){                              // Excel-Seriennummer
    const d = new Date(Date.UTC(1899, 11, 30) + parseFloat(s) * 86400000);
    if(!isNaN(d.getTime())) return d.toISOString().slice(0,10);
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0,10);
}
