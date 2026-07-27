// ============================================================================
//  KARTENHÖHEN-REGLER — Kartenfenster per Maus/Touch in der Höhe verändern
// ============================================================================
(function(){
  const MAP_HEIGHT_KEY = 'transportpreis-atlas::map-height';
  const MIN_H = 220;          // Mindesthöhe des Kartenfensters
  const MIN_SPACER = 60;      // Mindest-Rest unter der Karte, damit der Regler greifbar bleibt

  function els(){
    return {
      area:   document.querySelector('.map-area'),
      wrap:   document.querySelector('.map-canvas-wrap'),
      handle: document.getElementById('mapResizeHandle'),
      tabs:   document.querySelector('.country-tabs'),
    };
  }

  function maxHeight(e){
    // verfügbare Höhe der Map-Area minus Ländertabs, Regler und Mindest-Rest
    const areaH = e.area.clientHeight;
    const tabsH = e.tabs ? e.tabs.offsetHeight : 0;
    const handleH = e.handle.offsetHeight;
    return Math.max(MIN_H, areaH - tabsH - handleH - MIN_SPACER);
  }

  function applyHeight(h, persist){
    const e = els();
    if(!e.area || !e.wrap) return;
    const clamped = Math.min(Math.max(h, MIN_H), maxHeight(e));
    e.area.classList.add('map-resized');
    e.wrap.style.height = clamped + 'px';
    if(persist){
      try{ localStorage.setItem(MAP_HEIGHT_KEY, String(Math.round(clamped))); }catch(_){}
    }
    if(typeof applyTransform === 'function') applyTransform();
  }

  function resetHeight(){
    const e = els();
    if(!e.area || !e.wrap) return;
    e.area.classList.remove('map-resized');
    e.wrap.style.height = '';
    try{ localStorage.removeItem(MAP_HEIGHT_KEY); }catch(_){}
    if(typeof applyTransform === 'function') applyTransform();
  }

  function setupMapResize(){
    const e = els();
    if(!e.handle || !e.wrap) return;

    let dragging = false, startY = 0, startH = 0;

    function onDown(ev){
      dragging = true;
      startY = (ev.touches ? ev.touches[0].clientY : ev.clientY);
      startH = e.wrap.getBoundingClientRect().height;
      e.handle.classList.add('dragging');
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
      ev.preventDefault();
      window.addEventListener('mousemove', onMove);
      window.addEventListener('touchmove', onMove, {passive:false});
      window.addEventListener('mouseup', onUp);
      window.addEventListener('touchend', onUp);
    }
    function onMove(ev){
      if(!dragging) return;
      const y = (ev.touches ? ev.touches[0].clientY : ev.clientY);
      applyHeight(startH + (y - startY), false);
      ev.preventDefault();
    }
    function onUp(){
      if(!dragging) return;
      dragging = false;
      e.handle.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      // aktuelle Höhe persistieren
      const h = e.wrap.getBoundingClientRect().height;
      try{ localStorage.setItem(MAP_HEIGHT_KEY, String(Math.round(h))); }catch(_){}
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchend', onUp);
    }

    e.handle.addEventListener('mousedown', onDown);
    e.handle.addEventListener('touchstart', onDown, {passive:false});
    // Doppelklick setzt auf volle Höhe zurück
    e.handle.addEventListener('dblclick', resetHeight);

    // gespeicherte Höhe wiederherstellen
    try{
      const saved = parseInt(localStorage.getItem(MAP_HEIGHT_KEY), 10);
      if(saved && !isNaN(saved)) applyHeight(saved, false);
    }catch(_){}

    // bei Fenstergrößenänderung Höhe neu begrenzen
    window.addEventListener('resize', ()=>{
      if(e.area.classList.contains('map-resized')){
        const cur = e.wrap.getBoundingClientRect().height;
        applyHeight(cur, false);
      }
    });
  }

  // in bestehende Initialisierung einhängen
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', ()=> setTimeout(setupMapResize, 0));
  } else {
    setTimeout(setupMapResize, 0);
  }
})();
