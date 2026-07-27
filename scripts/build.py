#!/usr/bin/env python3
"""
Transportpreis-Atlas — Build-Skript
Setzt aus den Quelldateien in src/ + den Daten in data/ die fertigen
Offline-HTML-Dateien (Desktop + Mobil) in dist/ zusammen.

Aufruf:
    python scripts/build.py            # baut beide Versionen
    python scripts/build.py desktop    # nur Desktop
    python scripts/build.py mobile     # nur Mobil

Die HTML-Dateien sind vollständig eigenständig (alle Skripte, Styles und
Daten eingebettet) und funktionieren offline ohne Server.
"""
import sys
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
DATA = ROOT / "data"
LIB = ROOT / "lib"
DIST = ROOT / "dist"

# Platzhalter im Template  ->  Quelldatei
CODE_BLOCKS = {
    "__XLSX_LIB__":           LIB / "xlsx.core.min.js",
    "__APP_JS__":             SRC / "app.js",
    "__CUSTOMERS_JS__":       SRC / "customers.js",
    "__CRM_JS__":             SRC / "crm.js",
    "__CRM_UI_JS__":          SRC / "crm_ui.js",
    "__CRM_CONNECTORS_JS__":  SRC / "crm_connectors.js",
    "__UPLOAD_TIMER_JS__":    SRC / "upload_timer.js",
    "__MAP_RESIZE_JS__":      SRC / "map_resize.js",
}
DATA_BLOCKS = {
    "__APP_DATA__":    DATA / "app_data.json",
    "__CRM_DEMO__":    DATA / "crm_demo.json",
    "__FRACHT_DATA__": DATA / "fracht_data.json",
    "__UMSATZ_DATA__": DATA / "umsatz_data.json",
}


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def safe_for_script(text: str) -> str:
    # Verhindert, dass ein </script> im eingebetteten Inhalt das Tag vorzeitig schliesst.
    return text.replace("</script>", "<\\/script>")


def build(variant: str) -> Path:
    tpl_name = "template.html" if variant == "desktop" else "template.mobile.html"
    tpl = read(SRC / tpl_name)

    # Datenbloecke minifiziert (kein indent) einbetten
    for ph, path in DATA_BLOCKS.items():
        if ph not in tpl:
            continue
        content = safe_for_script(read(path))
        tpl = tpl.replace(ph, content)

    # Code-/Lib-Bloecke einbetten
    for ph, path in CODE_BLOCKS.items():
        if ph not in tpl:
            continue
        content = safe_for_script(read(path))
        tpl = tpl.replace(ph, content)

    # Restliche, nicht ersetzte Platzhalter melden.
    # '__EUROPE__' ist KEIN Build-Platzhalter, sondern die Konstante EUROPE_KEY
    # im App-Code (Kennung fuer die Gesamteuropa-Ansicht) -> ignorieren.
    known_placeholders = set(CODE_BLOCKS) | set(DATA_BLOCKS)
    leftover = [p for p in re.findall(r"__[A-Z_]+__", tpl)
                if p in known_placeholders]
    if leftover:
        print(f"  WARN: nicht ersetzte Platzhalter: {sorted(set(leftover))}")

    DIST.mkdir(exist_ok=True)
    out_name = ("Transportpreis-Atlas_Desktop.html" if variant == "desktop"
                else "Transportpreis-Atlas_Mobil.html")
    out = DIST / out_name
    out.write_text(tpl, encoding="utf-8")
    size = out.stat().st_size / 1024 / 1024
    print(f"  OK  {out.relative_to(ROOT)}  ({size:.2f} MB)")
    return out


def main():
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    variants = ["desktop", "mobile"] if which == "all" else [which]
    print("Transportpreis-Atlas — Build")
    for v in variants:
        build(v)
    print("Fertig.")


if __name__ == "__main__":
    main()
