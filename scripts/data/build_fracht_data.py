#!/usr/bin/env python3
"""
Frachtenauswertung (Excel)  ->  data/fracht_data.json

Aufruf:
    python scripts/data/build_fracht_data.py <pfad-zur-frachten.xlsx>
    python scripts/data/build_fracht_data.py            # sucht *fracht*.xlsx im aktuellen Ordner

Erzeugt Fahrten (trips), aggregierte Kunden (mit Kartenkoordinaten) und die
Speditionsliste im Format, das die App erwartet.

Spalten (tolerant erkannt, Reihenfolge wie in der Frachtenauswertung):
  A Datum · B Frachtzone · C PLZ · D Fracht-Entgelt · E Speditionsname
  F Menge · G Belegnummer · H Anzahl Belege · I Kundenkürzel · J Artikel
"""
import sys
import json
import glob
import random
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _geo import zone_to_country, plz_to_unit, parse_date, COUNTRIES  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent.parent
OUT = ROOT / "data" / "fracht_data.json"


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


def unit_polys(country, unit_name):
    c = COUNTRIES.get(country)
    if not c:
        return None
    u = next((x for x in c["units"] if x["name"] == unit_name), None)
    if not u or not u.get("geometry"):
        return None
    g = u["geometry"]
    return [g["coordinates"][0]] if g["type"] == "Polygon" else [poly[0] for poly in g["coordinates"]]


def point_in_ring(ring, x, y):
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-12) + xi):
            inside = not inside
        j = i
    return inside


def place_in_unit(country, unit_name, seed):
    rings = unit_polys(country, unit_name)
    if not rings:
        return None
    xs = [p[0] for r in rings for p in r]
    ys = [p[1] for r in rings for p in r]
    minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
    rng = random.Random(seed)
    for _ in range(60):
        x = minx + rng.random() * (maxx - minx)
        y = miny + rng.random() * (maxy - miny)
        if any(point_in_ring(r, x, y) for r in rings):
            return [round(x, 6), round(y, 6)]
    return [round((minx + maxx) / 2, 6), round((miny + maxy) / 2, 6)]


def main():
    if len(sys.argv) > 1:
        path = sys.argv[1]
    else:
        cands = [f for f in glob.glob("*.xls*") if "fracht" in f.lower()]
        if not cands:
            sys.exit("Keine Frachten-Datei gefunden. Pfad als Argument angeben.")
        path = cands[0]
    print(f"Lese: {path}")

    df = pd.read_excel(path, header=0)
    C = df.columns
    c_datum = find_col(C, "datum")
    c_zone = find_col(C, "frachtzone", "zone", "land")
    c_plz = find_col(C, "plz", "postleit")
    c_preis = find_col(C, "fracht-entgelt", "frachtentgelt", "frachtpreis", "entgelt", "preis")
    c_sped = find_col(C, "spedition", "speditionsname", "fracht-nachname", "nachname")
    c_menge = find_col(C, "menge")
    c_beleg = find_col(C, "nummer", "belegnummer", "lieferschein")
    c_anz = find_col(C, "belegteil", "anzahl", "belege")
    c_kunde = find_col(C, "kunde", "adressesb", "kundenkuerzel")
    # Kunde vs. Lieferadresse: 'adressesb' (Kunde) vor 'adressesb1' (Adresse)
    if c_kunde and str(c_kunde).lower() == "adressesb1":
        c_kunde = find_col(C, "adressesb") or c_kunde

    trips, cust_map, carriers = [], {}, set()
    for _, r in df.iterrows():
        land = zone_to_country(r.get(c_zone), r.get(c_plz))
        unit = plz_to_unit(land, r.get(c_plz)) if land else None
        price = r.get(c_preis)
        price = float(price) if pd.notna(price) else 0.0
        kunde = str(r.get(c_kunde)).strip() if pd.notna(r.get(c_kunde)) else None
        sped = str(r.get(c_sped)).strip() if c_sped and pd.notna(r.get(c_sped)) else None
        vol = float(r.get(c_menge)) if c_menge and pd.notna(r.get(c_menge)) else 0.0
        docs = int(r.get(c_anz)) if c_anz and pd.notna(r.get(c_anz)) else 1
        beleg = str(r.get(c_beleg)).strip() if c_beleg and pd.notna(r.get(c_beleg)) else ""
        iso = parse_date(r.get(c_datum))

        t = {"date": iso, "country": land, "unit": unit,
             "plz": str(r.get(c_plz)).strip() if pd.notna(r.get(c_plz)) else "",
             "price": round(price, 2), "carrier": sped, "customer": kunde,
             "ls": beleg, "docs": docs, "volume": round(vol, 3)}
        trips.append(t)
        if sped:
            carriers.add(sped)
        if kunde:
            c = cust_map.setdefault(kunde, {"code": kunde, "country": land, "unit": unit,
                                            "plz": t["plz"], "trips": 0, "revenue": 0.0,
                                            "volume": 0.0, "docs": 0, "lastDate": None,
                                            "carriers": {}})
            c["trips"] += 1
            c["revenue"] += price
            c["volume"] += vol
            c["docs"] += docs
            if sped:
                c["carriers"][sped] = c["carriers"].get(sped, 0) + 1
            if iso and (not c["lastDate"] or iso > c["lastDate"]):
                c["lastDate"] = iso
                c["country"], c["unit"], c["plz"] = land, unit, t["plz"]

    customers = []
    for c in cust_map.values():
        c["revenue"] = round(c["revenue"], 2)
        c["volume"] = round(c["volume"], 3)
        c["topCarrier"] = max(c["carriers"], key=c["carriers"].get) if c["carriers"] else None
        if c["country"] and c["unit"]:
            c["lonlat"] = place_in_unit(c["country"], c["unit"], c["code"])
        else:
            c["lonlat"] = None
        customers.append(c)

    dates = sorted(t["date"] for t in trips if t["date"])
    out = {
        "carriers": sorted(carriers),
        "customers": customers,
        "trips": trips,
        "meta": {"source": Path(path).name, "rowCount": len(trips), "tripCount": len(trips),
                 "customerCount": len(customers), "carrierCount": len(carriers),
                 "dateFrom": dates[0] if dates else None,
                 "dateTo": dates[-1] if dates else None},
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=0), encoding="utf-8")
    total = sum(t["price"] for t in trips)
    print(f"OK  data/fracht_data.json")
    print(f"  Fahrten: {len(trips)} | Kunden: {len(customers)} | Speditionen: {len(carriers)}")
    print(f"  Frachtpreis-Summe: {total:,.2f} EUR | Zeitraum: {dates[0]} … {dates[-1]}")


if __name__ == "__main__":
    main()
