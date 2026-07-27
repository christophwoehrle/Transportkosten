#!/usr/bin/env python3
"""
Fahrten-Statistik + Logistik  ->  data/crm_demo.json

Liest die bereits aufbereitete data/fracht_data.json und erzeugt daraus:
  - fahrten:  Kompaktformat für die Fahrten-Statistik (Spedition/Monat/KW)
  - logistik: Kosten & Fahrten je Einheit × Spedition

Alle Demo-Kunden/-Umsätze werden geleert — es zählen nur die echten Daten.
Vor diesem Skript muss build_fracht_data.py gelaufen sein.

Aufruf:
    python scripts/data/build_crm_fahrten.py
"""
import json
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
DATA = ROOT / "data"

fracht = json.loads((DATA / "fracht_data.json").read_text(encoding="utf-8"))
demo_path = DATA / "crm_demo.json"
demo = json.loads(demo_path.read_text(encoding="utf-8")) if demo_path.exists() else {"meta": {}}
app = json.loads((DATA / "app_data.json").read_text(encoding="utf-8"))
COUNTRIES = app["countries"]

unit_id = {}
for land, c in COUNTRIES.items():
    for u in c["units"]:
        unit_id[(land, u["name"])] = u.get("id") or ""

trips = [t for t in fracht["trips"] if t.get("date") and t.get("country")]
if not trips:
    raise SystemExit("Keine Fahrten mit Datum+Land gefunden")


def uname(t):
    return t.get("unit") or "(ohne Zuordnung)"


dates = sorted(t["date"] for t in trips)
epoch = dates[0]
epoch_d = date.fromisoformat(epoch)

speditionen = sorted({(t.get("carrier") or "—") for t in trips})
sped_idx = {s: i for i, s in enumerate(speditionen)}
unit_keys = sorted({(t["country"], unit_id.get((t["country"], uname(t)), ""), uname(t)) for t in trips})
unit_idx = {k: i for i, k in enumerate(unit_keys)}

rows = []
for t in trips:
    tag = (date.fromisoformat(t["date"]) - epoch_d).days
    uk = (t["country"], unit_id.get((t["country"], uname(t)), ""), uname(t))
    kosten = float(t["price"]) if t.get("price") is not None else 0.0
    rows.append([tag, sped_idx[t.get("carrier") or "—"], unit_idx[uk], 2, 1, round(kosten, 2)])

demo["fahrten"] = {
    "epoch": epoch,
    "speditionen": speditionen,
    "einheiten": [list(k) for k in unit_keys],
    "warentypen": ["Getrocknet", "Frisch", "Gemischt"],
    "rows": rows,
}

# Logistik (Einheit × Spedition)
lm = {}
for t in trips:
    key = (t["country"], unit_id.get((t["country"], uname(t)), ""), uname(t), t.get("carrier") or "—")
    e = lm.setdefault(key, {"f": 0, "k": 0.0})
    e["f"] += 1
    e["k"] += float(t["price"]) if t.get("price") is not None else 0.0

logistik = [{
    "EinheitLand": k[0], "EinheitID": k[1], "EinheitName": k[2], "Spedition": k[3],
    "Preis_EUR": round(v["k"] / v["f"]) if v["f"] else 0,
    "Fahrten_YTD": v["f"], "Transportkosten_EUR": round(v["k"], 2),
} for k, v in lm.items()]
logistik.sort(key=lambda x: -x["Fahrten_YTD"])
demo["logistik"] = logistik

# Demo-Reste leeren
demo["kunden"] = []
demo["umsaetze"] = []
demo["produkte"] = []
demo["meta"] = {
    **demo.get("meta", {}),
    "jahr": epoch_d.year,
    "aktuellerMonat": date.fromisoformat(dates[-1]).month,
    "quelle": "Frachtenauswertung (real)",
    "generiert": dates[-1],
}

demo_path.write_text(json.dumps(demo, ensure_ascii=False, indent=0), encoding="utf-8")
print("OK  data/crm_demo.json")
print(f"  Fahrten: {len(rows)} | Speditionen: {len(speditionen)} | Einheiten: {len(unit_keys)}")
print(f"  Logistik-Einträge: {len(logistik)}")
print(f"  Frachtkosten gesamt: {sum(r[5] for r in rows):,.2f} EUR")
print(f"  Zeitraum: {dates[0]} … {dates[-1]}")
