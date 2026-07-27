# Daten aktualisieren

Diese Anleitung beschreibt das **wöchentliche Update** der eingebetteten Zahlen.
Am Ende stehen zwei frische HTML-Dateien in `dist/`, die an das Team verteilt
werden können.

## Voraussetzungen

- Python 3 mit `pandas` und `openpyxl` (für `.xlsx`) sowie `xlrd` (für altes `.xls`):

  ```bash
  pip install pandas openpyxl xlrd
  ```

## Ablauf

1. **Excel-Dateien bereitstellen.** Lege die aktuellen Auswertungen an einen
   Ort, den du kennst (z. B. den Projektordner). Wichtig ist nur der Dateiname:
   - Frachtenauswertung: Dateiname enthält `fracht`
   - Umsatz: Dateiname enthält `umsatz`

   Beides funktioniert als echtes `.xlsx` **und** als altes `.xls` (auch wenn
   die Datei fälschlich auf `.xlsx` endet).

2. **Daten erzeugen** (Reihenfolge beachten – die Statistik baut auf den
   Frachtdaten auf):

   ```bash
   python scripts/data/build_fracht_data.py  pfad/zu/frachtenauswertung.xlsx
   python scripts/data/build_umsatz_data.py  pfad/zu/umsatz.xlsx
   python scripts/data/build_crm_fahrten.py
   ```

   Jedes Skript gibt eine Kurzbilanz aus (Summe, Anzahl, Zeitraum). Prüfe kurz,
   ob die Summen zu den Excel-Spalten D passen.

3. **HTML bauen:**

   ```bash
   python scripts/build.py
   ```

4. **Verteilen.** Die Dateien in `dist/` nach SharePoint hochladen bzw. an das
   Team weitergeben.

## Erwartete Spalten

### Frachtenauswertung (`fracht`)

| Spalte | Inhalt            | Pflicht |
|--------|-------------------|---------|
| A      | Datum             | ja      |
| B      | Frachtzone (Land) | ja      |
| C      | PLZ               | ja      |
| D      | Fracht-Entgelt    | ja      |
| E      | Speditionsname    | –       |
| F      | Menge (m³)        | –       |
| G      | Belegnummer       | –       |
| H      | Anzahl Belege     | –       |
| I      | Kundenkürzel      | ja      |
| J      | Artikel           | –       |

### Umsatz (`umsatz`)

| Spalte | Inhalt            | Pflicht |
|--------|-------------------|---------|
| A      | Datum             | ja      |
| B      | Frachtzone (Land) | ja      |
| C      | PLZ               | ja      |
| D      | Netto / Umsatz    | ja      |
| E      | Menge (m³)        | –       |
| F      | Belegnummer       | –       |
| G      | Kundenkürzel      | ja      |
| H      | Lieferadresse     | –       |
| I      | Artikel           | –       |

## Spaltenerkennung

Die Skripte erkennen Spalten **anhand der Überschrift** (nicht der Position) und
sind tolerant gegenüber Varianten:

- Land: `Frachtzone`, `Zone`, `Land`, `frachtzonesb`
- Wert (Fracht): `Fracht-Entgelt`, `frachtentgelt`, `Frachtpreis`, `Entgelt`, `Preis`
- Wert (Umsatz): `Netto`, `Umsatz`
- Kunde: `Kunde`, `adressesb`, `Kundenkürzel`
- Spedition: `Spedition`, `Speditionsname`, `Fracht-Nachname`, `nachname`

## Land- und PLZ-Zuordnung

- **Spalte B** enthält die Frachtzone (z. B. `GB`, `D`, `85`, `SLO`). Daraus wird
  das Land bestimmt (gleiche Logik wie in der App).
- **Spalte C** (PLZ) bestimmt die Verwaltungseinheit innerhalb des Landes:
  - Frankreich/Deutschland: 2-stelliges Präfix
  - UK: Outward Code (`CB22` aus `CB22 4QH`)
  - Niederlande: 4 Ziffern
  - Slowenien: erste Ziffer
  - Italien/Spanien/Portugal/Belgien/Schweiz: 1–3 Ziffern

Belege ohne zuordenbare Einheit (z. B. Irland ohne Grafschaft) zählen weiterhin
in die Landessumme und die Fahrten-Statistik, erscheinen aber nicht als
einzelne Region auf der Karte.

## Wenn sich das Excel-Format ändert

Passe die `find_col(...)`-Aufrufe im jeweiligen `scripts/data/build_*.py` an
(dort werden die Spaltennamen/Aliase gepflegt). Bei einer neuen Land-Kennung in
Spalte B ergänze `zone_to_country(...)` in `scripts/data/_geo.py`.
