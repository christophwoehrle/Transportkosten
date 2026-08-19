// ===================== DATEN LADEN =====================
const APP_DATA = JSON.parse(document.getElementById('app-data-script').textContent);
const COUNTRIES = APP_DATA.countries;
const EUROPE_BBOX = APP_DATA.europeBbox;
const PLZ_MAPPING = APP_DATA.plzMapping || {};
const EXCEL_UPLOAD_DATE = APP_DATA.excelUploadDate || null;
const COUNTRY_ORDER = ['Frankreich','Deutschland','Italien','Spanien','Portugal','Österreich','Schweiz','Slowenien','Belgien','Niederlande','Polen','UK','Irland','Schweden','Norwegen','Dänemark','Finnland','Island'];
const EUROPE_KEY = '__EUROPE__';
const DEFAULT_CARRIER = 'Standard';

// ===================== STATE =====================

// ===================== WARENTYP =====================
// Transportpreise werden je Warentyp getrennt geführt: Trockenfracht, Frischfracht
// (temperaturgeführt) und gemischte Ladung haben in der Regel unterschiedliche Sätze.
const CARGO_TYPES = ['Getrocknet', 'Frisch', 'Gemischt'];
const DEFAULT_CARGO = 'Gemischt';
const CARGO_KEY = 'active-cargo';

let state = {
  country: 'Frankreich',
  zoom: 1,
  pan: {x:0, y:0},
  selectedUnit: null, // {country, name, id}
  isZoomedToSelection: false,
  dragging: false,
  dragStart: null,
  panStart: null,
  carrier: DEFAULT_CARRIER,
  cargo: DEFAULT_CARGO,
};

const PRICE_STORAGE_PREFIX = 'price-history:';

// ===================== LOKALE PERSISTENZ (offline, ohne Internet/Server) =====================
// Diese Anwendung läuft als eigenständige HTML-Datei direkt im Browser (Doppelklick, file://).
// Es gibt daher keine Server- oder Cloud-Anbindung. Alle Preisdaten werden ausschließlich
// lokal im Browser des Nutzers über localStorage gespeichert - bleiben dort dauerhaft
// erhalten (auch nach Schließen des Browsers), sind aber an dieses Gerät/diesen Browser
// gebunden und werden nicht zwischen Geräten synchronisiert.
const LOCAL_DB_PREFIX = 'transportpreis-atlas::';

// Verfügbarkeit von localStorage prüfen (kann z.B. in manchen privaten Browser-Modi blockiert sein).
// Falls nicht verfügbar, wird ein reiner Arbeitsspeicher-Fallback genutzt - die Anwendung bleibt
// dann innerhalb der aktuellen Browser-Sitzung funktionsfähig, Einträge gehen aber beim Schließen verloren.
let storageAvailable = true;
try{
  const testKey = LOCAL_DB_PREFIX + '__test__';
  localStorage.setItem(testKey, '1');
  localStorage.removeItem(testKey);
}catch(e){
  storageAvailable = false;
}
const memoryFallback = {};

const localDb = {
  async get(key){
    if(!storageAvailable){
      if(!(key in memoryFallback)) throw new Error('not found');
      return { key, value: memoryFallback[key] };
    }
    const raw = localStorage.getItem(LOCAL_DB_PREFIX + key);
    if(raw === null) throw new Error('not found');
    return { key, value: raw };
  },
  async set(key, value){
    if(!storageAvailable){
      memoryFallback[key] = value;
      return { key, value };
    }
    localStorage.setItem(LOCAL_DB_PREFIX + key, value);
    return { key, value };
  },
  async delete(key){
    if(!storageAvailable){
      delete memoryFallback[key];
      return { key, deleted:true };
    }
    localStorage.removeItem(LOCAL_DB_PREFIX + key);
    return { key, deleted:true };
  },
  async list(prefix){
    if(!storageAvailable){
      return { keys: Object.keys(memoryFallback).filter(k=>!prefix||k.startsWith(prefix)) };
    }
    const keys = [];
    for(let i=0;i<localStorage.length;i++){
      const k = localStorage.key(i);
      if(k && k.startsWith(LOCAL_DB_PREFIX)){
        const bare = k.slice(LOCAL_DB_PREFIX.length);
        if(!prefix || bare.startsWith(prefix)) keys.push(bare);
      }
    }
    return { keys };
  }
};

// ===================== PROJEKTION =====================
// Einfache Mercator-ähnliche Projektion (äquidistante Plattkarte mit Breitenkorrektur)
// Wir projizieren jedes Land separat in sein eigenes ViewBox-Koordinatensystem (0..1000 x 0..700)
const VB_W = 1000, VB_H = 700, VB_PAD = 40;

function project(lon, lat, bbox){
  const [minx,miny,maxx,maxy] = bbox;
  const w = maxx-minx, h = maxy-miny;
  const midLat = (miny+maxy)/2;
  const latCorrection = Math.cos(midLat*Math.PI/180);
  // X skaliert mit latCorrection, damit Längengrade bei der geografischen Breite stimmen
  const effW = w*latCorrection;
  const scale = Math.min((VB_W-2*VB_PAD)/effW, (VB_H-2*VB_PAD)/h);
  const cx = (minx+maxx)/2, cy=(miny+maxy)/2;
  const x = VB_W/2 + (lon-cx)*latCorrection*scale;
  const y = VB_H/2 - (lat-cy)*scale;
  return [x,y];
}

function ringToPath(ring, bbox){
  return ring.map((pt,i)=>{
    const [x,y] = project(pt[0], pt[1], bbox);
    return (i===0?'M':'L') + x.toFixed(2) + ',' + y.toFixed(2);
  }).join(' ') + ' Z';
}

function geometryToPathD(geometry, bbox){
  if(geometry.type === 'Polygon'){
    return geometry.coordinates.map(ring=>ringToPath(ring,bbox)).join(' ');
  } else if(geometry.type === 'MultiPolygon'){
    return geometry.coordinates.map(poly=>poly.map(ring=>ringToPath(ring,bbox)).join(' ')).join(' ');
  }
  return '';
}

// ===================== FLAG GRADIENTS =====================
function ensureGradient(countryName){
  const defs = document.getElementById('svgDefs');
  const gradId = 'grad-' + countryName.replace(/[^a-zA-Z0-9]/g,'');
  if(document.getElementById(gradId)) return gradId;
  const colors = COUNTRIES[countryName].flag;
  const grad = document.createElementNS('http://www.w3.org/2000/svg','linearGradient');
  grad.setAttribute('id', gradId);
  grad.setAttribute('x1','0%'); grad.setAttribute('y1','0%');
  grad.setAttribute('x2','100%'); grad.setAttribute('y2','100%');
  colors.forEach((c,i)=>{
    const stop = document.createElementNS('http://www.w3.org/2000/svg','stop');
    stop.setAttribute('offset', (i/(colors.length-1)*100)+'%');
    stop.setAttribute('stop-color', c);
    grad.appendChild(stop);
  });
  defs.appendChild(grad);
  return gradId;
}

// ===================== RENDERING =====================
function currentBBox(){
  if(state.country === EUROPE_KEY) return EUROPE_BBOX;
  return COUNTRIES[state.country].bbox;
}

function renderCountryTabs(){
  const wrap = document.getElementById('countryTabs');
  wrap.innerHTML = '';

  // Europa-Gesamtansicht als erster, hervorgehobener Tab
  const europeBtn = document.createElement('button');
  europeBtn.className = 'country-tab europe-tab' + (state.country===EUROPE_KEY ? ' active':'');
  const europeDot = document.createElement('span');
  europeDot.className = 'flag-dot';
  europeDot.style.background = 'linear-gradient(135deg, #003399, #FFCC00)';
  europeBtn.appendChild(europeDot);
  europeBtn.appendChild(document.createTextNode('Gesamteuropa'));
  europeBtn.addEventListener('click', ()=>{
    state.country = EUROPE_KEY;
    state.zoom = 1; state.pan = {x:0,y:0};
    state.isZoomedToSelection = false;
    state.selectedUnit = null;
    populateSelectors();
    renderCountryTabs();
    renderMap();
    updateResultCard();
  });
  wrap.appendChild(europeBtn);

  const sep = document.createElement('span');
  sep.className = 'tab-separator';
  wrap.appendChild(sep);

  COUNTRY_ORDER.forEach(name=>{
    if(!COUNTRIES[name]) return;
    const btn = document.createElement('button');
    btn.className = 'country-tab' + (name===state.country ? ' active':'');
    const dot = document.createElement('span');
    dot.className = 'flag-dot';
    dot.style.background = `linear-gradient(135deg, ${COUNTRIES[name].flag.join(',')})`;
    btn.appendChild(dot);
    btn.appendChild(document.createTextNode(name));
    btn.addEventListener('click', ()=>{
      state.country = name;
      state.zoom = 1; state.pan = {x:0,y:0};
      state.isZoomedToSelection = false;
      state.selectedUnit = null;
      populateSelectors();
      renderCountryTabs();
      renderMap();
      updateResultCard();
    });
    wrap.appendChild(btn);
  });
}

