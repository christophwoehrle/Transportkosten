#!/usr/bin/env python3
"""
Umsatz-Auswertung (Excel)  ->  data/umsatz_data.json

Aufruf:
    python scripts/data/build_umsatz_data.py <pfad-zur-umsatz.xlsx>
    python scripts/data/build_umsatz_data.py          # sucht *umsatz*.xlsx im aktuellen Ordner

Erzeugt Umsatzsummen je Verwaltungseinheit und je Kunde sowie die Einzelbelege
(für Woche/Year-to-date je Land).

Spalten (tolerant erkannt):
  A Datum · B Frachtzone · C PLZ · D Netto/Umsatz · E Menge
  F Belegnummer · G Kundenkürzel · H Lieferadresse · I Artikel
"""
import sys
import json
import glob
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _geo import zone_to_country, plz_to_unit, parse_date  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent.parent
OUT = ROOT / "data" / "umsatz_data.json"


def find_col(cols, *names):
    low = {str(c).strip().lower(): c for c in cols}
    for n in names:
        for k, orig in low.items():
            if k == n:
                return orig
    for n in names:
        for k, orig in low.items():
            if k.startswith(n):
                return orig
    return None


def main():
    if len(sys.argv) > 1:
        path = sys.argv[1]
    else:
        cands = [f for f in glob.glob("*.xls*") if "umsatz" in f.lower()]
        if not cands:
            sys.exit("Keine Umsatz-Datei gefunden. Pfad als Argument angeben.")
        path = cands[0]
    print(f"Lese: {path}")

    df = pd.read_excel(path, header=0)
    C = df.columns
    c_datum = find_col(C, "datum")
    c_zone = find_col(C, "frachtzone", "zone", "land")
    c_plz = find_col(C, "plz", "postleit")
    c_netto = find_col(C, "netto", "umsatz")
    c_beleg = find_col(C, "nummer", "belegnummer", "lieferschein")
    c_kunde = find_col(C, "kunde", "kundenkuerzel")
    c_art = find_col(C, "artikel")

    unit_rev, cust_rev, trips = {}, {}, []
    total = 0.0
    for _, r in df.iterrows():
        netto = r.get(c_netto)
        if pd.isna(netto):
            continue
        netto = float(netto)
        land = zone_to_country(r.get(c_zone), r.get(c_plz))
        unit = plz_to_unit(land, r.get(c_plz)) if land else None
        kunde = str(r.get(c_kunde)).strip() if c_kunde and pd.notna(r.get(c_kunde)) else None
        art = str(r.get(c_art)).strip() if c_art and pd.notna(r.get(c_art)) else None
        beleg = str(r.get(c_beleg)).strip() if c_beleg and pd.notna(r.get(c_beleg)) else ""
        iso = parse_date(r.get(c_datum))

        total += netto
        trips.append({"date": iso, "country": land, "unit": unit,
                      "revenue": round(netto, 2), "customer": kunde,
                      "article": art, "ls": beleg, "docs": 1})
        if land and unit:
            key = f"{land}::{unit}"
            e = unit_rev.setdefault(key, {"sum": 0.0, "count": 0})
            e["sum"] += netto
            e["count"] += 1
        if kunde:
            c = cust_rev.setdefault(kunde, {"sum": 0.0, "count": 0, "articles": {}})
            c["sum"] += netto
            c["count"] += 1
            if art:
                c["articles"][art] = c["articles"].get(art, 0) + 1

    for e in unit_rev.values():
        e["sum"] = round(e["sum"], 2)
    for c in cust_rev.values():
        c["sum"] = round(c["sum"], 2)

    dates = sorted(t["date"] for t in trips if t["date"])
    out = {
        "unitRevenue": unit_rev,
        "customerRevenue": cust_rev,
        "revenueTrips": trips,
        "meta": {"source": Path(path).name, "rowCount": len(trips), "tripCount": len(trips),
                 "unitCount": len(unit_rev), "customerCount": len(cust_rev),
                 "totalRevenue": round(total, 2),
                 "dateFrom": dates[0] if dates else None,
                 "dateTo": dates[-1] if dates else None},
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=0), encoding="utf-8")
    print(f"OK  data/umsatz_data.json")
    print(f"  Belege: {len(trips)} | Einheiten: {len(unit_rev)} | Kunden: {len(cust_rev)}")
    print(f"  Umsatz-Summe: {total:,.2f} EUR | Zeitraum: {dates[0]} … {dates[-1]}")


if __name__ == "__main__":
    main()
