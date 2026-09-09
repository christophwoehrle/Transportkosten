# Transportpreis-Atlas

Interaktive, vollständig **offline-fähige** HTML-Anwendung zur Visualisierung von
Ausgangsfrachten, Umsätzen und Logistikdaten auf einer Europakarte.

Es gibt zwei Ausgabevarianten aus derselben Codebasis:

- **Desktop** — für den Rechner
- **Mobil** — für Smartphone/Tablet

Beide Dateien sind eigenständige HTML-Dateien: alle Skripte, Styles und Daten
sind eingebettet. Kein Server, keine Internetverbindung nötig.

---

## Schnellstart

```bash
# Beide Versionen bauen
python scripts/build.py

# Nur eine Version
python scripts/build.py desktop
python scripts/build.py mobile
```

Die fertigen Dateien liegen danach in `dist/`:

- `dist/Transportpreis-Atlas_Desktop.html`
- `dist/Transportpreis-Atlas_Mobil.html`

Zum Ansehen einfach im Browser öffnen (Doppelklick genügt).

Voraussetzung: **Python 3** (nur Standardbibliothek, keine Pakete nötig).

---

## Testen

Ein automatisierter Rauchtest baut `dist/` neu und prüft die Kernzahlen
(Umsatz-, Fracht-, Fahrten- und Kundensumme) in beiden gebauten HTML-Dateien —
ganz ohne Browser oder Fremdpakete:

```bash
python scripts/test_smoke.py             # neu bauen + prüfen
python scripts/test_smoke.py --no-build  # nur vorhandene dist/-Dateien prüfen
```

Exit-Code 0 = bestanden, 1 = eine Kennzahl weicht ab (CI-/Pre-Push-tauglich).

---

## Projektstruktur

```
.
├── src/                     Quelldateien (hier wird entwickelt)
│   ├── template.html            HTML-Gerüst + CSS (Desktop) mit __PLATZHALTERN__
│   ├── template.mobile.html     HTML-Gerüst + CSS (Mobil)
│   ├── app.js                   Karte, Projektion, Rendering, Upload-Verarbeitung
│   ├── customers.js             Kunden, Ø-Frachtpreise, Länder-Summen (Umsatz/Fracht)
│   ├── crm.js                   Umsatz-/Logistik-Logik, Fahrten-Statistik, KW-Berechnung
│   ├── crm_ui.js                Statistik-Modal, Seitenpanel, Detailansicht
│   ├── crm_connectors.js        Upload-Handler + SharePoint/ERP-Anbindung (Skelett)
│   ├── upload_timer.js          Wöchentlicher Freitags-Upload-Timer
│   └── map_resize.js            Responsives Anpassen der Kartenhöhe
│
├── data/                    Eingebettete Daten (aus Excel erzeugt)
│   ├── app_data.json            Geodaten (Länder + Verwaltungseinheiten) + PLZ-Mapping
│   ├── fracht_data.json         Fahrten/Kunden aus der Frachtenauswertung
│   ├── umsatz_data.json         Umsatzsummen je Einheit/Kunde + Belege
│   └── crm_demo.json            Fahrten-Statistik + Logistik (aus echten Fahrten)
│
├── lib/
│   └── xlsx.core.min.js         SheetJS (liest .xlsx UND altes .xls)
│
├── scripts/
│   ├── build.py                 Setzt src/ + data/ zu den HTML-Dateien zusammen
│   └── data/                    Skripte zur Aufbereitung der Excel-Dateien → data/*.json
│
├── dist/                    Build-Ergebnisse (werden erzeugt, nicht versioniert)
├── docs/                    Weiterführende Doku
└── README.md
```

---

## Wie der Build funktioniert

`scripts/build.py` liest `src/template.html` bzw. `src/template.mobile.html` und
ersetzt darin Platzhalter durch die tatsächlichen Inhalte:

| Platzhalter               | Quelle                     |
|---------------------------|----------------------------|
| `__XLSX_LIB__`            | `lib/xlsx.core.min.js`     |
| `__APP_JS__`              | `src/app.js`               |
| `__CUSTOMERS_JS__`        | `src/customers.js`         |
| `__CRM_JS__`              | `src/crm.js`               |
| `__CRM_UI_JS__`           | `src/crm_ui.js`            |
| `__CRM_CONNECTORS_JS__`   | `src/crm_connectors.js`    |
| `__UPLOAD_TIMER_JS__`     | `src/upload_timer.js`      |
| `__MAP_RESIZE_JS__`       | `src/map_resize.js`        |
| `__APP_DATA__`            | `data/app_data.json`       |
| `__FRACHT_DATA__`         | `data/fracht_data.json`    |
| `__UMSATZ_DATA__`         | `data/umsatz_data.json`    |
| `__CRM_DEMO__`            | `data/crm_demo.json`       |