function renderMap(){
  const layer = document.getElementById('mapLayer');
  layer.innerHTML = '';
  const bbox = currentBBox();
  const isEurope = state.country === EUROPE_KEY;
  const countriesToRender = isEurope ? COUNTRY_ORDER.filter(n=>COUNTRIES[n]) : [state.country];

  countriesToRender.forEach(country=>{
    const gradId = ensureGradient(country);
    const units = COUNTRIES[country].units;

    units.forEach(u=>{
      const d = geometryToPathD(u.geometry, bbox);
      const path = document.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('d', d);
      const crmActive = (typeof crmModule !== 'undefined' && crmModule !== 'preise');
      const logistikMode = (typeof crmModule !== 'undefined' && crmModule === 'logistik');
      const priceVal = effectivePrice(state.carrier, country, u);
      let hasPrice = priceVal !== null && priceVal !== undefined;
      // Umsatz-Modus: Einfärbung nach vorhandenem Umsatz. Logistik + Ausgangsfrachten:
      // Einfärbung nach vorhandenem Frachtpreis (identische Darstellung).
      const hasRevenue = crmActive && !logistikMode && typeof unitRevenueSum === 'function' && !!unitRevenueSum(country, u.name);
      const crmHas = crmActive && !logistikMode && (hasRevenue || (typeof crmUnitHasData==='function' && crmUnitHasData(country, u.id, u.name)));
      let cls = 'unit-path' + ((crmActive && !logistikMode) ? (crmHas ? ' has-crm':'') : (hasPrice ? ' has-price':''));
      const isSelected = state.selectedUnit && state.selectedUnit.country===country && state.selectedUnit.name===u.name;
      if(isSelected){
        cls += ' selected';
        path.style.stroke = `url(#${gradId})`;
        path.dataset.selectedStroke = '1';
      }
      path.setAttribute('class', cls);
      path.dataset.name = u.name;
      path.dataset.id = u.id || '';
      path.dataset.country = country;
      path.addEventListener('click', ()=>{
        // Im CRM-/Logistik-Modus öffnet ein Klick die Detailansicht
        if(typeof crmModule !== 'undefined' && crmModule !== 'preise' && typeof crmOpenDetail === 'function'){
          crmOpenDetail(country, u);
          if(isEurope) document.getElementById('selCountry').value = country;
          return;
        }
        // In der Gesamteuropa-Ansicht öffnet ein Klick die Länder-Unteransicht.
        if(isEurope){
          goToCountry(country);
          return;
        }
        selectUnit(country, u.name, u.id);
      });
      path.addEventListener('mousemove', (ev)=> showTooltip(ev, u, isEurope ? country : null, priceVal));
      path.addEventListener('mouseleave', hideTooltip);
      // In Europa: Hover hebt die gesamte Landgrenze in Flaggenfarben hervor.
      if(isEurope){
        path.addEventListener('mouseenter', ()=> highlightCountryBorder(country, true));
        path.addEventListener('mouseleave', ()=> highlightCountryBorder(country, false));
      }
      // In der Länderansicht: Hover vergrößert den zugehörigen Ø-Preis.
      if(!isEurope){
        path.addEventListener('mouseenter', ()=> highlightFreightLabel(u.name, true));
        path.addEventListener('mouseleave', ()=> highlightFreightLabel(u.name, false));
      }
      layer.appendChild(path);

      // Label je Modul:
      //  · Umsatz    → Umsatzsumme je Einheit (Σ, aus Umsatz.xls)
      //  · Logistik  → dieselben Frachtpreise wie "Ausgangsfrachten"
      //  · Ausgangsfrachten → Frachtpreis (Ø je Einheit)
      // WICHTIG: In der Gesamteuropa-Ansicht werden KEINE Einzel-Einheit-Labels
      // gezeichnet — dort erscheint nur eine Gesamtsumme pro Land (weiter unten).
      const isLogistik = (typeof crmModule !== 'undefined' && crmModule === 'logistik');
      const isUmsatz   = crmActive && !isLogistik;
      let labelText = null;
      let labelIsHighlight = false;   // Umsatz/Ø-Preis → über Nadeln, Hover-Zoom
      if(isEurope){
        labelText = null;             // in Europa keine Einzelwerte je Einheit
      } else if(isUmsatz){
        const rev = (typeof unitRevenueSum === 'function') ? unitRevenueSum(country, u.name) : null;
        if(rev && rev.sum > 0){
          const s = rev.sum;
          labelText = 'Σ ' + (s>=1000 ? Math.round(s/1000).toLocaleString('de-DE')+'k' : Math.round(s)) + '€';
          labelIsHighlight = true;
        } else if(crmHas){
          const st = crmUnitStats(country, u.id, u.name);
          if(st.umsatzYtd > 0) labelText = (st.umsatzYtd>=1000? Math.round(st.umsatzYtd/1000)+'k' : Math.round(st.umsatzYtd)) + '€';
        }
      } else if(typeof unitFreightAvg === 'function'){
        // Länderansicht (Ausgangsfrachten + Logistik): Ø-Frachtpreis aller Fahrten
        // in diese Einheit (z. B. Ø aller Fahrten nach Departement 85 / Vendée).
        const fa = unitFreightAvg(country, u.name);
        if(fa){
          labelText = 'Ø ' + Math.round(fa.avg).toLocaleString('de-DE') + '€';
          labelIsHighlight = true;
        } else if(hasPrice){
          labelText = Math.round(priceVal) + '€';
        }
      } else if(hasPrice){
        labelText = Math.round(priceVal) + '€';
      }
      if(labelText){
        const centroid = getPathCentroidApprox(u.geometry, bbox);
        if(centroid){
          const txt = document.createElementNS('http://www.w3.org/2000/svg','text');
          txt.setAttribute('class','price-label' + (isEurope ? ' price-label-europe':'') + (crmActive?' crm-label':'') + (labelIsHighlight?' freight-avg-label':''));
          txt.setAttribute('text-anchor','middle');
          txt.dataset.cx = centroid[0];
          txt.dataset.cy = centroid[1];
          if(labelIsHighlight) txt.dataset.unit = u.name;
          txt.textContent = labelText;
          layer.appendChild(txt);
        }
      }
    });
  });

  // Kunden-Stecknadeln (nur ab Länderansicht)
  if(typeof renderCustomerPins === 'function') renderCustomerPins(layer, bbox, isEurope);

  // ─────────────────────────────────────────────────────────────────────────
  // Gesamteuropa-Ansicht: pro Land NUR EINE Gesamtsumme anzeigen.
  //   · Ausgangsfrachten / Logistik → Summe der Frachtpreise des Landes
  //   · Umsatz                       → Umsatzsumme des Landes (YTD)
  // Maus-over vergrößert die Zahl und hebt die Landesgrenze hervor; ein Klick
  // zoomt in die Länderebene (Departements / Bundesländer).
  // ─────────────────────────────────────────────────────────────────────────
  const euUmsatz = (typeof crmModule !== 'undefined' && crmModule === 'crm');
  if(isEurope && (typeof countryFreightTotal === 'function')){
    countriesToRender.forEach(country=>{
      let value = 0;
      if(euUmsatz){
        const rev = (typeof countryRevenue === 'function') ? countryRevenue(country) : null;
        value = rev ? rev.ytd : 0;
      } else {
        const ft = countryFreightTotal(country);
        value = ft ? ft.sum : 0;
      }
      if(!value || value <= 0) return;

      const bb = COUNTRIES[country].bbox;
      const cx = (bb[0]+bb[2])/2, cy = (bb[1]+bb[3])/2;
      const [px, py] = project(cx, cy, bbox);

      const g = document.createElementNS('http://www.w3.org/2000/svg','g');
      g.setAttribute('class','country-total-label' + (euUmsatz?' is-umsatz':' is-fracht'));
      g.dataset.px = px; g.dataset.py = py;
      g.dataset.country = country;

      const fmtVal = (v)=> (v>=1000000)
        ? (v/1000000).toLocaleString('de-DE',{maximumFractionDigits:1})+' Mio €'
        : (v>=1000 ? Math.round(v/1000).toLocaleString('de-DE')+'k €' : Math.round(v)+' €');

      const txt = document.createElementNS('http://www.w3.org/2000/svg','text');
      txt.setAttribute('class','ctl-value'); txt.setAttribute('text-anchor','middle');
      txt.textContent = fmtVal(value);
      g.appendChild(txt);
      layer.appendChild(g);

      // Interaktion: Hover vergrößert + hebt Landesgrenze hervor, Klick zoomt hinein
      g.style.cursor = 'pointer';
      g.addEventListener('mouseenter', ()=>{
        g.classList.add('ctl-hover');
        txt.style.fontSize = '26px';
        txt.style.strokeWidth = '5.5px';
        layer.appendChild(g);   // nach vorne holen
        if(typeof highlightCountryBorder === 'function') highlightCountryBorder(country, true);
      });
      g.addEventListener('mouseleave', ()=>{
        g.classList.remove('ctl-hover');
        txt.style.fontSize = '';
        txt.style.strokeWidth = '';
        if(typeof highlightCountryBorder === 'function') highlightCountryBorder(country, false);
      });
      g.addEventListener('click', (ev)=>{ ev.stopPropagation(); goToCountry(country); });
    });
  }

  // Frachtkosten-Mittelwerte über die Nadeln legen: in SVG liegt zuletzt
  // Eingefügtes oben, daher werden die Ø-Labels nach den Nadeln ans Ende gehängt.
  layer.querySelectorAll('text.freight-avg-label').forEach(t=> layer.appendChild(t));

  applyTransform();
}

// Grobe Centroid-Approximation (Durchschnitt der äußeren Ringpunkte) - reicht für Preis-Label-Platzierung
function getPathCentroidApprox(geometry, bbox){
  let ring;
  if(geometry.type === 'Polygon'){
    ring = geometry.coordinates[0];
  } else if(geometry.type === 'MultiPolygon'){
    // größtes Polygon nehmen
    let best = geometry.coordinates[0][0], bestLen = best.length;
    geometry.coordinates.forEach(poly=>{
      if(poly[0].length > bestLen){ best = poly[0]; bestLen = poly[0].length; }
    });
    ring = best;
  } else return null;
  let sx=0, sy=0;
  ring.forEach(pt=>{
    const [x,y] = project(pt[0], pt[1], bbox);
    sx += x; sy += y;
  });
  return [sx/ring.length, sy/ring.length];
}

function applyTransform(){
  const layer = document.getElementById('mapLayer');
  const tx = state.pan.x, ty = state.pan.y, sc = state.zoom;
  const isEurope = state.country === EUROPE_KEY;
  // Pfade (Gebiete) werden normal transformiert
  layer.querySelectorAll('path.unit-path').forEach(p=>{
    p.setAttribute('transform', `translate(${tx},${ty}) scale(${sc})`);
    // Strichbreite optisch konstant halten
    p.style.strokeWidth = p.dataset.selectedStroke ? (4/sc).toFixed(3) : (0.7/sc).toFixed(3);
  });
  // Labels: Position folgt der Karte, Schriftgröße bleibt konstant (Gegenskalierung)
  // In der Europa-Gesamtansicht werden Preis-Labels erst ab einer gewissen Zoomstufe eingeblendet,
  // da sonst 65+ Labels bei der Übersicht visuell überladen wirken.
  const showLabels = !isEurope || sc >= 2.2;
  layer.querySelectorAll('text.price-label').forEach(t=>{
    const cx = parseFloat(t.dataset.cx), cy = parseFloat(t.dataset.cy);
    const screenX = cx*sc + tx, screenY = cy*sc + ty;
    t.setAttribute('x', screenX);
    t.setAttribute('y', screenY);
    t.style.display = showLabels ? '' : 'none';
  });

  // Kunden-Stecknadeln mitführen (Position folgt der Karte, Nadel bleibt konstant groß)
  if(typeof transformCustomerPins === 'function') transformCustomerPins(tx, ty, sc);

  // Länder-Umsatz-Labels (Europa/CRM) mitführen — konstante Größe
  layer.querySelectorAll('.country-total-label').forEach(g=>{
    const px = parseFloat(g.dataset.px), py = parseFloat(g.dataset.py);
    g.setAttribute('transform', `translate(${(px*sc+tx).toFixed(1)},${(py*sc+ty).toFixed(1)})`);
  });
}

// ===================== TOOLTIP =====================
function showTooltip(ev, unit, countryLabel, priceVal){
  const tip = document.getElementById('tooltip');
  tip.style.display = 'block';
  // Im CRM- oder Logistik-Modus die CRM-Kennzahlen anzeigen
  if(typeof crmModule !== 'undefined' && crmModule !== 'preise' && typeof crmTooltipHtml === 'function'){
    const country = countryLabel || state.country;
    tip.classList.add('tooltip-crm');
    tip.innerHTML = crmTooltipHtml(country, unit);
    return;
  }
  tip.classList.remove('tooltip-crm');
  const priceText = (priceVal!==null && priceVal!==undefined) ? Math.round(priceVal)+' €' : 'kein Preis erfasst';
  const countryLine = countryLabel ? `<br><span style="opacity:.6;font-size:11px;">${countryLabel}</span>` : '';
  tip.innerHTML = `<b>${unit.name}</b>${countryLine}<br>${priceText}`;
}
function hideTooltip(){
  document.getElementById('tooltip').style.display = 'none';
}

// Wechselt aus der Gesamteuropa-Ansicht in die Unteransicht eines Landes.
function goToCountry(country){
  if(!COUNTRIES[country]) return;
  state.country = country;
  state.zoom = 1; state.pan = {x:0,y:0};
  state.isZoomedToSelection = false;
  state.selectedUnit = null;
  const sel = document.getElementById('selCountry');
  if(sel) sel.value = country;
  populateSelectors();
  renderCountryTabs();
  renderMap();
  updateResultCard();
}

// Hebt in der Europa-Ansicht die gesamte Grenze eines Landes hervor: alle
// Einheiten-Pfade des Landes bekommen einen Rand im Flaggen-Farbverlauf.
function highlightCountryBorder(country, on){
  const layer = document.getElementById('mapLayer');
  if(!layer) return;
  const gradId = (typeof ensureGradient === 'function') ? ensureGradient(country) : null;
  layer.querySelectorAll('path.unit-path[data-country="'+CSS.escape(country)+'"]').forEach(p=>{
    if(on){
      p.classList.add('country-hover');
      if(gradId && !p.dataset.selectedStroke) p.style.stroke = 'url(#'+gradId+')';
    } else {
      p.classList.remove('country-hover');
      if(!p.dataset.selectedStroke) p.style.stroke = '';
    }
  });
}

// Vergrößert den Ø-Frachtpreis des überfahrenen Departements (Hover-Effekt).
// Das Label wird zusätzlich nach ganz oben geholt, damit es über den Nadeln und
// Nachbar-Labels liegt.
function highlightFreightLabel(unitName, on){
  const layer = document.getElementById('mapLayer');
  if(!layer) return;
  layer.querySelectorAll('text.freight-avg-label').forEach(t=>{
    if(t.dataset.unit === unitName){
      t.classList.toggle('label-hover', on);
      if(on) layer.appendChild(t);      // nach oben holen
    }
  });
}

// ===================== SELECTORS (A/B/C) =====================
function unitKey(country, name){ return country + '::' + name; }
function splitUnitKey(key){
  const idx = key.indexOf('::');
  return [key.slice(0,idx), key.slice(idx+2)];
}

