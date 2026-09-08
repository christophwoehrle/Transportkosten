# Wohnungsverwaltung (PWA)

Eine vollständig lauffähige, offline-fähige **Progressive Web App** zur Verwaltung
einzelner Mietwohnungen: Grunddaten, Finanzierung, Grundbuch-/Notardokumente,
Mieter, Miete & Nebenkosten sowie Nebenkostenabrechnung.

Alle Daten – inklusive gescannter/hochgeladener Dokumente – werden **lokal im
Browser** (IndexedDB) gespeichert. Es werden keine Daten an einen Server gesendet.

## Schnellstart

```bash
npm install
npm run dev
```

Danach die angezeigte URL (Standard: <http://localhost:5173>) öffnen. Beim ersten
Start werden **3 Musterwohnungen** angelegt, damit sofort etwas zu sehen ist.

Weitere Skripte:

```bash
npm run build      # Produktions-Build (dist/), inkl. PWA-Assets
npm run preview    # gebaute App lokal ausliefern
npm run typecheck  # TypeScript prüfen ohne Build
```

## Funktionen

- **Dashboard mit Zeitstrahl** der 10-Jahres-Frist (Spekulationsfrist § 23 EStG):
  Fortschrittsbalken, Rest­laufzeit, Farbstatus (rot/gelb/grün), sortiert nach
  nächstem Fristende.
- **Wohnungen** anlegen, bearbeiten, löschen; Karten­ansicht mit Suchfeld.
- Pro Wohnung 6 Reiter:
  1. **Grunddaten** – Adresse, Fläche, Zimmer, Ausstattung, Heizung, Kaufpreis/-datum.
  2. **Finanzierung** – Bank, Zins/Tilgung/Laufzeit, Kreditvertragsnummer,
     Ansprechpartner. Der Button *„E-Mail an Ansprechpartner"* setzt die
     **Kreditvertragsnummer automatisch in den Betreff** (`Darlehen Nr. …`) und ist
     ohne Nummer deaktiviert.
  3. **Grundbuch & Notar** – Upload **und** Kamera-Scan (PDF/Bild), Vorschau,
     Download, Löschen.
  4. **Mieter** – Kontaktdaten mit E-Mail-/Telefon-Button, **IBAN/BIC mit
     Format-Validierung** (IBAN inkl. Modulo-97-Prüfsumme), Mietvertrag als Upload.
  5. **Miete & Nebenkosten** – Kaltmiete + Betriebskosten­vorauszahlung,
     **Warmmiete automatisch** berechnet, Monats-/Jahresübersicht.
  6. **Hausverwaltung & NK-Abrechnung** – Abrechnungen hochladen/scannen; Kostenposten
     erfassen, per **Checkbox** als umlagefähig markieren; die App verrechnet die
     umlagefähigen Kosten mit der Vorauszahlung und zeigt **Nachzahlung/Guthaben**.
     Ausgabe als **druck-/PDF-fähige** Ansicht (Button „Als PDF / Drucken").

## Projektstruktur

```
wohnungsverwaltung/
├─ index.html                # Einstiegspunkt
├─ vite.config.ts            # Vite + PWA-Konfiguration
├─ tailwind.config.js
├─ public/
│  ├─ icon.svg               # PWA-/App-Icon
│  └─ favicon.svg
└─ src/
   ├─ main.tsx               # React-Bootstrap + Router
   ├─ App.tsx                # Routen (Dashboard, Wohnungen, Detail)
   ├─ types.ts               # Datenmodell (Wohnung, Dokument, …)
   ├─ index.css              # Tailwind + Druck-Styles
   ├─ lib/
   │  ├─ utils.ts            # Formatierung, 10-Jahres-Frist, IDs
   │  └─ iban.ts             # IBAN-/BIC-Validierung
   ├─ data/
   │  ├─ db.ts               # Dexie/IndexedDB-Schema
   │  ├─ repository.ts       # >> Repository-Schicht (einziger Datenzugriff)
   │  └─ seed.ts             # Musterdaten
   ├─ components/
   │  ├─ ui/                 # shadcn-artige UI-Bausteine (Button, Card, Tabs, …)
   │  ├─ Layout.tsx          # Sidebar (Desktop) + Bottom-Nav (Mobil)
   │  ├─ Field.tsx           # Formular-Helfer
   │  ├─ NumberInput.tsx     # Zahleneingabe im deutschen Format
   │  └─ DocumentSection.tsx # Upload + Kamera-Scan + Vorschau/Download
   └─ pages/
      ├─ Dashboard.tsx
      ├─ WohnungenList.tsx
      ├─ WohnungDetail.tsx   # hält die Wohnung, Autosave, rendert die Reiter
      └─ tabs/               # die 6 Reiter
```

## Architektur: Repository-Schicht (für späteren Cloud-Sync)

**Jeder** Datenzugriff läuft über `src/data/repository.ts`. Die UI-Komponenten
rufen ausschließlich Methoden wie `getWohnungen()`, `saveWohnung()`,
`saveDokument()` auf und kennen Dexie/IndexedDB **nicht**.

So lässt sich später ein Cloud-Backend (z. B. Supabase oder eine REST-API)
ergänzen, ohne die Oberfläche anzufassen:

1. Eine neue Klasse anlegen, die das `Repository`-Interface implementiert
   (z. B. `SupabaseRepository`) und dort HTTP-/SDK-Aufrufe statt Dexie verwenden.
2. In `repository.ts` die exportierte Instanz austauschen:
   ```ts
   export const repository: Repository = new SupabaseRepository();
   ```
3. Dokument-Blobs würden dann z. B. in einen Storage-Bucket geladen; die
   Interface-Signaturen bleiben gleich.

Optional lässt sich ein Sync-Layer bauen, der lokal (Dexie, offline) speichert und
im Hintergrund mit der Cloud abgleicht – auch das berührt die UI nicht.

## Technik

React + TypeScript + Vite · Tailwind CSS · React Router · Dexie.js (IndexedDB) ·
vite-plugin-pwa · lucide-react.

## Hinweis

Keine Steuerberatung. Die 10-Jahres-Frist und alle steuerlichen Aspekte bitte mit
einem Fachberater klären.
