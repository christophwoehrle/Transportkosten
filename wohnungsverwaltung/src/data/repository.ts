import type { Dokument, DokumentKategorie, Wohnung } from "@/types";
import { uid } from "@/lib/utils";
import { db } from "./db";
import { seedWohnungen, seedDokumente } from "./seed";

/**
 * Repository-Schnittstelle: EINZIGER Zugriffspunkt der App auf Daten.
 *
 * Die UI-Komponenten dürfen Dexie/IndexedDB niemals direkt aufrufen. Wer später
 * einen Cloud-Sync (z. B. Supabase/REST) ergänzen möchte, implementiert einfach
 * dieses Interface erneut und tauscht die Instanz in `repository` unten aus –
 * ohne eine einzige UI-Komponente anzufassen.
 */
export interface Repository {
  ready(): Promise<void>;

  // Wohnungen
  getWohnungen(): Promise<Wohnung[]>;
  getWohnung(id: string): Promise<Wohnung | undefined>;
  saveWohnung(wohnung: Wohnung): Promise<Wohnung>;
  deleteWohnung(id: string): Promise<void>;

  // Dokumente (Blobs)
  getDokumente(
    wohnungId: string,
    kategorie?: DokumentKategorie
  ): Promise<Dokument[]>;
  saveDokument(dok: Dokument): Promise<Dokument>;
  deleteDokument(id: string): Promise<void>;
}

/** Baut eine leere, aber vollständig strukturierte Wohnung. */
export function createLeereWohnung(): Wohnung {
  const now = Date.now();
  return {
    id: uid(),
    bezeichnung: "",
    strasse: "",
    plz: "",
    ort: "",
    wohnflaeche: null,
    zimmer: null,
    baujahr: null,
    geschoss: "",
    ausstattungText: "",
    ausstattungFeatures: [],
    balkonTerrasse: { vorhanden: false, anzahl: null },
    heizungsart: "Gas",
    kaufpreis: null,
    kaufdatum: "",
    finanzierung: {
      bank: "",
      darlehenssumme: null,
      restschuld: null,
      zins: null,
      tilgung: null,
      laufzeitJahre: null,
      kreditvertragsnummer: "",
      ansprechpartner: { name: "", email: "", telefon: "" },
    },
    mieter: {
      name: "",
      strasse: "",
      plz: "",
      ort: "",
      telefon: "",
      email: "",
      iban: "",
      bic: "",
      einzugsdatum: "",
      auszugsdatum: "",
    },
    miete: { kaltmiete: null, betriebskosten: null },
    nebenkosten: { zeitraumVon: "", zeitraumBis: "", posten: [] },
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Dexie-/IndexedDB-Implementierung des Repositorys.
 */
class DexieRepository implements Repository {
  private initialized: Promise<void> | null = null;

  ready(): Promise<void> {
    if (!this.initialized) {
      this.initialized = this.seedIfEmpty();
    }
    return this.initialized;
  }

  private async seedIfEmpty(): Promise<void> {
    const count = await db.wohnungen.count();
    if (count > 0) return;
    await db.transaction("rw", db.wohnungen, db.dokumente, async () => {
      await db.wohnungen.bulkAdd(seedWohnungen());
      const dokumente = await seedDokumente();
      if (dokumente.length) await db.dokumente.bulkAdd(dokumente);
    });
  }

  async getWohnungen(): Promise<Wohnung[]> {
    await this.ready();
    const alle = await db.wohnungen.toArray();
    return alle.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getWohnung(id: string): Promise<Wohnung | undefined> {
    await this.ready();
    return db.wohnungen.get(id);
  }

  async saveWohnung(wohnung: Wohnung): Promise<Wohnung> {
    const toSave: Wohnung = { ...wohnung, updatedAt: Date.now() };
    await db.wohnungen.put(toSave);
    return toSave;
  }

  async deleteWohnung(id: string): Promise<void> {
    await db.transaction("rw", db.wohnungen, db.dokumente, async () => {
      await db.dokumente.where("wohnungId").equals(id).delete();
      await db.wohnungen.delete(id);
    });
  }

  async getDokumente(
    wohnungId: string,
    kategorie?: DokumentKategorie
  ): Promise<Dokument[]> {
    await this.ready();
    let coll = db.dokumente.where("wohnungId").equals(wohnungId);
    let list = await coll.toArray();
    if (kategorie) list = list.filter((d) => d.kategorie === kategorie);
    return list.sort((a, b) => b.createdAt - a.createdAt);
  }

  async saveDokument(dok: Dokument): Promise<Dokument> {
    await db.dokumente.put(dok);
    return dok;
  }

  async deleteDokument(id: string): Promise<void> {
    await db.dokumente.delete(id);
  }
}

// Zentrale Instanz. Für einen späteren Cloud-Sync hier gegen eine andere
// Repository-Implementierung tauschen – der Rest der App bleibt unverändert.
export const repository: Repository = new DexieRepository();
