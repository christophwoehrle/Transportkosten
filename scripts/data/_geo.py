#!/usr/bin/env python3
"""
Gemeinsame Geo-Hilfen für die Datenaufbereitung.

Enthält:
  - zone_to_country(zone, plz):  Frachtzone/PLZ -> Land (gleiche Logik wie in app.js)
  - plz_to_unit(land, plz):      PLZ -> Verwaltungseinheit (nutzt plzMapping aus app_data.json)
  - point_in_units(...):         deterministische Kundenkoordinate innerhalb der Einheit
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
APP_DATA = json.loads((ROOT / "data" / "app_data.json").read_text(encoding="utf-8"))
COUNTRIES = APP_DATA["countries"]
PLZ_MAPPING = APP_DATA.get("plzMapping", {})

UK_POSTCODE = re.compile(r"^[A-Z]{1,2}\d", re.I)


def zone_to_country(zone, plz):
    """Frachtzone (Spalte B) + PLZ -> Landesname. Gleiche Logik wie frachtZoneToCountry in app.js."""
    z = "" if zone is None else str(zone).strip()
    p = "" if plz is None else str(plz).strip()

    if z.startswith("D.") or z == "D":
        return "Deutschland"
    if z == "GB":
        return "UK"
    if z in ("NIRE", "IRE"):
        return "Irland"
    if z == "NL":
        return "Niederlande"
    if z == "B":
        return "Belgien"
    if z == "I":
        return "Italien"
    if z == "CH":
        return "Schweiz"
    if z == "SLO":
        return "Slowenien"
    if z.upper() == "SPANIEN":
        return "Spanien"
    if z.upper() == "PORTUGAL":
        return "Portugal"
    if re.fullmatch(r"\d{1,3}", z):
        return "Frankreich"

    pc = p.replace(" ", "")
    if UK_POSTCODE.match(pc):
        return "UK"
    if re.match(r"^\d{4}\s?[A-Z]{2}$", p, re.I):
        return "Niederlande"
    if re.match(r"^\d{5}$", p):
        return "Frankreich"
    if re.match(r"^\d{4}$", p):
        return "Belgien"
    return None


def plz_to_unit(land, plz):
    """PLZ -> Verwaltungseinheit-Name über plzMapping.

    Deckt die verschiedenen PLZ-Systeme ab:
      - UK: Outward Code (Teil vor dem Leerzeichen, z. B. 'CB22' aus 'CB22 4QH'),
            längster passender Präfix gewinnt.
      - NL: 4 Ziffern (z. B. '1017').
      - Slowenien: erste Ziffer.
      - Übrige (FR/DE/IT/ES/PT/BE/CH ...): 1-3 Ziffern Präfix.
    """
    if not land or land not in PLZ_MAPPING:
        return None
    mapping = PLZ_MAPPING[land]
    p = "" if plz is None else str(plz).strip()

    # Slowenien: erste Ziffer
    if land == "Slowenien":
        digits = re.sub(r"\D", "", p)
        if digits:
            return mapping.get(digits[:1]) or mapping.get("default")
        return mapping.get("default")

    # UK: Outward Code (alphanumerisch, vor dem Leerzeichen). Längster Präfix zuerst.
    if land == "UK":
        outward = p.split(" ")[0].upper() if " " in p else p.upper()
        for n in range(len(outward), 0, -1):
            if outward[:n] in mapping:
                return mapping[outward[:n]]
        return mapping.get("default")

    # Niederlande: 4 Ziffern
    if land == "Niederlande":
        digits = re.sub(r"\D", "", p)
        for n in (4, 3, 2):
            if digits[:n] in mapping:
                return mapping[digits[:n]]
        return mapping.get("default")

    # Übrige Länder: numerischer Präfix, längster zuerst
    digits = re.sub(r"\D", "", p)
    for n in (3, 2, 1):
        if digits[:n] in mapping:
            return mapping[digits[:n]]
    return mapping.get("default")


def parse_date(val):
    """Excel-Datum (Timestamp/String/Seriennummer) -> 'YYYY-MM-DD' oder None."""
    if val is None:
        return None
    import datetime
    if isinstance(val, (datetime.datetime, datetime.date)):
        return val.strftime("%Y-%m-%d")
    s = str(val).strip()
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", s) or re.match(r"(\d{2})\.(\d{2})\.(\d{4})", s)
    if m:
        g = m.groups()
        return f"{g[0]}-{g[1]}-{g[2]}" if len(g[0]) == 4 else f"{g[2]}-{g[1]}-{g[0]}"
    return None
