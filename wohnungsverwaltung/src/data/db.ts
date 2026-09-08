import Dexie, { type Table } from "dexie";
import type { Dokument, Wohnung } from "@/types";

// Dexie-Datenbank. Nur diese Datei kennt die konkrete IndexedDB-Struktur;
// die App greift ausschließlich über die Repository-Schicht darauf zu.
export class WohnungsDB extends Dexie {
  wohnungen!: Table<Wohnung, string>;
  dokumente!: Table<Dokument, string>;

  constructor() {
    super("wohnungsverwaltung");
    this.version(1).stores({
      // Indizierte Felder; Blobs liegen als Wert im dokumente-Datensatz.
      wohnungen: "id, bezeichnung, ort, kaufdatum, updatedAt",
      dokumente: "id, wohnungId, kategorie, datum, createdAt",
    });
  }
}

export const db = new WohnungsDB();