function populateSelectors(){
  const selCountry = document.getElementById('selCountry');
  if(selCountry.options.length===0){
    const europeOpt = document.createElement('option');
    europeOpt.value = EUROPE_KEY; europeOpt.textContent = 'Gesamteuropa';
    selCountry.appendChild(europeOpt);
    COUNTRY_ORDER.forEach(name=>{
      if(!COUNTRIES[name]) return;
      const opt = document.createElement('option');
      opt.value = name; opt.textContent = name;
      selCountry.appendChild(opt);
    });
  }
  selCountry.value = state.country;

  const isEurope = state.country === EUROPE_KEY;
  const countriesInScope = isEurope ? COUNTRY_ORDER.filter(n=>COUNTRIES[n]) : [state.country];

  // Flache Liste aller Einheiten im aktuellen Geltungsbereich (ein Land oder ganz Europa)
  let allUnits = [];
  countriesInScope.forEach(c=>{
    COUNTRIES[c].units.forEach(u=> allUnits.push({country:c, unit:u}));
  });

  const byId = allUnits.slice().sort((a,b)=> String(a.unit.id||'').localeCompare(String(b.unit.id||''), undefined, {numeric:true}));
  const byName = allUnits.slice().sort((a,b)=> a.unit.name.localeCompare(b.unit.name,'de'));

  const selId = document.getElementById('selId');
  const selName = document.getElementById('selName');
  selId.innerHTML = '<option value="">—</option>';
  selName.innerHTML = '<option value="">—</option>';

  byId.forEach(({country,unit})=>{
    if(!unit.id) return;
    const opt = document.createElement('option');
    opt.value = unitKey(country, unit.name);
    opt.textContent = isEurope ? `${unit.id} — ${unit.name} (${country})` : (unit.id + ' — ' + unit.name);
    selId.appendChild(opt);
  });
  byName.forEach(({country,unit})=>{
    const opt = document.createElement('option');
    opt.value = unitKey(country, unit.name);
    opt.textContent = isEurope ? `${unit.name} (${country})` : unit.name;
    selName.appendChild(opt);
  });

  if(state.selectedUnit && countriesInScope.includes(state.selectedUnit.country)){
    const k = unitKey(state.selectedUnit.country, state.selectedUnit.name);
    selId.value = k;
    selName.value = k;
  } else {
    selId.value=''; selName.value='';
  }
}

// Beim Start: für jede Einheit und Spedition prüfen, ob in der lokalen Datenbank bereits ein
// zuvor erfasster Preis vorliegt. Die Kartenanzeige zeigt stets den Preis der aktuell
// gewählten Spedition (state.carrier) - dafür wird der Preis NICHT mehr direkt im unit-Objekt
// gespeichert, sondern bei jedem Render frisch aus der Datenbank für den aktiven Carrier gelesen.
function getStoredPrice(carrier, country, unit, cargo){
  try{
    const raw = localStorage.getItem(LOCAL_DB_PREFIX + priceKey(carrier, cargo || state.cargo, country, unit.name, unit.id));
    if(raw){
      const history = JSON.parse(raw);
      if(history.length > 0) return history[history.length-1].price;
    }
  }catch(e){ /* ignore */ }
  return null;
}

function effectivePrice(carrier, country, unit, cargo){
  const c = cargo || state.cargo;
  const stored = getStoredPrice(carrier, country, unit, c);
  if(stored !== null) return stored;
  // Fallback: Ursprungswert aus der Excel-Tabelle nur für den Standard-Carrier
  // und nur für den Standard-Warentyp (die Ursprungsdaten kannten keinen Warentyp).
  if(carrier === DEFAULT_CARRIER && c === DEFAULT_CARGO) return unit.preis;
  return null;
}

// Liefert Preis UND Datum/Quelle des letzten Updates gemeinsam - für die Anzeige
// "wann wurde dieser Preis zuletzt aktualisiert" in der Sidebar.
function effectivePriceInfo(carrier, country, unit, cargo){
  const cg = cargo || state.cargo;
  try{
    const raw = localStorage.getItem(LOCAL_DB_PREFIX + priceKey(carrier, cg, country, unit.name, unit.id));
    if(raw){
      const history = JSON.parse(raw);
      if(history.length > 0){
        const last = history[history.length-1];
        return {price: last.price, date: last.date, source: last.source || 'manuell',
                floater: (last.floater != null ? last.floater : 0)};
      }
    }
  }catch(e){ /* ignore */ }
  if(carrier === DEFAULT_CARRIER && cg === DEFAULT_CARGO && unit.preis !== null && unit.preis !== undefined){
    return {price: unit.preis, date: EXCEL_UPLOAD_DATE, source: 'original', floater: 0};
  }
  return {price: null, date: null, source: null, floater: 0};
}

// Bruttopreis inkl. Diesel-Floater (prozentualer Aufschlag on top).
function grossPrice(netPrice, floater){
  if(netPrice == null || isNaN(netPrice)) return null;
  const f = floater || 0;
  return netPrice * (1 + f);
}

function formatUpdateDate(isoDate){
  if(!isoDate) return '';
  try{
    const d = new Date(isoDate + 'T00:00:00');
    return d.toLocaleDateString('de-DE', {day:'2-digit', month:'2-digit', year:'numeric'});
  }catch(e){ return isoDate; }
}

// Gültigkeitsfenster: 4 Wochen = 28 Tage ab heute rückwärts.
// Preise die älter als dieser Stichtag sind gelten als "abgelaufen" und werden
// im Kärtchen entsprechend markiert, aber weiterhin angezeigt (nicht verworfen).
const VALIDITY_DAYS = 28;

function priceValidityWindow(){
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - VALIDITY_DAYS);
  return cutoff.toISOString().slice(0, 10); // ISO-String "YYYY-MM-DD"
}

function isPriceValid(isoDate){
  if(!isoDate) return false;
  return isoDate >= priceValidityWindow();
}

function daysUntilExpiry(isoDate){
  if(!isoDate) return null;
  const cutoff = new Date(priceValidityWindow() + 'T00:00:00');
  const priceDate = new Date(isoDate + 'T00:00:00');
  const expiryDate = new Date(priceDate.getTime() + VALIDITY_DAYS * 86400 * 1000);
  const diff = Math.round((expiryDate - new Date()) / 86400000);
  return diff; // positiv = noch gültig, negativ = abgelaufen vor N Tagen
}

// Sucht über ALLE bekannten Speditionen hinweg den neuesten GÜLTIGEN Preis
// (innerhalb der letzten 4 Wochen). Falls kein gültiger Preis existiert, wird
// der neueste abgelaufene Preis als Fallback zurückgegeben (mit expired-Flag).
function bestPriceInfo(country, unit, cargo){
  const cg = cargo || state.cargo;
  const carriers = loadCarriers();
  let bestValid   = null;  // bester gültiger Preis (≤ 28 Tage alt)
  let bestExpired = null;  // neuester abgelaufener Preis (als Fallback)

  for(const carrier of carriers){
    try{
      const raw = localStorage.getItem(LOCAL_DB_PREFIX + priceKey(carrier, cg, country, unit.name, unit.id));
      if(!raw) continue;
      const history = JSON.parse(raw);
      if(!history.length) continue;
      const last = history[history.length-1];
      const valid = isPriceValid(last.date);
      if(valid){
        if(!bestValid || last.date > bestValid.date)
          bestValid = {price: last.price, date: last.date, source: last.source || 'manuell', carrier, expired: false};
      } else {
        if(!bestExpired || last.date > bestExpired.date)
          bestExpired = {price: last.price, date: last.date, source: last.source || 'manuell', carrier, expired: true};
      }
    }catch(e){ /* ignore */ }
  }

  // Fallback: Excel-Ursprungswert (Standard-Carrier), ebenfalls mit Gültigkeitsprüfung
  if(!bestValid && !bestExpired && unit.preis !== null && unit.preis !== undefined){
    const valid = isPriceValid(EXCEL_UPLOAD_DATE);
    const entry = {price: unit.preis, date: EXCEL_UPLOAD_DATE, source: 'original',
                   carrier: DEFAULT_CARRIER, expired: !valid};
    if(valid) bestValid = entry; else bestExpired = entry;
  }

  return bestValid || bestExpired || null;
}

document.addEventListener('DOMContentLoaded', init);

function init(){
  migrateLegacyPrices();          // Alt-Preise ohne Warentyp übernehmen
  preloadUploadedCarriersIfFirstRun();
  initCarriers();
  setupCargoSelector();           // Warentyp: Getrocknet / Frisch / Gemischt
  setupPlzInput();
  setupExcelUpload();
  populateSelectors();
  renderCountryTabs();
  renderMap();
  updateResultCard();
  updateStamp();

  document.getElementById('selCountry').addEventListener('change', (e)=>{
    state.country = e.target.value;
    state.zoom = 1; state.pan={x:0,y:0};
    state.isZoomedToSelection = false;
    state.selectedUnit = null;
    populateSelectors();
    renderCountryTabs();
    renderMap();
    updateResultCard();
  });

  document.getElementById('selId').addEventListener('change', (e)=>{
    if(!e.target.value) return;
    const [country, name] = splitUnitKey(e.target.value);
    const u = COUNTRIES[country].units.find(u=>u.name===name);
    selectUnit(country, u.name, u.id);
  });
  document.getElementById('selName').addEventListener('change', (e)=>{
    if(!e.target.value) return;
    const [country, name] = splitUnitKey(e.target.value);
    const u = COUNTRIES[country].units.find(u=>u.name===name);
    selectUnit(country, u.name, u.id);
  });

  document.getElementById('btnZoom').addEventListener('click', zoomToSelection);
  document.getElementById('btnReset').addEventListener('click', resetView);
  document.getElementById('btnZoomIn').addEventListener('click', ()=>{ state.zoom = Math.min(state.zoom*1.4, 12); applyTransform(); });
  document.getElementById('btnZoomOut').addEventListener('click', ()=>{ state.zoom = Math.max(state.zoom/1.4, 1); if(state.zoom===1){state.pan={x:0,y:0};} applyTransform(); });
  document.getElementById('btnCenter').addEventListener('click', ()=>{
    // Ansicht zentrieren: Verschiebung und Zoom zurücksetzen (Auswahl bleibt erhalten)
    state.zoom = 1; state.pan = {x:0, y:0};
    applyTransform();
  });

  document.getElementById('btnSavePrice').addEventListener('click', saveNewPrice);

  setupPanZoomHandlers();

  // ---- CRM-Modul initialisieren ----
  if(typeof crmPreloadIfEmpty === 'function'){
    crmPreloadIfEmpty();
    crmSetupModuleSwitcher();
    crmApplyModule();
    // ESC schließt Detail-Modal
    document.addEventListener('keydown', (e)=>{
      if(e.key!=='Escape') return;
      if(typeof crmCloseDetail==='function') crmCloseDetail();
      if(typeof crmCloseStats==='function') crmCloseStats();
    });
    const statsModal = document.getElementById('crmStatsModal');
    if(statsModal) statsModal.addEventListener('click', (e)=>{ if(e.target===statsModal) crmCloseStats(); });
    // Klick auf Modal-Hintergrund schließt
    const modal = document.getElementById('crmModal');
    if(modal) modal.addEventListener('click', (e)=>{ if(e.target===modal) crmCloseDetail(); });
    const cfgModal = document.getElementById('crmConfigModal');
    if(cfgModal) cfgModal.addEventListener('click', (e)=>{ if(e.target===cfgModal) cfgModal.style.display='none'; });
  }
}

function selectUnit(country, name, id){
  state.selectedUnit = {country, name, id};
  state.isZoomedToSelection = false;
  const k = unitKey(country, name);
  document.getElementById('selId').value = k;
  document.getElementById('selName').value = k;
  document.getElementById('btnZoom').disabled = false;
  renderMap();
  updateResultCard();
}

