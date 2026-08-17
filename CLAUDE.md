# Kontext für Claude Code

Dieses Dokument gibt Claude Code (und anderen) den nötigen Überblick, um im
Projekt effizient weiterzuarbeiten.

## Was ist das?

Der **Transportpreis-Atlas** ist eine vollständig offline-fähige HTML-App, die
Ausgangsfrachten, Umsätze und Logistikdaten auf einer interaktiven Europakarte
darstellt. Ausgabe sind zwei eigenständige HTML-Dateien (Desktop + Mobil), in
die sämtliche Skripte, Styles und Daten eingebettet sind.

## Wichtigste Regel: nicht die HTML editieren

Die Dateien in `dist/` sind **generiert**. Änderungen immer in `src/` (Code),
`data/` (Daten) oder den Templates vornehmen, dann neu bauen:

```bash
python scripts/build.py
```

## Architektur

- `src/template.html` / `src/template.mobile.html` — HTML-Gerüst + CSS, mit
  `__PLATZHALTERN__`, die der Build durch Code/Daten ersetzt.
- `src/*.js` — der eigentliche App-Code. **Desktop und Mobil teilen sich diese
  Dateien**; nur die Templates unterscheiden sich (Layout/CSS).
  - `app.js` — SVG-Karte, Kartenprojektion, Rendering, Länder-/Einheiten-Labels,
    Upload-Verarbeitung (`processFrachtUpload`, `processUmsatzUpload`,
    `detectUploadKind`), Zoom/Pan, `frachtZoneToCountry`, `plzToUnitName`.
  - `customers.js` — Kundenaggregation, `unitFreightAvg`, `countryRevenue`,
    `countryFreightTotal`, Cache-Verwaltung (`resetFreightCaches`).
  - `crm.js` — Umsatz-/Logistik-Datenmodell, `crmFahrtStats` (inkl.
    Kalenderwochen via `isoWeek`/`isoWeekKey`), `CRM_DATA_VERSION`.
  - `crm_ui.js` — Statistik-Modal, Monats-/KW-Umschaltung, CSV-Export.
  - `crm_connectors.js` — Upload-Handler + SharePoint/ERP-Anbindung (Skelett).
  - `upload_timer.js` — wöchentlicher Freitags-Upload-Timer.
  - `map_resize.js` — responsives Anpassen der Kartenhöhe.
- `data/*.json` — eingebettete Daten, erzeugt aus den Excel-Dateien.
- `lib/xlsx.core.min.js` — SheetJS; liest `.xlsx` **und** altes `.xls`.

## Daten neu erzeugen

Siehe `docs/DATEN-AKTUALISIEREN.md`. Kurz:

```bash
python scripts/data/build_fracht_data.py  fracht.xlsx
python scripts/data/build_umsatz_data.py  umsatz.xlsx
python scripts/data/build_crm_fahrten.py
python scripts/build.py
```

Die Geo-Zuordnung (Zone→Land, PLZ→Einheit) steckt in `scripts/data/_geo.py` und
spiegelt die Logik in `app.js`. **Wichtig:** Wenn die Zuordnung in `app.js`
geändert wird, muss `_geo.py` mitgezogen werden (und umgekehrt), sonst weichen
die eingebetteten Daten vom Live-Upload ab.

## Wichtige Fakten / Fallstricke

- **Excel-Format:** Die „xlsx“-Dateien sind teils echte alte `.xls`-Dateien
  (Magic `D0CF11E0`). Deshalb wird `xlsx.core.min.js` statt der Mini-Variante
  genutzt — die Mini-Variante wirft `parse_xlscfb is not defined`.
- **Dateityp-Erkennung** beim Upload erfolgt zuerst am **Dateinamen**
  (`fracht` → Ausgangsfrachten, `umsatz` → Umsatz), dann an den Spalten.
- **Lieferadresse vor Rechnungsadresse (Frachtenauswertung):** Weichen die
  Adressen ab, hat die **Lieferadresse** Vorrang. Deren PLZ steht in **Spalte M**
  (Index 12). Ist Spalte M befüllt, gilt diese PLZ, sonst die Standardadresse in
  **Spalte C**. Die Regel steckt gespiegelt in `app.js` (`processFrachtUpload`,
  Live-Upload) **und** `scripts/data/build_fracht_data.py` (Einbettung) — beide
  bei Änderungen mitziehen.
- **Spaltennamen variieren** (z. B. Kunde als `Kunde` oder `adressesb`). Die
  Erkennung nutzt exakte Treffer vor Präfix-Treffern; siehe `col(...)` in app.js
  bzw. `find_col(...)` in den Python-Skripten.
- **Europa-Ansicht** zeigt nur **eine Gesamtsumme pro Land**. Einzelne
  Einheiten (Departements etc.) erscheinen erst nach Klick auf ein Land.
- **`__EUROPE__`** ist eine App-Konstante (`EUROPE_KEY`), **kein** Build-Platzhalter.
- **Kalenderwochen** nach ISO 8601 (Woche beginnt montags).
- **`CRM_DATA_VERSION`** in `crm.js` bei Datenänderungen erhöhen — das erzwingt
  bei Bestandsnutzern eine Cache-Erneuerung (localStorage).

## Testen

Automatisierter Rauchtest (nur Python-Standardbibliothek, kein Browser nötig).
Baut `dist/` neu und prüft die Kernzahlen in **beiden** gebauten HTML-Dateien:

```bash
python scripts/test_smoke.py             # neu bauen + prüfen
python scripts/test_smoke.py --no-build  # nur die vorhandenen dist/-Dateien prüfen
```

Exit-Code 0 = bestanden, 1 = mind. eine Kennzahl weicht ab — direkt für CI /
einen Pre-Push-Hook geeignet. Die Sollwerte stehen zentral in
`scripts/test_smoke.py` (`EXPECTED`) und sind bei bewusster Datenaktualisierung
dort mitzuziehen.

Die geprüften Kennzahlen entsprechen genau dem manuellen Browser-Test
(`dist/…Desktop.html` laden, dann im Seitenkontext auswerten):

```js
Math.round(REVENUE_TRIPS.reduce((s,t)=>s+(t.revenue||0),0)*100)/100  // Umsatzsumme
Math.round(TRIPS.reduce((s,t)=>s+(t.price||0),0)*100)/100            // Frachtsumme
crmFahrtStats({}).gesamtFahrten                                       // Fahrtenzahl
```

Sollwerte des aktuellen Stands: Umsatz 33.206.300,38 €, Fracht 3.762.146,70 €,
3534 Fahrten, 282 Kunden.