Desktop und Mobil teilen sich **denselben** Code in `src/*.js` — sie
unterscheiden sich nur durch das jeweilige Template (Layout/CSS).

---

## Daten aktualisieren (wöchentliches Update)

Es gibt zwei Wege, neue Zahlen in die App zu bekommen:

### 1. Direkt in der App (temporär, nur lokal)

In der laufenden App über „Excel hochladen“ die Frachten- bzw. Umsatzdatei
einspielen. Die Anzeige aktualisiert sich sofort — **aber nur im Browser der
Person, die hochlädt.** Gut zum schnellen Nachsehen.

Die App erkennt den Dateityp **am Dateinamen**:
- Name enthält `fracht` → Ausgangsfrachten/Logistik
- Name enthält `umsatz` → Umsatz

### 2. Fest einbetten (für die Verteilung an alle)

Damit **alle** dieselben Zahlen sehen (z. B. über SharePoint), werden die Daten
fest in die HTML eingebaut:

```bash
# Excel-Dateien nach scripts/data/ legen, dann:
python scripts/data/build_fracht_data.py     # -> data/fracht_data.json
python scripts/data/build_umsatz_data.py     # -> data/umsatz_data.json
python scripts/data/build_crm_fahrten.py     # -> data/crm_demo.json (Statistik/Logistik)
python scripts/build.py                       # neue HTML in dist/
```

Siehe `docs/DATEN-AKTUALISIEREN.md` für Details zu den erwarteten Excel-Spalten.

---

## Erwartete Excel-Struktur

**Ausgangsfrachten** (Dateiname enthält „fracht“):

| Spalte | Inhalt              |
|--------|---------------------|
| A      | Datum               |
| B      | Frachtzone (Land)   |
| C      | PLZ                 |
| D      | Fracht-Entgelt      |
| E      | Speditionsname      |
| F      | Menge (m³)          |
| G      | Belegnummer         |
| H      | Anzahl Belege       |
| I      | Kundenkürzel        |
| J      | Artikel             |
| M      | Lieferadresse-PLZ (Vorrang, s. u.) |

Weichen **Rechnungs- und Lieferadresse** ab, hat die Lieferadresse Vorrang:
Ist die PLZ in **Spalte M** befüllt, wird sie verwendet, sonst die PLZ aus
**Spalte C**.

**Umsatz** (Dateiname enthält „umsatz“):

| Spalte | Inhalt              |
|--------|---------------------|
| A      | Datum               |
| B      | Frachtzone (Land)   |
| C      | PLZ                 |
| D      | Netto / Umsatz      |
| E      | Menge (m³)          |
| F      | Belegnummer         |
| G      | Kundenkürzel        |
| H      | Lieferadresse       |
| I      | Artikel             |

Die Spaltenerkennung ist tolerant gegenüber abweichenden Überschriften
(z. B. `Frachtzone`/`Zone`/`Land`, `Netto`/`Umsatz`, `Fracht-Entgelt`/`Frachtpreis`).
Sowohl echtes `.xlsx` als auch altes `.xls` (mit falscher `.xlsx`-Endung) werden gelesen.

---

## Funktionsüberblick

- **Drei Module:** Ausgangsfrachten · Umsatz · Logistik
- **Europa-Ansicht:** eine Gesamtsumme pro Land; Maus-over vergrößert die Zahl
  und hebt die Landesgrenze hervor; Klick zoomt in die Länderebene
- **Länderebene:** einzelne Departements/Bundesländer/Regionen mit Ø-Frachtpreis
  bzw. Umsatzsumme
- **Kunden-Stecknadeln** in Landesfarben, mit Suche und Detailpanel
- **Fahrten-Statistik** mit Umschaltung **Monat / Kalenderwoche** (ISO 8601)
- **Wöchentlicher Upload-Timer** (Freitag zu Freitag)
- Vollständig **offline**, alle Daten eingebettet

---

## Lizenz / intern

Internes Werkzeug. Nicht zur Weitergabe außerhalb des Unternehmens bestimmt.