function updateResultCard(){
  const card = document.getElementById('resultCard');
  const editBlock = document.getElementById('editPriceBlock');
  const historyBlock = document.getElementById('historyBlock');

  if(!state.selectedUnit){
    card.className = 'result-card empty';
    card.innerHTML = 'Wählen Sie ein Land, eine Nummer oder einen Namen, um eine Verwaltungseinheit auf der Karte zu markieren.';
    editBlock.style.display = 'none';
    historyBlock.style.display = 'none';
    document.getElementById('btnZoom').disabled = true;
    return;
  }

  const {country, name, id} = state.selectedUnit;
  const unit = COUNTRIES[country].units.find(u=>u.name===name);
  const info = effectivePriceInfo(state.carrier, country, unit);
  const best = bestPriceInfo(country, unit);
  const priceVal = info.price;
  card.className = 'result-card';
  const hasPrice = priceVal !== null && priceVal !== undefined;

  // Gültigkeit des eigenen Preises prüfen
  const ownValid   = hasPrice && isPriceValid(info.date);
  const ownExpDays = hasPrice ? daysUntilExpiry(info.date) : null;

  const sourceLabel = info.source === 'original' ? 'Aus Excel-Upload vom'
    : info.source === 'excel-import' ? 'Aus hochgeladener Excel-Liste vom'
    : 'Zuletzt aktualisiert am';

  // Gültigkeitsstempel: Ablaufwarnung oder Ablaufmeldung
  let validityBadge = '';
  if(hasPrice){
    if(ownExpDays === null){
      // kein Datum — kein Badge
    } else if(ownExpDays < 0){
      validityBadge = `<span class="validity-badge expired" title="Preis gilt nicht mehr als aktuell (älter als ${VALIDITY_DAYS} Tage)">⚠ Abgelaufen vor ${Math.abs(ownExpDays)} Tag${Math.abs(ownExpDays)===1?'':'en'}</span>`;
    } else if(ownExpDays <= 7){
      validityBadge = `<span class="validity-badge warning" title="Preis läuft bald ab">⏳ Läuft ab in ${ownExpDays} Tag${ownExpDays===1?'':'en'}</span>`;
    } else {
      const expDate = new Date(info.date + 'T00:00:00');
      expDate.setDate(expDate.getDate() + VALIDITY_DAYS);
      const expStr = expDate.toLocaleDateString('de-DE', {day:'2-digit', month:'2-digit', year:'numeric'});
      validityBadge = `<span class="validity-badge valid" title="Gültig bis ${expStr}">✓ Gültig bis ${expStr}</span>`;
    }
  }

  const updateLine = hasPrice
    ? `<div class="update-info">${sourceLabel} ${formatUpdateDate(info.date)} ${validityBadge}</div>`
    : '';

  // Best-Preis-Hinweis: nur gültige Preise anderer Speditionen hervorheben
  const bestIsOther = best && best.carrier !== state.carrier && best.price !== null;
  let bestCarrierLine = '';
  if(bestIsOther){
    const expiredLabel = best.expired
      ? `<span class="validity-badge expired" style="font-size:10px;">Abgelaufen</span>`
      : '';
    bestCarrierLine = `<div class="best-carrier-hint${best.expired ? ' best-expired' : ''}">
       <span class="best-carrier-label">${best.expired ? 'Letzter bekannter Preis:' : 'Aktuellster Preis:'}</span>
       <span class="best-carrier-name">${escapeHtml(best.carrier)}</span>
       <span class="best-carrier-price">${Math.round(best.price)} €</span>
       <span class="best-carrier-date">${formatUpdateDate(best.date)}</span>
       ${expiredLabel}
     </div>`;
  } else if(best && !hasPrice){
    const expiredLabel = best.expired
      ? `<span class="validity-badge expired" style="font-size:10px;">Abgelaufen</span>`
      : '';
    bestCarrierLine = `<div class="best-carrier-hint${best.expired ? ' best-expired' : ''}">
       <span class="best-carrier-label">${best.expired ? 'Letzter Preis (abgelaufen):' : 'Preis verfügbar bei:'}</span>
       <span class="best-carrier-name">${escapeHtml(best.carrier)}</span>
       <span class="best-carrier-price">${Math.round(best.price)} €</span>
       ${expiredLabel}
     </div>`;
  }

  card.className = `result-card${hasPrice && !ownValid ? ' price-expired' : ''}`;

  // Diesel-Floater: prozentualer Aufschlag on top. Netto und Floater werden
  // getrennt ausgewiesen, darunter der resultierende Bruttopreis.
  const floaterVal = hasPrice ? (info.floater || 0) : 0;
  let floaterLine = '';
  if(hasPrice && floaterVal > 0){
    const brutto = grossPrice(priceVal, floaterVal);
    const pct = (floaterVal * 100).toLocaleString('de-DE', {maximumFractionDigits: 1});
    floaterLine = `
    <div class="floater-block">
      <div class="floater-row">
        <span class="floater-label">Nettopreis</span>
        <span class="floater-val">${Math.round(priceVal)} €</span>
      </div>
      <div class="floater-row floater-diesel">
        <span class="floater-label">+ Diesel-Floater</span>
        <span class="floater-val">${pct} %</span>
      </div>
      <div class="floater-row floater-brutto">
        <span class="floater-label">Bruttopreis</span>
        <span class="floater-val">${Math.round(brutto)} €</span>
      </div>
    </div>`;
  }

  card.innerHTML = `
    <div class="unit-country">${country}${id? ' · Nr. '+id : ''} <span class="carrier-tag">${escapeHtml(state.carrier)}</span></div>
    <div class="unit-name">${unit.name}</div>
    <div class="price-row">
      ${hasPrice
        ? `<span class="price-value${!ownValid ? ' price-value-expired' : ''}">${Math.round(priceVal)}</span><span class="price-unit">€ ${floaterVal > 0 ? 'netto' : 'Frachtpreis'}</span>`
        : `<span class="price-value empty-price">Kein Preis erfasst</span>`}
    </div>
    <div class="cargo-badge-line"><span class="cargo-badge cargo-${state.cargo.toLowerCase()}">${state.cargo}</span></div>
    ${floaterLine}
    ${updateLine}
    ${bestCarrierLine}
  `;
  editBlock.style.display = 'block';
  populatePriceCarrierSelect();
  document.getElementById('inputNewPrice').value = '';
  document.getElementById('inputNewPrice').placeholder = hasPrice ? `aktuell ${Math.round(priceVal)} € — neuer Preis` : 'Preis in € eingeben';

  historyBlock.style.display = 'block';
  renderHistory(state.carrier, country, name, id, state.cargo);
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ===================== WARENTYP-AUSWAHL =====================
function loadActiveCargo(){
  try{
    const v = localStorage.getItem(LOCAL_DB_PREFIX + CARGO_KEY);
    return CARGO_TYPES.includes(v) ? v : DEFAULT_CARGO;
  }catch(e){ return DEFAULT_CARGO; }
}
function saveActiveCargo(c){
  try{ localStorage.setItem(LOCAL_DB_PREFIX + CARGO_KEY, c); }catch(e){}
}

function setupCargoSelector(){
  const sel = document.getElementById('selCargo');
  const selPrice = document.getElementById('selPriceCargo');
  // Optionen füllen
  [sel, selPrice].forEach(s=>{
    if(!s) return;
    s.innerHTML = '';
    CARGO_TYPES.forEach(c=>{
      const o = document.createElement('option');
      o.value = c; o.textContent = c;
      s.appendChild(o);
    });
  });
  state.cargo = loadActiveCargo();
  if(sel){
    sel.value = state.cargo;
    sel.addEventListener('change', ()=>{
      state.cargo = sel.value;
      saveActiveCargo(state.cargo);
      if(selPrice) selPrice.value = state.cargo;
      renderMap();
      updateResultCard();
      updateStamp();
    });
  }
  if(selPrice) selPrice.value = state.cargo;
}

function priceKey(carrier, cargo, country, name, id){
  return PRICE_STORAGE_PREFIX + carrier + ':' + (cargo || DEFAULT_CARGO) + ':' + country + ':' + (id || '') + ':' + name;
}

// Schlüssel im alten Format (vor Einführung des Warentyps) — für die Migration
function legacyPriceKey(carrier, country, name, id){
  return PRICE_STORAGE_PREFIX + carrier + ':' + country + ':' + (id || '') + ':' + name;
}

// Einmalige Migration: bestehende Preise ohne Warentyp werden dem Warentyp "Gemischt"
// zugeordnet, damit bereits erfasste Daten erhalten bleiben.
function migrateLegacyPrices(){
  const MIGRATION_FLAG = LOCAL_DB_PREFIX + 'cargo-migration-done';
  try{
    if(localStorage.getItem(MIGRATION_FLAG)) return;
    const toMigrate = [];
    for(let i = 0; i < localStorage.length; i++){
      const k = localStorage.key(i);
      if(!k || !k.startsWith(LOCAL_DB_PREFIX + PRICE_STORAGE_PREFIX)) continue;
      const bare = k.slice(LOCAL_DB_PREFIX.length + PRICE_STORAGE_PREFIX.length);
      const parts = bare.split(':');
      // Altes Format: carrier:country:id:name  → 4 Teile
      // Neues Format: carrier:cargo:country:id:name → 5 Teile
      if(parts.length === 4) toMigrate.push({key: k, parts});
    }
    for(const {key, parts} of toMigrate){
      const [carrier, country, id, name] = parts;
      const newKey = LOCAL_DB_PREFIX + priceKey(carrier, DEFAULT_CARGO, country, name, id);
      const val = localStorage.getItem(key);
      if(val !== null && localStorage.getItem(newKey) === null){
        localStorage.setItem(newKey, val);
      }
      localStorage.removeItem(key);
    }
    localStorage.setItem(MIGRATION_FLAG, '1');
    if(toMigrate.length) console.info(`Warentyp-Migration: ${toMigrate.length} Preiseinträge nach "${DEFAULT_CARGO}" übernommen.`);
  }catch(e){ /* ignore */ }
}

async function renderHistory(carrier, country, name, id, cargo){
  const list = document.getElementById('historyList');
  list.innerHTML = '<li class="history-empty" style="border:none;">Lade Verlauf…</li>';
  try{
    const res = await localDb.get(priceKey(carrier, cargo || state.cargo, country, name, id));
    const history = res ? JSON.parse(res.value) : [];
    if(history.length===0){
      list.innerHTML = '<li class="history-empty" style="border:none;">Noch keine manuellen Preiseinträge erfasst.</li>';
      return;
    }
    list.innerHTML = '';
    history.slice().reverse().forEach(entry=>{
      const li = document.createElement('li');
      const tag = entry.source==='original' ? ' <span style="opacity:.55;">(Ursprungswert)</span>'
        : entry.source==='excel-import' ? ' <span style="opacity:.55;">(Excel-Import)</span>'
        : '';
      li.innerHTML = `<span class="h-date">${entry.date}${tag}</span><span class="h-price">${Math.round(entry.price)} €</span>`;
      list.appendChild(li);
    });
  }catch(e){
    list.innerHTML = '<li class="history-empty" style="border:none;">Noch keine manuellen Preiseinträge erfasst.</li>';
  }
}

async function saveNewPrice(){
  if(!state.selectedUnit) return;
  const input = document.getElementById('inputNewPrice');
  const val = parseFloat(input.value);
  if(isNaN(val) || val < 0){
    input.style.borderColor = 'var(--red)';
    return;
  }
  input.style.borderColor = '';
  const {country, name, id} = state.selectedUnit;
  const unit = COUNTRIES[country].units.find(u=>u.name===name);
  const carrierSelect = document.getElementById('selPriceCarrier');
  const carrier = carrierSelect.value || state.carrier;
  const cargoSelect = document.getElementById('selPriceCargo');
  const cargo = (cargoSelect && cargoSelect.value) || state.cargo;
  const today = new Date().toISOString().slice(0,10);
  const key = priceKey(carrier, cargo, country, name, id);

  // Bestehende Datenbank-Einträge laden
  let history = [];
  try{
    const res = await localDb.get(key);
    history = res ? JSON.parse(res.value) : [];
  }catch(e){ history = []; }

  // Falls dies der allererste manuelle Eintrag für den Standard-Carrier ist und bereits ein
  // Ursprungspreis (z.B. aus der hochgeladenen Excel-Tabelle) vorlag, diesen zuerst als
  // eigenen Datenbank-Eintrag sichern, damit er nicht verloren geht.
  if(history.length === 0 && carrier === DEFAULT_CARRIER && cargo === DEFAULT_CARGO && unit.preis !== null && unit.preis !== undefined){
    history.push({date: EXCEL_UPLOAD_DATE || today, price: unit.preis, source: 'original'});
  }

  // Neuer Eintrag wird IMMER zusätzlich angehängt - ersetzt keinen bestehenden Datenbank-Eintrag.
  history.push({date: today, price: val, source: 'manuell'});

  try{
    await localDb.set(key, JSON.stringify(history));
  }catch(e){ console.error('Storage error', e); }

  // Aktive Spedition auf die gerade befüllte umschalten, damit Karte/Sidebar sofort den neuen
  // Wert zeigen, auch wenn der Preis für eine andere Spedition als zuvor aktiv eingetragen wurde.
  if(cargo !== state.cargo){
    state.cargo = cargo;
    const sc = document.getElementById('selCargo');
    if(sc) sc.value = cargo;
    saveActiveCargo(cargo);
  }
  if(carrier !== state.carrier){
    state.carrier = carrier;
    document.getElementById('selCarrier').value = carrier;
  }

  input.value = '';
  updateResultCard();
  renderMap();
}

function populatePriceCarrierSelect(){
  const sel = document.getElementById('selPriceCarrier');
  const carriers = loadCarriers();
  sel.innerHTML = '';
  carriers.forEach(name=>{
    const opt = document.createElement('option');
    opt.value = name; opt.textContent = name;
    sel.appendChild(opt);
  });
  sel.value = state.carrier;
  const countEl = document.getElementById('priceCarrierCount');
  if(countEl) countEl.textContent = carriers.length > 1 ? `(${carriers.length} verfügbar)` : '';
}

// ===================== ZOOM/PAN =====================
function zoomToSelection(){
  if(!state.selectedUnit) return;
  const {country, name} = state.selectedUnit;
  const bbox = currentBBox();
  const unit = COUNTRIES[country].units.find(u=>u.name===name);
  // Bounding Box der Geometrie in Projektionskoordinaten berechnen
  let minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity;
  function consumeRing(ring){
    ring.forEach(pt=>{
      const [x,y] = project(pt[0], pt[1], bbox);
      minx=Math.min(minx,x); maxx=Math.max(maxx,x);
      miny=Math.min(miny,y); maxy=Math.max(maxy,y);
    });
  }
  if(unit.geometry.type==='Polygon'){
    unit.geometry.coordinates.forEach(consumeRing);
  } else {
    unit.geometry.coordinates.forEach(poly=>poly.forEach(consumeRing));
  }
  const w = maxx-minx, h = maxy-miny;
  const cx = (minx+maxx)/2, cy=(miny+maxy)/2;
  const targetZoom = Math.min(VB_W/(w*2.2), VB_H/(h*2.2), 14);
  state.zoom = Math.max(targetZoom, 1.5);
  state.pan.x = VB_W/2 - cx*state.zoom;
  state.pan.y = VB_H/2 - cy*state.zoom;
  state.isZoomedToSelection = true;
  applyTransform();
}

function resetView(){
  state.zoom = 1; state.pan = {x:0,y:0};
  state.isZoomedToSelection = false;
  state.selectedUnit = null;
  document.getElementById('selId').value='';
  document.getElementById('selName').value='';
  document.getElementById('btnZoom').disabled = true;
  renderMap();
  updateResultCard();
}

function setupPanZoomHandlers(){
  const svg = document.getElementById('mapSvg');
  svg.addEventListener('mousedown', (e)=>{
    if(e.button !== 0) return;          // nur linke Maustaste
    state.dragging = true;
    state.dragMoved = false;
    state.dragStart = {x:e.clientX, y:e.clientY};
    state.panStart = {...state.pan};
    svg.classList.add('panning');
  });
  window.addEventListener('mousemove', (e)=>{
    if(!state.dragging) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = VB_W/rect.width, scaleY = VB_H/rect.height;
    const dxPix = e.clientX - state.dragStart.x, dyPix = e.clientY - state.dragStart.y;
    // Ab wenigen Pixeln gilt es als Ziehen (unterdrückt versehentliche Klicks)
    if(Math.abs(dxPix) > 3 || Math.abs(dyPix) > 3) state.dragMoved = true;
    state.pan.x = state.panStart.x + dxPix*scaleX;
    state.pan.y = state.panStart.y + dyPix*scaleY;
    applyTransform();
  });
  window.addEventListener('mouseup', ()=>{
    if(state.dragging){ state.dragging = false; svg.classList.remove('panning'); }
  });
  // Falls die Maus das Fenster verlässt, Drag sauber beenden
  window.addEventListener('mouseleave', ()=>{
    if(state.dragging){ state.dragging = false; svg.classList.remove('panning'); }
  });
  // Klick auf ein Departement nach echtem Ziehen unterdrücken
  svg.addEventListener('click', (e)=>{
    if(state.dragMoved){ e.stopPropagation(); e.preventDefault(); state.dragMoved = false; }
  }, true);

  svg.addEventListener('wheel', (e)=>{
    e.preventDefault();
    const rect = svg.getBoundingClientRect();
    const mx = (e.clientX-rect.left)/rect.width*VB_W;
    const my = (e.clientY-rect.top)/rect.height*VB_H;
    const factor = e.deltaY < 0 ? 1.15 : 1/1.15;
    const newZoom = Math.max(1, Math.min(state.zoom*factor, 14));
    // Zoom relativ zum Mauszeiger
    state.pan.x = mx - (mx-state.pan.x)*(newZoom/state.zoom);
    state.pan.y = my - (my-state.pan.y)*(newZoom/state.zoom);
    state.zoom = newZoom;
    applyTransform();
  }, {passive:false});
}

function updateStamp(){
  let total=0, withPrice=0;
  Object.entries(COUNTRIES).forEach(([country,c])=>{
    c.units.forEach(u=>{
      total++;
      const p = effectivePrice(state.carrier, country, u);
      if(p!==null && p!==undefined) withPrice++;
    });
  });
  document.getElementById('statsStamp').textContent = `${total} Einheiten · ${withPrice} mit Preis`;
}

// ===================== SPEDITIONEN / KLIENTEN =====================
const CARRIERS_KEY = 'carriers-list';

// Beim allerersten Start (noch keine eigene Speditionsliste im Browser vorhanden) werden die
// Speditionen und Preise aus der zuletzt hochgeladenen Excel-Liste fest vorbefüllt, damit diese
// Version der Datei direkt mit allen 43 Speditionen startet, ohne dass die Excel-Datei erneut
// hochgeladen werden muss. Wurde bereits einmal etwas in diesem Browser gespeichert (z.B. weil
// die Seite schon einmal geöffnet wurde), greift diese Vorbefüllung nicht mehr - so werden eigene
// Einträge nie überschrieben.
function preloadUploadedCarriersIfFirstRun(){
  const preload = APP_DATA.preloadedCarriers;
  if(!preload || !preload.carriers || preload.carriers.length === 0) return;
  let alreadyInitialized = false;
  try{
    alreadyInitialized = localStorage.getItem(LOCAL_DB_PREFIX + CARRIERS_KEY) !== null;
  }catch(e){ return; }
  if(alreadyInitialized) return;

  try{
    const carrierList = [DEFAULT_CARRIER, ...preload.carriers.filter(c=>c!==DEFAULT_CARRIER)];
    localStorage.setItem(LOCAL_DB_PREFIX + CARRIERS_KEY, JSON.stringify(carrierList));

    preload.entries.forEach(entry=>{
      const country = entry.land;
      if(!COUNTRIES[country]) return;
      const unit = COUNTRIES[country].units.find(u=>
        (entry.nummer && String(u.id||'') === entry.nummer) || u.name === entry.name
      );
      if(!unit) return;
      const key = priceKey(entry.carrier, entry.warentyp || DEFAULT_CARGO, country, unit.name, unit.id);
      const storageKey = LOCAL_DB_PREFIX + key;
      let history = [];
      try{
        const raw = localStorage.getItem(storageKey);
        history = raw ? JSON.parse(raw) : [];
      }catch(e){ history = []; }
      history.push({date: entry.datum || EXCEL_UPLOAD_DATE, price: entry.preis, source: 'excel-import'});
      localStorage.setItem(storageKey, JSON.stringify(history));
    });
  }catch(e){ console.error('Vorbefüllung fehlgeschlagen', e); }
}

function loadCarriers(){
  let list;
  try{
    const raw = localStorage.getItem(LOCAL_DB_PREFIX + CARRIERS_KEY);
    list = raw ? JSON.parse(raw) : null;
  }catch(e){ list = null; }
  if(!list || !Array.isArray(list) || list.length===0){
    list = [DEFAULT_CARRIER];
    saveCarriers(list);
  }
  if(!list.includes(DEFAULT_CARRIER)) list.unshift(DEFAULT_CARRIER);
  return list;
}

function saveCarriers(list){
  try{
    localStorage.setItem(LOCAL_DB_PREFIX + CARRIERS_KEY, JSON.stringify(list));
  }catch(e){ console.error('Storage error', e); }
}

function initCarriers(){
  const list = loadCarriers();
  state.carrier = list[0];
  populateCarrierSelect(list);

  document.getElementById('selCarrier').addEventListener('change', (e)=>{
    state.carrier = e.target.value;
    renderMap();
    updateResultCard();
    updateStamp();
  });

  document.getElementById('btnNewCarrier').addEventListener('click', createCarrier);
  document.getElementById('btnDeleteCarrier').addEventListener('click', deleteCarrier);
}

function populateCarrierSelect(list){
  const sel = document.getElementById('selCarrier');
  sel.innerHTML = '';
  list.forEach(name=>{
    const opt = document.createElement('option');
    opt.value = name; opt.textContent = name;
    sel.appendChild(opt);
  });
  sel.value = state.carrier;
}

function createCarrier(){
  const name = (prompt('Name der neuen Spedition / des Klienten:') || '').trim();
  if(!name) return;
  const list = loadCarriers();
  if(list.includes(name)){
    alert('Diese Spedition existiert bereits.');
    state.carrier = name;
    populateCarrierSelect(list);
    renderMap(); updateResultCard(); updateStamp();
    return;
  }
  list.push(name);
  saveCarriers(list);
  state.carrier = name;
  populateCarrierSelect(list);
  renderMap();
  updateResultCard();
  updateStamp();
}

function deleteCarrier(){
  const list = loadCarriers();
  if(state.carrier === DEFAULT_CARRIER){
    alert('Die Standard-Spedition kann nicht gelöscht werden.');
    return;
  }
  if(!confirm(`Spedition "${state.carrier}" inklusive aller dafür erfassten Preise wirklich löschen?`)) return;

  // Alle gespeicherten Preis-Einträge dieser Spedition entfernen
  try{
    const prefixToDelete = PRICE_STORAGE_PREFIX + state.carrier + ':';
    const keysToRemove = [];
    for(let i=0;i<localStorage.length;i++){
      const k = localStorage.key(i);
      if(k && k.startsWith(LOCAL_DB_PREFIX + prefixToDelete)){
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach(k=>localStorage.removeItem(k));
  }catch(e){ console.error('Storage error', e); }

  const newList = list.filter(c=>c!==state.carrier);
  saveCarriers(newList);
  state.carrier = DEFAULT_CARRIER;
  populateCarrierSelect(newList);
  renderMap();
  updateResultCard();
  updateStamp();
}

// ===================== PLZ-ZUORDNUNG =====================
// Sucht für eine eingegebene PLZ (beliebiges Land) die passende Verwaltungseinheit.
// Probiert für jedes Land mehrere Präfixlängen (lang -> kurz), da PLZ-Formate
// zwischen den Ländern unterschiedlich aufgebaut sind (z.B. UK-Outcodes variabler Länge).
// Länder, deren Postleitzahl-Format mit Buchstaben beginnt und damit auch ohne
// vorgewähltes Land eindeutig einem Land zugeordnet werden kann (z.B. UK "SW1", IE "F12").
// Rein numerische Formate (DE, FR, AT, ...) sind zwischen Ländern nicht unterscheidbar -
// dort wird zwingend das in Feld A gewählte Land als Kontext benötigt.
function isAlphaLeadingFormat(prefix){
  return /^[A-Z]/.test(prefix);
}

function lookupPlz(rawInput){
  const input = rawInput.trim().toUpperCase().replace(/\s+/g, '');
  if(!input) return null;

  // 1. Falls bereits ein konkretes Land gewählt ist (nicht Europa-Gesamtansicht),
  //    zuerst dort suchen - das ist der zuverlässigste Fall.
  if(state.country !== EUROPE_KEY && PLZ_MAPPING[state.country]){
    const table = PLZ_MAPPING[state.country];
    for(let len = Math.min(input.length, 6); len >= 1; len--){
      const prefix = input.slice(0, len);
      if(table[prefix]) return {country: state.country, name: table[prefix]};
    }
  }

  // 2. Kein Land gewählt oder dort kein Treffer: nur eindeutige alphabetische Formate
  //    (UK, Irland, Island-Buchstaben) länderübergreifend raten, um Kollisionen
  //    zwischen rein numerischen Formaten verschiedener Länder zu vermeiden.
  if(isAlphaLeadingFormat(input)){
    for(const country of Object.keys(PLZ_MAPPING)){
      const table = PLZ_MAPPING[country];
      for(let len = Math.min(input.length, 6); len >= 1; len--){
        const prefix = input.slice(0, len);
        if(table[prefix]) return {country, name: table[prefix]};
      }
    }
  }
  return null;
}

function setupPlzInput(){
  const input = document.getElementById('inputPlz');
  const hint = document.getElementById('plzHint');
  let debounceTimer = null;
  input.addEventListener('input', ()=>{
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(()=>{
      const val = input.value;
      if(!val.trim()){
        hint.textContent = '';
        hint.className = 'plz-hint';
        return;
      }
      const match = lookupPlz(val);
      if(match){
        hint.textContent = `→ ${match.name} (${match.country})`;
        hint.className = 'plz-hint match';
        const unit = COUNTRIES[match.country].units.find(u=>u.name===match.name);
        if(unit){
          if(state.country !== match.country && state.country !== EUROPE_KEY){
            state.country = match.country;
            populateSelectors();
            renderCountryTabs();
          }
          selectUnit(match.country, unit.name, unit.id);
        }
      } else if(state.country === EUROPE_KEY && !isAlphaLeadingFormat(val.trim().toUpperCase())){
        hint.textContent = 'Bitte zuerst ein Land in Feld A wählen (numerische PLZ sind nicht eindeutig)';
        hint.className = 'plz-hint nomatch';
      } else {
        hint.textContent = 'Keine Zuordnung gefunden';
        hint.className = 'plz-hint nomatch';
      }
    }, 350);
  });
}

// ===================== EXCEL-UPLOAD: AKTUELLSTEN PREIS ÜBERNEHMEN =====================
// Erwartetes Format (wie im Export erzeugt):
//   Zeile 1: Speditionsname je Preis/Datum-Spaltenpaar (gruppiert über 2 Spalten)
//   Zeile 2: Spaltenüberschriften - "Land","Nummer/ID","Verwaltungseinheit","PLZ-Beispiele",
//            dann abwechselnd "Preis (EUR)","Update am" je Spedition
//   Ab Zeile 3: Daten
// Für jede gefundene (Spedition, Land, Verwaltungseinheit)-Kombination wird das Datum aus der
// Excel-Zeile mit dem Datum des aktuellsten Web-Eintrags verglichen. Der jeweils neuere Preis
// bestimmt, was künftig angezeigt wird. Es wird dabei kein bestehender Datenbank-Eintrag
// gelöscht - ein "Excel-Import"-Eintrag wird bei Bedarf einfach zusätzlich angehängt.

function excelSerialToIso(value){
  if(value === null || value === undefined || value === '') return null;
  if(typeof value === 'number'){
    // Excel-Datumsserial (Tage seit 1899-12-30) in ISO-Datum umrechnen
    const ms = Math.round((value - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if(isNaN(d.getTime())) return null;
    return d.toISOString().slice(0,10);
  }
  const s = String(value).trim();
  // Bereits ISO (YYYY-MM-DD) oder von SheetJS als Text gelesen
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(isoMatch) return s.slice(0,10);
  const deMatch = s.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if(deMatch) return `${deMatch[3]}-${deMatch[2]}-${deMatch[1]}`;
  const parsed = new Date(s);
  if(!isNaN(parsed.getTime())) return parsed.toISOString().slice(0,10);
  return null;
}

// ── Datei-Typ-Erkennung für den Wochen-Upload ───────────────────────────────
// Frachtzone/PLZ → Land (Browser-Pendant zur Aufbereitung in Python).
function frachtZoneToCountry(zone, plz){
  const z = (zone==null?'':String(zone)).trim();
  const p = (plz==null?'':String(plz)).trim();
  if(z.startsWith('D.') || z === 'D') return 'Deutschland';
  if(z === 'GB') return 'UK';
  if(z === 'NIRE' || z === 'IRE') return 'Irland';
  if(z === 'NL') return 'Niederlande';
  if(z === 'B') return 'Belgien';
  if(z === 'I') return 'Italien';
  if(z === 'CH') return 'Schweiz';
  if(z === 'SLO') return 'Slowenien';
  if(z.toUpperCase() === 'SPANIEN') return 'Spanien';
  if(z.toUpperCase() === 'PORTUGAL') return 'Portugal';
  if(/^\d{1,3}$/.test(z)) return 'Frankreich';
  const pc = p.replace(/\s/g,'');
  if(/^[A-Z]{1,2}\d/i.test(pc)) return 'UK';
  if(/^\d{4}\s?[A-Z]{2}$/i.test(p)) return 'Niederlande';
  if(/^\d{5}$/.test(p)) return 'Frankreich';
  if(/^\d{4}$/.test(p)) return 'Belgien';
  return null;
}

// PLZ → Verwaltungseinheit-Name (nutzt das eingebettete PLZ_MAPPING).
function plzToUnitName(land, plz){
  plz = (plz==null?'':String(plz)).trim();
  const m = PLZ_MAPPING[land];
  if(!m) return null;
  if(land === 'Deutschland' || land === 'Frankreich') return m[plz.replace(/\s/g,'').slice(0,2)] || null;
  if(land === 'Österreich') return m[plz.replace(/\s/g,'').slice(0,1)] || null;
  if(land === 'UK' || land === 'Irland'){
    let out = plz.indexOf(' ')>=0 ? plz.split(' ')[0].toUpperCase() : plz.toUpperCase();
    let src = m;
    if(out && /[A-Z]/i.test(out[0]) && land === 'Irland' && PLZ_MAPPING['UK']) src = PLZ_MAPPING['UK'];
    if(src[out]) return src[out];
    while(out.length > 1 && /\d/.test(out[out.length-1])){
      out = out.slice(0,-1);
      if(src[out]) return src[out];
    }
    return null;
  }
  if(land === 'Niederlande'){ const d = plz.replace(/\D/g,''); return d ? (m[d.slice(0,2)]||null) : null; }
  if(land === 'Slowenien'){ const d = plz.replace(/\\D/g,''); return d ? (m[d.slice(0,1)]||m['default']||null) : (m['default']||null); }
  if(['Italien','Spanien','Portugal','Belgien','Schweiz'].includes(land)){
    const d = plz.replace(/\D/g,'');
    for(const n of [3,2,1]){ if(m[d.slice(0,n)]) return m[d.slice(0,n)]; }
    return null;
  }
  return null;
}

// Unterscheidet die beiden wöchentlichen Excel-Dateien an ihren Kopfzeilen:
//   Frachtenauswertung → Spalte "Spedition"
//   Umsatz             → Spalte "Artikel" (und "Umsatz"/"Netto")
// Gibt 'fracht' | 'umsatz' | null (= anderes Format, z. B. Preisliste) zurück.
function detectUploadKind(wb, fileName){
  // 1) Dateiname hat Vorrang (Namen dürfen variieren, müssen aber "fracht"
  //    bzw. "umsatz" enthalten). Beispiele: "frachtenauswertung29.xlsx" → fracht,
  //    "auswertung_Umsatz29.xlsx" → umsatz.
  const fn = String(fileName || '').toLowerCase();
  if(fn.includes('fracht')) return 'fracht';
  if(fn.includes('umsatz')) return 'umsatz';

  // 2) Fallback: am Blatt/den Spalten erkennen
  for(const sn of wb.SheetNames){
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], {header:1, raw:true, defval:null});
    for(let i=0; i<Math.min(rows.length, 4); i++){
      const head = (rows[i]||[]).map(c => String(c==null?'':c).trim().toLowerCase());
      if(!head.length) continue;
      const has = (name)=> head.some(h => h.startsWith(name));
      const hasOrt = has('plz') || has('postleit') || has('frachtzone') || head.includes('zone') || head.includes('land');
      const isHeader = has('datum') && hasOrt;
      if(!isHeader) continue;
      if(has('spedition') || has('fracht-entgelt') || has('frachtentgelt') || has('frachtpreis') || has('fracht-nachname')) return 'fracht';
      if(has('artikel') || has('umsatz') || has('netto')) return 'umsatz';
    }
  }
  return null;
}

// Zeilen eines Blattes als Objektliste (Kopfzeile → Schlüssel) einlesen.
function sheetRowsAsObjects(wb){
  for(const sn of wb.SheetNames){
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], {header:1, raw:true, defval:null});
    let hi = -1;
    for(let i=0; i<Math.min(rows.length,4); i++){
      const head = (rows[i]||[]).map(c=>String(c==null?'':c).trim().toLowerCase());
      // Kopfzeile erkennen: Datum-Spalte + (Zone/Land oder PLZ)
      const hasDatum = head.some(h=>h.startsWith('datum'));
      const hasOrt = head.some(h=>h.startsWith('plz')||h.startsWith('postleit')||h.startsWith('frachtzone')||h==='zone'||h==='land');
      if(hasDatum && hasOrt){ hi=i; break; }
    }
    if(hi<0) continue;
    const head = rows[hi].map(c=>String(c==null?'':c).trim().toLowerCase());
    const out = [];
    for(let r=hi+1; r<rows.length; r++){
      const row = rows[r]; if(!row) continue;
      const o = {};
      head.forEach((h,ci)=> o[h] = row[ci]);
      // Rohzellen nach Spaltenindex mitführen — für positionsbezogene Spalten
      // wie die Lieferadresse-PLZ in Spalte M (A=0 … M=12).
      o.__cells = row;
      out.push(o);
    }
    return out;
  }
  return [];
}

// Frachtenauswertung-Upload: zählt die enthaltenen Fahrten/Kunden und bestätigt
// den wöchentlichen Eingang. (Die Karten-Datengrundlage wird beim nächsten
// Build fest eingebettet; der Live-Upload dient der Wochenkontrolle.)
// Frachten/Logistik-Upload: überführt die Frachtenauswertung in das TRIPS-Format
// und ersetzt die Fahrten live, sodass die Ø-Frachtpreise (Ausgangsfrachten +
// Logistik) sofort auf der Karte aktualisiert werden — analog zum Umsatz-Upload.
function processFrachtUpload(wb){
  const rows = sheetRowsAsObjects(wb);
  const col = (o,...names)=>{ for(const n of names){ if(Object.prototype.hasOwnProperty.call(o,n)) return o[n]; } for(const n of names){ for(const k in o){ if(k.startsWith(n)) return o[k]; } } return null; };

  const newTrips = [];
  const customers = new Set();
  let sumPrice = 0, nPrice = 0;

  for(const o of rows){
    // Spalte B kann "Frachtzone", "Zone" oder "Land" heißen (Inhalt: Zone/Nummer)
    const zone = col(o,'frachtzone','zone','land');
    // Lieferadresse hat Vorrang: ihre PLZ steht in Spalte M (Index 12), die
    // Standard-/Rechnungsadresse in Spalte C (Index 2). Beide werden BEWUSST
    // positionsbezogen gelesen — in der Frachtenauswertung tragen beide Spalten
    // die Überschrift „PLZ", die Header-Erkennung wäre also nicht eindeutig.
    const plzLiefer = o.__cells ? o.__cells[12] : null;                    // Spalte M (Vorrang)
    const plzStd    = o.__cells ? o.__cells[2] : col(o,'plz','postleit');  // Spalte C (Fallback)
    const plz = (plzLiefer!=null && String(plzLiefer).trim()!=='') ? plzLiefer : plzStd;
    const land = frachtZoneToCountry(zone, plz);
    const uname = land ? plzToUnitName(land, plz) : null;
    // Spalte D: Fracht-Entgelt / Frachtpreis / Preis / Entgelt
    const pr = parseGermanNumber(col(o,'fracht-entgelt','fracht entgelt','frachtentgelt','frachtpreis','entgelt','preis'));
    const kunde = col(o,'kunde','kundenkuerzel','adressesb'); const kcode = kunde ? String(kunde).trim() : null;
    // Spalte E: Speditionsname / Spedition / Fracht-Nachname
    const carrier = col(o,'spedition','speditionsname','fracht-nachname','frachtnachname','nachname'); const cname = carrier ? String(carrier).trim() : null;
    // Belegnummer (G) + Anzahl Belege (H)
    const belegNr = col(o,'nummer','belegnummer','beleg-nr','lieferschein');
    const belegAnz = parseGermanNumber(col(o,'anzahl','belege','belegteil'));
    const datum = col(o,'datum');
    let iso = null;
    if(datum != null){
      if(typeof datum === 'number'){ // Excel-Seriennummer
        const d = new Date(Math.round((datum - 25569) * 86400 * 1000));
        if(!isNaN(d)) iso = d.toISOString().slice(0,10);
      } else {
        const s = String(datum).trim();
        const m = s.match(/(\d{4})-(\d{2})-(\d{2})/) || s.match(/(\d{2})\.(\d{2})\.(\d{4})/);
        if(m) iso = m[1].length===4 ? `${m[1]}-${m[2]}-${m[3]}` : `${m[3]}-${m[2]}-${m[1]}`;
      }
    }
    if(kcode) customers.add(kcode);
    if(pr!=null && !isNaN(pr)){ sumPrice += pr; nPrice++; }
    newTrips.push({
      date: iso, country: land, unit: uname, plz: plz!=null?String(plz).trim():'',
      price: (pr!=null && !isNaN(pr)) ? pr : 0,
      carrier: cname, customer: kcode,
      ls: belegNr!=null?String(belegNr):'', docs: (belegAnz!=null&&!isNaN(belegAnz))?belegAnz:1,
      volume: parseGermanNumber(col(o,'menge')) || 0,
    });
  }

  // TRIPS live ersetzen + Caches leeren, damit die Ø-Frachtpreise neu berechnet werden
  if(typeof TRIPS !== 'undefined'){ TRIPS.length = 0; for(const t of newTrips) TRIPS.push(t); }
  if(typeof resetFreightCaches === 'function') resetFreightCaches();

  return {
    uploadKind:'fracht', tripCount:newTrips.length, customerCount:customers.size,
    avgPrice: nPrice ? Math.round(sumPrice/nPrice) : 0,
  };
}

// Umsatz-Upload: aktualisiert die CRM-Umsatzanzeige (Summe je Einheit) direkt
// im Browser, indem die Umsatzsummen live aus der Datei neu berechnet werden.
function processUmsatzUpload(wb){
  const rows = sheetRowsAsObjects(wb);
  const col = (o,...names)=>{ for(const n of names){ if(Object.prototype.hasOwnProperty.call(o,n)) return o[n]; } for(const n of names){ for(const k in o){ if(k.startsWith(n)) return o[k]; } } return null; };

  const unitRevenue = {};        // "Land::Einheit" → {sum,count}
  const customerRevenue = {};    // Kürzel → {sum,count,articles}
  const revenueTrips = [];       // Einzelbelege (für Woche/YTD je Land)
  let total=0, nBeleg=0;

  for(const o of rows){
    // Spalte D: Umsatz / Netto
    const ums = parseGermanNumber(col(o,'umsatz','netto'));
    if(ums==null || isNaN(ums)) continue;
    // Spalte B: Frachtzone / Zone / Land (Inhalt: Zone/Nummer)
    const zone = col(o,'frachtzone','zone','land');
    const plz  = col(o,'plz','postleit');
    const land = frachtZoneToCountry(zone, plz);
    const uname = land ? plzToUnitName(land, plz) : null;
    const kunde = col(o,'kunde','kundenkuerzel','adressesb'); const kcode = kunde ? String(kunde).trim() : null;
    const artikel = col(o,'artikel'); const art = artikel ? String(artikel).trim() : null;
    // Belegnummer + Anzahl Belege
    const belegNr = col(o,'nummer','belegnummer','beleg-nr','lieferschein');
    const belegAnz = parseGermanNumber(col(o,'anzahl','belege'));
    // Datum lesen (für Woche/YTD)
    const datum = col(o,'datum');
    let iso = null;
    if(datum != null){
      if(typeof datum === 'number'){
        const d = new Date(Math.round((datum - 25569) * 86400 * 1000));
        if(!isNaN(d)) iso = d.toISOString().slice(0,10);
      } else {
        const s = String(datum).trim();
        const m = s.match(/(\d{4})-(\d{2})-(\d{2})/) || s.match(/(\d{2})\.(\d{2})\.(\d{4})/);
        if(m) iso = m[1].length===4 ? `${m[1]}-${m[2]}-${m[3]}` : `${m[3]}-${m[2]}-${m[1]}`;
      }
    }
    total += ums; nBeleg++;
    revenueTrips.push({date: iso, country: land, unit: uname, revenue: ums, customer: kcode, article: art, ls: belegNr!=null?String(belegNr):'', docs: (belegAnz!=null&&!isNaN(belegAnz))?belegAnz:1});
    if(land && uname){
      const key = land+'::'+uname;
      (unitRevenue[key] = unitRevenue[key] || {sum:0,count:0});
      unitRevenue[key].sum += ums; unitRevenue[key].count++;
    }
    if(kcode){
      const c = (customerRevenue[kcode] = customerRevenue[kcode] || {sum:0,count:0,articles:{}});
      c.sum += ums; c.count++;
      if(art) c.articles[art] = (c.articles[art]||0)+1;
    }
  }
  for(const e of Object.values(unitRevenue)) e.sum = Math.round(e.sum*100)/100;
  for(const c of Object.values(customerRevenue)) c.sum = Math.round(c.sum*100)/100;

  // Globale Umsatzdaten live und VOLLSTÄNDIG ersetzen (Anzeige + Woche/YTD lesen daraus)
  if(typeof UNIT_REVENUE === 'object'){
    for(const k in UNIT_REVENUE) delete UNIT_REVENUE[k];
    Object.assign(UNIT_REVENUE, unitRevenue);
  }
  if(typeof CUSTOMER_REVENUE === 'object'){
    for(const k in CUSTOMER_REVENUE) delete CUSTOMER_REVENUE[k];
    Object.assign(CUSTOMER_REVENUE, customerRevenue);
  }
  if(typeof REVENUE_TRIPS !== 'undefined'){
    REVENUE_TRIPS.length = 0; for(const t of revenueTrips) REVENUE_TRIPS.push(t);
  }
  // Länder-Umsatz-Cache + Referenzdatum leeren, damit Woche/YTD neu berechnet werden
  if(typeof resetFreightCaches === 'function') resetFreightCaches();

  return {
    uploadKind:'umsatz', belegCount:nBeleg,
    unitCount: Object.keys(unitRevenue).length,
    customerCount: Object.keys(customerRevenue).length,
    totalRevenue: Math.round(total),
  };
}

function setupExcelUpload(){
  const btn = document.getElementById('btnUploadExcel');
  const fileInput = document.getElementById('inputExcelFile');
  const hint = document.getElementById('uploadHint');
  const defaultHintText = hint.textContent;

  btn.addEventListener('click', ()=> fileInput.click());

  fileInput.addEventListener('change', async (e)=>{
    const file = e.target.files[0];
    if(!file) return;
    hint.textContent = 'Lese Datei…';
    hint.className = 'upload-hint';
    try{
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, {type:'array', cellDates:false});

      // Datei-Typ zuerst am DATEINAMEN erkennen ("fracht" → Ausgangsfrachten,
      // "umsatz" → Umsatz), sonst am Blatt/den Spalten. Die Namen dürfen variieren.
      const detected = detectUploadKind(wb, file.name);
      if(detected === 'umsatz'){
        // Umsatz-Datei: aktualisiert die CRM-Umsatzanzeige (Summe je Einheit)
        const res = processUmsatzUpload(wb);
        renderUploadSummary(res);
        if(typeof markUploadDone === 'function') markUploadDone('umsatz');
        renderMap(); updateResultCard(); updateStamp();
        fileInput.value = '';
        return;
      }
      if(detected === 'fracht'){
        // Frachtenauswertung: aktualisiert Kunden, Fahrten, Ø-Frachtpreise
        const res = processFrachtUpload(wb);
        renderUploadSummary(res);
        if(typeof markUploadDone === 'function') markUploadDone('fracht');
        renderMap(); updateResultCard(); updateStamp();
        fileInput.value = '';
        return;
      }

      // Neues Langformat: ein Blatt "Preise" mit einer Zeile je Preis
      // (Datum · Spedition · Land · Einheit-Nr. · Einheit-Name · Warentyp · Preis · Notiz).
      const langSheet = wb.SheetNames.find(sn => String(sn).trim().toLowerCase() === 'preise');
      if(langSheet){
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[langSheet], {header:1, raw:true, defval:null});
        const result = await processLongFormatRows(rows);
        renderUploadSummary(result);
        renderMap(); updateResultCard(); updateStamp();
        fileInput.value = '';
        return;
      }

      // Klassisches Format: je ein Matrix-Blatt pro Warentyp
      // ("Getrocknet"/"Frisch"/"Gemischt") oder ein einzelnes "Transportpreise"-Blatt.
      const sheetsToRead = [];
      for(const sn of wb.SheetNames){
        const match = CARGO_TYPES.find(c => c.toLowerCase() === String(sn).trim().toLowerCase());
        if(match) sheetsToRead.push({sheetName: sn, cargo: match});
      }
      if(sheetsToRead.length === 0){
        const fallback = wb.SheetNames.includes('Transportpreise') ? 'Transportpreise' : wb.SheetNames[0];
        sheetsToRead.push({sheetName: fallback, cargo: DEFAULT_CARGO});
      }

      const results = [];
      for(const {sheetName, cargo} of sheetsToRead){
        const sheet = wb.Sheets[sheetName];
        if(!sheet) continue;
        const rows = XLSX.utils.sheet_to_json(sheet, {header:1, raw:true, defval:null});
        const res = await processUploadedRows(rows, cargo);
        res.cargo = cargo;
        results.push(res);
      }
      const result = mergeUploadResults(results);
      renderUploadSummary(result);
      // Anzeige aktualisieren, falls die aktuell ausgewählte Einheit/Spedition betroffen war
      renderMap();
      updateResultCard();
      updateStamp();
    }catch(err){
      console.error('Excel-Upload-Fehler', err);
      hint.textContent = 'Datei konnte nicht gelesen werden. Bitte prüfen, ob es eine gültige .xlsx-Datei im erwarteten Format ist.';
      hint.className = 'upload-hint error';
    }
    fileInput.value = '';
  });
}

