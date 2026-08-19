#!/usr/bin/env python3
"""
Transportpreis-Atlas — Rauchtest (Smoke-Test)

Prüft die Kernzahlen der App automatisiert und ohne Fremdpakete
(nur Python-Standardbibliothek, passend zur Build-Philosophie des Projekts).

Statt die HTML im Browser zu laden (wie im manuellen Test in CLAUDE.md),
liest dieser Test die in die **gebauten** HTML-Dateien eingebetteten
JSON-Datenblöcke aus und rechnet exakt dieselben Kernzahlen nach:

    Umsatzsumme  = Σ REVENUE_TRIPS.revenue   (aus UMSATZ_DATA.revenueTrips)
    Frachtsumme  = Σ TRIPS.price             (aus FRACHT_DATA.trips)
    Fahrten      = Σ fahrten.rows[i][4]       (crmFahrtStats({}).gesamtFahrten)
    Kunden       = len(FRACHT_DATA.customers)

Geprüft werden Desktop- UND Mobil-Datei; beide müssen dieselben Zahlen
liefern (sie teilen sich die Daten, nur das Layout unterscheidet sich).

Aufruf:
    python scripts/test_smoke.py            # baut vorher neu und testet
    python scripts/test_smoke.py --no-build # testet die vorhandenen dist/-Dateien

Rückgabewert: 0 = alle Prüfungen bestanden, 1 = mindestens eine gescheitert.
Damit eignet sich das Skript direkt für CI / einen Git-Pre-Push-Hook.
"""
import sys
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"

DESKTOP = DIST / "Transportpreis-Atlas_Desktop.html"
MOBIL = DIST / "Transportpreis-Atlas_Mobil.html"

# Sollwerte des aktuellen Stands (siehe CLAUDE.md → Abschnitt „Testen").
# Bei bewusster Datenaktualisierung hier mitziehen.
EXPECTED = {
    "umsatz": 33206300.38,   # Umsatzsumme in €
    "fracht": 4110519.79,    # Frachtsumme in €
    "fahrten": 3931,         # Gesamtzahl Fahrten
    "kunden": 290,           # Anzahl Frachtkunden
}
# Toleranz für die (gerundeten) Euro-Summen.
EUR_EPS = 0.005


def extract_json_block(html: str, element_id: str):
    """Liest den Inhalt eines <script id="..." type="application/json">-Blocks.

    Der Build ersetzt ein wörtliches ``</script>`` im eingebetteten Text durch
    ``<\\/script>`` (siehe build.py:safe_for_script) — das machen wir hier
    rückgängig, bevor wir das JSON parsen.
    """
    pattern = re.compile(
        r'<script\s+id="' + re.escape(element_id) + r'"[^>]*>(.*?)</script>',
        re.DOTALL,
    )
    m = pattern.search(html)
    if not m:
        raise AssertionError(f'JSON-Block "{element_id}" nicht in der HTML gefunden')
    raw = m.group(1).replace("<\\/script>", "</script>")
    return json.loads(raw)


def figures_from_html(path: Path) -> dict:
    """Rechnet die vier Kernzahlen aus einer gebauten HTML-Datei nach."""
    html = path.read_text(encoding="utf-8")

    fracht = extract_json_block(html, "fracht-data")
    umsatz = extract_json_block(html, "umsatz-data")
    crm = extract_json_block(html, "crm-demo-data")

    umsatz_sum = round(sum(t.get("revenue", 0) or 0
                           for t in umsatz.get("revenueTrips", [])) * 100) / 100
    fracht_sum = round(sum(t.get("price", 0) or 0
                           for t in fracht.get("trips", [])) * 100) / 100
    fahrten = sum(r[4] for r in crm.get("fahrten", {}).get("rows", []))
    kunden = len(fracht.get("customers", []))

    return {
        "umsatz": umsatz_sum,
        "fracht": fracht_sum,
        "fahrten": fahrten,
        "kunden": kunden,
    }


def check_file(path: Path) -> bool:
    """Prüft eine HTML-Datei gegen die Sollwerte. Gibt True bei Erfolg zurück."""
    print(f"\n{path.name}")
    if not path.exists():
        print(f"  FEHLT  {path} — bitte erst 'python scripts/build.py' ausführen")
        return False

    figs = figures_from_html(path)
    ok = True

    checks = [
        ("Umsatzsumme", figs["umsatz"], EXPECTED["umsatz"], "€", EUR_EPS),
        ("Frachtsumme", figs["fracht"], EXPECTED["fracht"], "€", EUR_EPS),
        ("Fahrten", figs["fahrten"], EXPECTED["fahrten"], "", 0),
        ("Kunden", figs["kunden"], EXPECTED["kunden"], "", 0),
    ]
    for name, got, want, unit, eps in checks:
        passed = abs(got - want) <= eps
        mark = "OK  " if passed else "FEHL"
        suffix = f" {unit}".rstrip()
        detail = "" if passed else f"  (erwartet {want:,.2f}{suffix})"
        print(f"  {mark}  {name}: {got:,.2f}{suffix}{detail}")
        ok = ok and passed
    return ok


def main() -> int:
    do_build = "--no-build" not in sys.argv

    if do_build:
        print("Baue dist/ neu …")
        res = subprocess.run(
            [sys.executable, str(ROOT / "scripts" / "build.py")],
            capture_output=True, text=True,
        )
        sys.stdout.write(res.stdout)
        if res.returncode != 0:
            sys.stderr.write(res.stderr)
            print("\nERGEBNIS: Build fehlgeschlagen.")
            return 1

    print("=" * 52)
    print("Transportpreis-Atlas — Rauchtest")
    print("=" * 52)

    all_ok = True
    for path in (DESKTOP, MOBIL):
        all_ok = check_file(path) and all_ok

    print("\n" + "=" * 52)
    print("ERGEBNIS:", "alle Prüfungen bestanden ✓" if all_ok
          else "Prüfungen GESCHEITERT ✗")
    print("=" * 52)
    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
