/* ══════════════════════════════════════════════════════════════════════════
   WÖCHENTLICHER UPLOAD-TIMER

   Zählt die Tage bis zum nächsten Freitag und erinnert an den wöchentlichen
   Upload der beiden Excel-Dateien (Frachtenauswertung + Umsatz). Sobald in der
   laufenden Woche BEIDE Dateien hochgeladen wurden, wechselt der Timer auf
   „erledigt"; mit dem nächsten Freitag beginnt die Zählung von neuem.
   ══════════════════════════════════════════════════════════════════════════ */

const UPLOAD_TIMER_KEY = 'transportpreis-atlas::upload-status';

// Der „Stichtag" ist Freitag. Ein Wochenfenster läuft von einem Freitag (00:00)
// bis zum nächsten Freitag. Uploads innerhalb desselben Fensters zählen zusammen.
function currentFridayWindowStart(now){
  now = now || new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // heute 00:00
  const day = d.getDay();                 // 0=So … 5=Fr … 6=Sa
  // Tage seit dem letzten Freitag (Fr=0, Sa=1, So=2, Mo=3, …, Do=6)
  const sinceFriday = (day - 5 + 7) % 7;
  const start = new Date(d);
  start.setDate(d.getDate() - sinceFriday);
  return start;                            // letzter Freitag 00:00
}

// Tage bis zum nächsten Freitag (heute=Freitag → 0, sonst 1..6).
function daysUntilNextFriday(now){
  now = now || new Date();
  const day = now.getDay();
  return (5 - day + 7) % 7;
}

function loadUploadStatus(){
  try{
    const raw = localStorage.getItem(UPLOAD_TIMER_KEY);
    if(raw) return JSON.parse(raw);
  }catch(e){}
  return {frachtDate: null, umsatzDate: null};
}
function saveUploadStatus(s){
  try{ localStorage.setItem(UPLOAD_TIMER_KEY, JSON.stringify(s)); }catch(e){}
}

// Liegt ein gespeichertes Upload-Datum im aktuellen Freitag-Fenster?
function isInCurrentWindow(iso){
  if(!iso) return false;
  const upload = new Date(iso);
  const start = currentFridayWindowStart();
  const end = new Date(start); end.setDate(start.getDate() + 7);
  return upload >= start && upload < end;
}

// Wird nach jedem Upload aufgerufen: 'fracht' | 'umsatz'
function markUploadDone(kind){
  const s = loadUploadStatus();
  const nowIso = new Date().toISOString();
  if(kind === 'fracht') s.frachtDate = nowIso;
  else if(kind === 'umsatz') s.umsatzDate = nowIso;
  saveUploadStatus(s);
  renderUploadTimer();
}

function renderUploadTimer(){
  const box = document.getElementById('uploadTimer');
  if(!box) return;
  const countEl = document.getElementById('utCount');
  const labelEl = document.getElementById('utLabel');
  const statusEl = document.getElementById('utStatus');

  const s = loadUploadStatus();
  const frachtOk = isInCurrentWindow(s.frachtDate);
  const umsatzOk = isInCurrentWindow(s.umsatzDate);
  const bothOk = frachtOk && umsatzOk;

  const days = daysUntilNextFriday();

  box.classList.toggle('done', bothOk);
  box.classList.toggle('due', !bothOk && days <= 1);   // Fr/Do → dringend

  if(bothOk){
    // Beide Dateien in dieser Woche hochgeladen → erledigt bis zum nächsten Freitag
    countEl.textContent = '✓';
    labelEl.textContent = 'Upload erledigt';
    statusEl.textContent = days === 0 ? 'nächster Freitag: heute' : 'nächster in ' + days + ' T';
    box.title = 'Beide Excel-Dateien dieser Woche hochgeladen. Nächster Upload zum kommenden Freitag.';
  } else {
    countEl.textContent = days === 0 ? 'heute' : days;
    labelEl.textContent = days === 0 ? 'Upload fällig' : (days === 1 ? 'Tag bis Freitag' : 'Tage bis Freitag');
    // Welche Datei fehlt noch?
    const missing = [];
    if(!frachtOk) missing.push('Frachten');
    if(!umsatzOk) missing.push('Umsatz');
    statusEl.textContent = missing.length === 2 ? 'beide offen'
                          : 'noch: ' + missing.join(' + ');
    box.title = 'Wöchentlicher Upload bis Freitag. Offen: ' + missing.join(' und ') + '.';
  }
}

// Beim Laden + täglich aktualisieren (falls die App länger offen bleibt)
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', ()=>{ renderUploadTimer(); });
} else {
  renderUploadTimer();
}
setInterval(renderUploadTimer, 60 * 60 * 1000);   // stündlich neu berechnen