// Baut einen Lookup von (Land, Name-lowercase) und (Land, ID) auf alle bekannten Einheiten,
// damit Excel-Zeilen auch bei kleinen Schreibweise-Unterschieden zugeordnet werden können.
function buildUnitLookup(){
  const byName = {};
  const byId = {};
  Object.entries(COUNTRIES).forEach(([country, c])=>{
    c.units.forEach(u=>{
      byName[country + '::' + u.name.trim().toLowerCase()] = u;
      if(u.id) byId[country + '::' + String(u.id).trim().toLowerCase()] = u;
    });
  });
  return {byName, byId};
}

// ── Langformat-Import: eine Zeile je Preis ──────────────────────────────────
// Kopf (Zeile 3): Datum · Spedition · Land · Einheit-Nr. · Einheit-Name · Warentyp · Preis · Notiz
// Je Spedition + Einheit + Warentyp + Monat wird der JÜNGSTE Preis übernommen.
async function processLongFormatRows(rows){
  if(!rows || rows.length < 2){
    return {error: 'Das Blatt „Preise" enthält keine auswertbaren Zeilen.'};
  }
  // Kopfzeile finden (die Zeile, die "Datum" und "Preis" enthält)
  let headerIdx = -1;
  for(let i = 0; i < Math.min(rows.length, 8); i++){
    const cells = (rows[i] || []).map(c => String(c == null ? '' : c).trim().toLowerCase());
    if(cells.some(c => c.startsWith('datum')) && cells.some(c => c.startsWith('preis'))){
      headerIdx = i; break;
    }
  }
  if(headerIdx < 0){
    return {error: 'Im Blatt „Preise" wurde keine Kopfzeile (Datum … Preis) gefunden.'};
  }
  const head = (rows[headerIdx] || []).map(c => String(c == null ? '' : c).trim().toLowerCase());
  const col = (...names) => {
    for(const n of names){
      const idx = head.findIndex(h => h.startsWith(n));
      if(idx >= 0) return idx;
    }
    return -1;
  };
  const cDate  = col('datum');
  const cSped  = col('spedition');
  const cLand  = col('land');
  const cNr    = col('einheit-nr', 'einheit nr', 'nr');
  const cName  = col('einheit-name', 'einheit name', 'einheit', 'name');
  const cWt    = col('warentyp');
  const cPrice = col('preis');
  const cFloat = col('diesel-floater', 'diesel floater', 'floater', 'diesel');

  const lookup = buildUnitLookup();
  const carriers = loadCarriers();
  const knownCarriers = new Set(carriers.map(c => c.toLowerCase()));
  const newCarriers = new Set();

  // Gruppieren: key = carrier | country | unitId | unitName | cargo | YYYY-MM
  const groups = new Map();
  let skipped = 0;

  for(let i = headerIdx + 1; i < rows.length; i++){
    const row = rows[i];
    if(!row) continue;
    const rawDate = row[cDate];
    const price = parseGermanNumber(row[cPrice]);
    if(rawDate == null || price == null || isNaN(price)){ continue; }  // Leerzeile
    // Diesel-Floater (prozentualer Aufschlag). Excel liefert 0,085 für 8,5 %;
    // handschriftliche Eingaben wie "8,5" oder "8,5%" werden ebenfalls erkannt.
    let floater = cFloat >= 0 ? parseGermanNumber(row[cFloat]) : null;
    if(floater != null){
      if(floater > 1.0001) floater = floater / 100;   // "8,5" → 0,085
      if(floater < 0) floater = 0;
    }

    const iso = excelToIso(rawDate);
    if(!iso){ skipped++; continue; }

    const carrier = String(row[cSped] == null ? '' : row[cSped]).trim() || DEFAULT_CARRIER;
    const country = String(row[cLand] == null ? '' : row[cLand]).trim();
    const nr      = cNr   >= 0 ? String(row[cNr]   == null ? '' : row[cNr]).trim()   : '';
    const uname   = cName >= 0 ? String(row[cName] == null ? '' : row[cName]).trim() : '';
    let cargo     = cWt >= 0 ? String(row[cWt] == null ? '' : row[cWt]).trim() : DEFAULT_CARGO;
    if(!CARGO_TYPES.includes(cargo)){
      const m = CARGO_TYPES.find(c => c.toLowerCase() === cargo.toLowerCase());
      cargo = m || DEFAULT_CARGO;
    }

    // Einheit auflösen (erst über ID, dann Name)
    let unit = null;
    if(nr && lookup.byId[country + '::' + nr.toLowerCase()]) unit = lookup.byId[country + '::' + nr.toLowerCase()];
    if(!unit && uname){
      // "67 · Bas-Rhin" → nur den Namensteil verwenden
      const namePart = uname.includes('·') ? uname.split('·').pop().trim() : uname;
      unit = lookup.byName[country + '::' + namePart.toLowerCase()];
    }
    if(!unit){ skipped++; continue; }

    const ym = iso.slice(0, 7);
    const key = [carrier, country, unit.id || '', unit.name, cargo, ym].join('||');
    const prev = groups.get(key);
    if(!prev || iso > prev.date){        // jüngster Preis des Monats gewinnt
      groups.set(key, {carrier, country, unit, cargo, date: iso, price, floater});
    }

    if(!knownCarriers.has(carrier.toLowerCase())) newCarriers.add(carrier);
  }

  // Neue Speditionen anlegen
  for(const nc of newCarriers){
    if(!carriers.some(c => c.toLowerCase() === nc.toLowerCase())) carriers.push(nc);
  }
  if(newCarriers.size) saveCarriers(carriers);

  // In die Preis-Datenbank schreiben
  let updated = 0, unchanged = 0;
  const perCargo = {Getrocknet:0, Frisch:0, Gemischt:0};
  for(const g of groups.values()){
    const key = priceKey(g.carrier, g.cargo, g.country, g.unit.name, g.unit.id);
    const storageKey = LOCAL_DB_PREFIX + key;
    let history = [];
    try{ const raw = localStorage.getItem(storageKey); if(raw) history = JSON.parse(raw); }catch(e){}
    const existing = history.find(h => h.date === g.date);
    if(existing){
      const sameFloat = (existing.floater || 0) === (g.floater || 0);
      if(Number(existing.price) === Number(g.price) && sameFloat){ unchanged++; continue; }
      existing.price = g.price;
      if(g.floater != null) existing.floater = g.floater; else delete existing.floater;
    } else {
      const rec = {date: g.date, price: g.price, source: 'excel-preise'};
      if(g.floater != null && g.floater > 0) rec.floater = g.floater;
      history.push(rec);
    }
    history.sort((a,b)=> (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    localStorage.setItem(storageKey, JSON.stringify(history));
    updated++;
    if(perCargo[g.cargo] != null) perCargo[g.cargo]++;
  }

  return {
    updatedCount: updated,
    unchangedCount: unchanged,
    skippedRows: skipped,
    newCarrierCount: newCarriers.size,
    newCarriers: [...newCarriers],
    perCargo: CARGO_TYPES.map(c => ({cargo: c, updated: perCargo[c] || 0})),
    longFormat: true,
  };
}

// Excel-Datum (Seriennummer, Date-Objekt oder Text) → ISO YYYY-MM-DD
function excelToIso(v){
  if(v == null || v === '') return null;
  if(v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0,10);
  if(typeof v === 'number'){
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0,10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);              if(m) return s.slice(0,10);
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);           // TT.MM.JJJJ
  if(m) return `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);           // MM/TT/JJJJ
  if(m) return `${m[3]}-${String(m[1]).padStart(2,'0')}-${String(m[2]).padStart(2,'0')}`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0,10);
}

// Zahl aus Excel/Text robust parsen (deutsche Formatierung: 1.234,50)
function parseGermanNumber(v){
  if(v == null || v === '') return null;
  if(typeof v === 'number') return v;
  let s = String(v).trim().replace(/[€\s]/g, '');
  if(s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if(s.includes(',')) s = s.replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

async function processUploadedRows(rows, cargo){
  cargo = cargo || DEFAULT_CARGO;
  if(!rows || rows.length < 2){
    return {error: 'Die Datei enthält keine auswertbaren Zeilen.'};
  }
  const carrierRow = rows[0];
  const headerRow = rows[1];

  // Speditionsnamen je Preis-Spaltenindex ermitteln (Preis-Spalte = gerade Position ab Index 4)
  const N_BASE = 4; // Land, Nummer/ID, Verwaltungseinheit, PLZ-Beispiele
  const carrierByPriceCol = {};
  for(let col = N_BASE; col < headerRow.length; col += 2){
    const headerLabel = headerRow[col];
    if(headerLabel !== 'Preis (EUR)') continue; // Format-Erwartung nicht erfüllt -> Spalte ignorieren
    // Speditionsname steht in carrierRow an derselben oder einer vorherigen Spalte (gemergte Zelle -> SheetJS liefert Wert nur in der ersten Spalte der Merge-Range)
    let name = carrierRow[col];
    if(!name){
      for(let back = col-1; back >= N_BASE; back--){
        if(carrierRow[back]){ name = carrierRow[back]; break; }
      }
    }
    if(name) carrierByPriceCol[col] = String(name).trim();
  }

  if(Object.keys(carrierByPriceCol).length === 0){
    return {error: 'Es wurden keine Speditions-Preisspalten im erwarteten Format ("Preis (EUR)" / "Update am") gefunden.'};
  }

  const {byName, byId} = buildUnitLookup();
  const knownCarriers = new Set(loadCarriers());
  const newCarriers = [];
  const today = new Date().toISOString().slice(0,10);

  // Alle Speditionen aus den Spaltenüberschriften übernehmen, auch wenn noch kein Preis
  // eingetragen ist - sie sollen direkt als Auswahl in der Spedition-Dropdown zur Verfügung
  // stehen, damit Preise anschließend in der App nachgetragen werden können.
  Object.values(carrierByPriceCol).forEach(carrierName=>{
    if(!knownCarriers.has(carrierName)){
      knownCarriers.add(carrierName);
      newCarriers.push(carrierName);
    }
  });

  let updatedCount = 0, unchangedCount = 0, skippedRows = 0;

  for(let r = 2; r < rows.length; r++){
    const row = rows[r];
    if(!row || row.every(v => v===null || v==='')) continue;
    const land = row[0] ? String(row[0]).trim() : '';
    const nummer = row[1] !== null && row[1] !== undefined ? String(row[1]).trim() : '';
    const name = row[2] ? String(row[2]).trim() : '';
    if(!land || !COUNTRIES[land]){ skippedRows++; continue; }

    let unit = null;
    if(nummer) unit = byId[land + '::' + nummer.toLowerCase()];
    if(!unit && name) unit = byName[land + '::' + name.toLowerCase()];
    if(!unit){ skippedRows++; continue; }

    for(const colStr of Object.keys(carrierByPriceCol)){
      const col = parseInt(colStr, 10);
      const carrierName = carrierByPriceCol[col];
      const priceVal = row[col];
      const dateVal = row[col+1];
      if(priceVal === null || priceVal === undefined || priceVal === '') continue;
      const price = parseFloat(priceVal);
      if(isNaN(price)) continue;
      const excelDate = excelSerialToIso(dateVal) || today;

      const key = priceKey(carrierName, cargo, land, unit.name, unit.id);
      let history = [];
      try{
        const res = await localDb.get(key);
        history = res ? JSON.parse(res.value) : [];
      }catch(e){ history = []; }

      const lastEntry = history.length > 0 ? history[history.length-1] : null;
      const lastDate = lastEntry ? lastEntry.date : null;

      // Nur übernehmen, wenn das Excel-Datum neuer oder gleich aktuell ist als der bisherige Web-Eintrag,
      // oder wenn überhaupt noch kein Eintrag vorliegt.
      const shouldApply = !lastEntry || excelDate >= lastDate;
      if(shouldApply && (!lastEntry || lastEntry.price !== price || lastEntry.date !== excelDate)){
        history.push({date: excelDate, price: price, source: 'excel-import'});
        try{ await localDb.set(key, JSON.stringify(history)); }catch(e){ console.error(e); }
        updatedCount++;
      } else {
        unchangedCount++;
      }
    }
  }

  if(newCarriers.length > 0){
    saveCarriers(Array.from(knownCarriers));
    populateCarrierSelect(loadCarriers());
  }

  return {updatedCount, unchangedCount, skippedRows, newCarriers, newCarrierCount: newCarriers.length};
}

// Fasst die Ergebnisse mehrerer Warentyp-Blätter zu einer Gesamtmeldung zusammen.
function mergeUploadResults(results){
  const valid = results.filter(r => !r.error);
  if(valid.length === 0){
    return {error: results.length ? results[0].error : 'Die Datei enthält keine auswertbaren Blätter.'};
  }
  const merged = {
    updatedCount: 0, unchangedCount: 0, skippedRows: 0,
    newCarriers: [], perCargo: [],
  };
  const carrierSet = new Set();
  for(const r of valid){
    merged.updatedCount   += r.updatedCount || 0;
    merged.unchangedCount += r.unchangedCount || 0;
    merged.skippedRows    += r.skippedRows || 0;
    (r.newCarriers || []).forEach(c => carrierSet.add(c));
    merged.perCargo.push({cargo: r.cargo, updated: r.updatedCount || 0});
  }
  merged.newCarriers = [...carrierSet];
  merged.newCarrierCount = merged.newCarriers.length;
  return merged;
}

function renderUploadSummary(result){
  const hint = document.getElementById('uploadHint');
  if(result.error){
    hint.textContent = result.error;
    hint.className = 'upload-hint error';
    return;
  }
  // Wöchentliche Datei-Uploads (Frachtenauswertung / Umsatz) eigenständig melden
  if(result.uploadKind === 'umsatz'){
    hint.innerHTML = `Umsatz-Datei übernommen · ${result.belegCount} Belege · ` +
      `${result.unitCount} Einheiten · ${(result.totalRevenue||0).toLocaleString('de-DE')} € Gesamtumsatz`;
    hint.className = 'upload-hint success';
    return;
  }
  if(result.uploadKind === 'fracht'){
    hint.innerHTML = `Frachtenauswertung übernommen · ${result.tripCount} Fahrten · ` +
      `${result.customerCount} Kunden · Ø ${(result.avgPrice||0).toLocaleString('de-DE')} € Fracht`;
    hint.className = 'upload-hint success';
    return;
  }
  // Aufschlüsselung je Warentyp, falls mehrere Blätter gelesen wurden
  const cargoDetail = (result.perCargo && result.perCargo.length > 1)
    ? '<br>' + result.perCargo.map(p => `${p.cargo}: ${p.updated}`).join(' · ')
    : '';
  hint.innerHTML = `${result.updatedCount} Preis(e) aktualisiert · ${result.unchangedCount} bereits aktuell` +
    (result.skippedRows ? ` · ${result.skippedRows} Zeile(n) übersprungen` : '') +
    (result.newCarrierCount ? ` · ${result.newCarrierCount} neue Spedition(en) angelegt` : '') +
    cargoDetail;
  hint.className = 'upload-hint success';
}
