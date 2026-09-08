import Dexie, { type Table } from "dexie";
import type { BankTransaktion, Dokument, Wohnung } from "@/types";

// Dexie-Datenbank. Nur diese Datei kennt die konkrete IndexedDB-Struktur;
// die App greift ausschließlich über die Repository-/Service-Schicht darauf zu.
export class WohnungsDB extends Dexie {
  wohnungen!: Table<Wohnung, string>;
  dokumente!: Table<Dokument, string>;
  transaktionen!: Table<BankTransaktion, string>;

  constructor() {
    super("wohnungsverwaltung");
    this.version(1).stores({
      wohnungen: "id, bezeichnung, ort, kaufdatum, updatedAt",
      dokumente: "id, wohnungId, kategorie, datum, createdAt",
    });
    // v2: Belege können Protokolleinträgen zugeordnet werden; neue Tabelle für
    // Kontobewegungen der Banking-Schnittstelle.
    this.version(2).stores({
      wohnungen: "id, bezeichnung, ort, kaufdatum, updatedAt",
      dokumente: "id, wohnungId, kategorie, protokollId, datum, createdAt",
      transaktionen: "id, datum, betrag, iban, createdAt",
    });
  }
}

export const db = new WohnungsDB();
