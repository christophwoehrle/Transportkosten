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

## Schnelltest ohne Build: `tester.html`

Wer die App **ohne Node/Build** ausprobieren möchte, öffnet einfach
[`tester.html`](./tester.html) im Browser (Doppelklick genügt). Diese Datei ist
ein eigenständiger Single-File-Port der App: React, Dexie und Tailwind werden per
CDN geladen und der Code per Babel direkt im Browser transpiliert – kein
`npm install` nötig.

- Deckt alle Funktionen ab: Dashboard-Zeitstrahl, Wohnungen-CRUD mit Suche, die
  6 Reiter, Upload/Kamera-Scan, Warmmiete- und NK-Berechnung, Druck-/PDF-Ansicht.
- Daten liegen – wie in der echten App – lokal in IndexedDB (`wohnungsverwaltung`).
- **Hinweis:** Für den ersten Aufruf ist eine Internetverbindung nötig (CDN-Libs);
  danach cacht der Browser sie. Der Tester dient zum schnellen Ausprobieren – die
  produktive App ist die Vite-Variante oben (`npm run dev`).

## Funktionen

- **Dashboard mit Zeitstrahl** der 10-Jahres-Frist (Spekulationsfrist § 23 EStG):
  Fortschrittsbalken, Rest­laufzeit, Farbstatus (rot/gelb/grün), sortiert nach
  nächstem Fristende.
- **Finanzstatus je Wohnung** auf dem Dashboard: zeigt, ob die **Mieteingänge
  aktuell** sind, sowie den Status der **Abgänge an Hausverwaltung und
  Grundsteuer** (aktuell/teilweise/offen) und den **Saldo (YTD)** mit Mini-Balken.
- **Wohnungen** anlegen, bearbeiten, löschen; Karten­ansicht mit Suchfeld.
- Pro Wohnung 10 Reiter:
  1. **Grunddaten** – Adresse, Fläche, Zimmer, Ausstattung, Heizung, Kaufpreis/-datum;
     **Google-Maps-Link** zur Immobilie (aus der Adresse).
  2. **Fotos** – Fotoalbum mit Grundfotos (Upload **oder** Kamera-Aufnahme),
     Vollbild-Vorschau, Löschen. Bilder als Blob in IndexedDB.
  3. **Finanzierung** – Bank, Zins/Tilgung/Laufzeit, Kreditvertragsnummer,
     Ansprechpartner. Der Button *„E-Mail an Ansprechpartner"* setzt die
     **Kreditvertragsnummer automatisch in den Betreff** (`Darlehen Nr. …`) und ist
     ohne Nummer deaktiviert.
  4. **Grundbuch & Notar** – Upload **und** Kamera-Scan (PDF/Bild), Vorschau,
     Download, Löschen.
  5. **Mieter** – Kontaktdaten mit E-Mail-/Telefon-Button, **IBAN/BIC mit
     Format-Validierung** (IBAN inkl. Modulo-97-Prüfsumme), Mietvertrag als Upload.
  6. **Miete & Nebenkosten** – Kaltmiete + Betriebskosten­vorauszahlung,
     **Warmmiete automatisch** berechnet, Monats-/Jahresübersicht.
  7. **Mieteingang** – **Banking-Schnittstelle** zur Prüfung der Mieteingänge:
     Kontobewegungen werden gegen die erwartete Warmmiete abgeglichen und je Monat
     als *bezahlt / offen / ausstehend* angezeigt. Buchungen per CSV, aus Datei,
     manuell oder als Demodaten. Gekapselt hinter `BankService` (siehe unten).
  8. **Rentabilität** – **Einnahmen/Ausgaben-Vergleich** je Wohnung aus den Konto­zu-
     und -abgängen: Kennzahlen (Einnahmen, Ausgaben, Saldo, Rendite), Vergleichs­balken,
     **monatlicher Cashflow als Diagramm**, Soll/Ist für Hausverwaltung und Grundsteuer.
     Buchungen (Einnahme/Ausgabe je Art) direkt erfassbar.
  9. **Hausverwaltung & NK-Abrechnung** – Abrechnungen hochladen/scannen; Kostenposten
     erfassen, per **Checkbox** als umlagefähig markieren; die App verrechnet die
     umlagefähigen Kosten mit der Vorauszahlung und zeigt **Nachzahlung/Guthaben**.
     Ausgabe als **druck-/PDF-fähige** Ansicht (Button „Als PDF / Drucken").
  10. **Protokoll** – Reparaturen/Wartungen/Schäden dokumentieren: Art, Datum,
     Kontakt (Name/E-Mail/Telefon), **Beleg-Upload oder -Scan**, Status
     *behoben ja/nein* sowie optionale **Mietminderung** (von/bis, geminderte Miete).

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
   ├─ lib/
   │  ├─ utils.ts            # + googleMapsUrl(), 10-Jahres-Frist
   │  ├─ mieteingang.ts      # Abgleich Kontobewegung ↔ erwartete Miete
   │  └─ rentabilitaet.ts    # Einnahmen/Ausgaben, Soll/Ist der Abgänge
   ├─ data/
   │  ├─ db.ts               # Dexie/IndexedDB-Schema (v2: transaktionen)
   │  ├─ repository.ts       # >> Repository-Schicht (einziger Datenzugriff)
   │  ├─ bankService.ts      # >> Banking-Schnittstelle (BankService)
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

### Banking-Schnittstelle (`BankService`)

Analog dazu kapselt `src/data/bankService.ts` den Zugriff auf Kontobewegungen.
Die mitgelieferte `LocalBankService`-Implementierung hält die Umsätze lokal und
erlaubt CSV-/Datei-/Manuell-Import sowie Demodaten. Für eine echte Anbindung
implementiert man dasselbe Interface erneut – z. B. `FinTsBankService`
(HBCI/FinTS) oder `RestBankService` (Banking-API mit OAuth) – und tauscht die
Instanz `bankService` aus. Der Abgleich Miete ↔ Umsatz (`src/lib/mieteingang.ts`)
und die UI bleiben unverändert.

**CSV-Format** (Trenner `;` oder `,`, deutsche oder englische Zahlen):
`Datum;Betrag;Verwendungszweck;Gegenpartei;IBAN`. Spalten werden per Kopfzeile
erkannt; ohne Kopfzeile gilt diese Reihenfolge.

## Technik

React + TypeScript + Vite · Tailwind CSS · React Router · Dexie.js (IndexedDB) ·
vite-plugin-pwa · lucide-react.

## Hinweis

Keine Steuerberatung. Die 10-Jahres-Frist und alle steuerlichen Aspekte bitte mit
einem Fachberater klären.
