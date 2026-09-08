import type { BankTransaktion } from "@/types";
import { uid } from "@/lib/utils";
import { db } from "./db";

/**
 * Banking-Schnittstelle zur Prüfung von Mieteingängen.
 *
 * Wie bei der Repository-Schicht ist der Zugriff hinter einem Interface
 * gekapselt. Diese Implementierung (`LocalBankService`) hält die Kontobewegungen
 * lokal in IndexedDB und erlaubt manuelle Erfassung sowie CSV-Import.
 *
 * Für eine echte Anbindung genügt es, das Interface erneut zu implementieren –
 * z. B. `FinTsBankService` (HBCI/FinTS) oder `RestBankService` (Banking-API mit
 * OAuth) – und die exportierte Instanz `bankService` unten auszutauschen. Die UI
 * bleibt unverändert.
 */
export interface BankService {
  ready(): Promise<void>;
  getTransaktionen(): Promise<BankTransaktion[]>;
  addTransaktion(
    t: Omit<BankTransaktion, "id" | "createdAt">
  ): Promise<BankTransaktion>;
  deleteTransaktion(id: string): Promise<void>;
  /** Importiert Umsätze im CSV-Format. Gibt die Anzahl importierter Zeilen zurück. */
  importCsv(text: string): Promise<number>;
  /** Beispiel-/Demodaten laden (für den Prototyp). */
  ladeDemodaten(): Promise<number>;
  clearAll(): Promise<void>;
}

/** Deutsche Zahl "1.234,56" oder "1234.56" → number. */
function parseBetrag(s: string): number | null {
  const t = s.trim().replace(/\s/g, "").replace(/€/g, "");
  if (!t) return null;
  // Wenn Komma vorhanden, als Dezimaltrenner behandeln.
  const norm = t.includes(",")
    ? t.replace(/\./g, "").replace(",", ".")
    : t;
  const n = Number(norm);
  return Number.isNaN(n) ? null : n;
}

/** Sehr einfacher CSV-Parser (Trenner ; oder ,), respektiert Anführungszeichen. */
function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQuotes = !inQuotes;
    } else if (ch === delim && !inQuotes) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

class LocalBankService implements BankService {
  async ready(): Promise<void> {
    // Kontobewegungen werden nicht automatisch geseedet – der Nutzer lädt bei
    // Bedarf Demodaten oder importiert eine CSV.
  }

  async getTransaktionen(): Promise<BankTransaktion[]> {
    const alle = await db.transaktionen.toArray();
    return alle.sort((a, b) => (a.datum < b.datum ? 1 : -1));
  }

  async addTransaktion(
    t: Omit<BankTransaktion, "id" | "createdAt">
  ): Promise<BankTransaktion> {
    const neu: BankTransaktion = { ...t, id: uid(), createdAt: Date.now() };
    await db.transaktionen.put(neu);
    return neu;
  }

  async deleteTransaktion(id: string): Promise<void> {
    await db.transaktionen.delete(id);
  }

  async importCsv(text: string): Promise<number> {
    const zeilen = text
      .split(/\r?\n/)
      .map((z) => z.trim())
      .filter(Boolean);
    if (zeilen.length === 0) return 0;

    const delim = (zeilen[0].match(/;/g) || []).length >=
      (zeilen[0].match(/,/g) || []).length
      ? ";"
      : ",";

    const header = splitCsvLine(zeilen[0], delim).map((h) => h.toLowerCase());
    const idx = (namen: string[]) =>
      header.findIndex((h) => namen.some((n) => h.includes(n)));
    const iDatum = idx(["datum", "date", "buchung"]);
    const iBetrag = idx(["betrag", "amount", "umsatz"]);
    const iZweck = idx(["verwendung", "zweck", "purpose", "text"]);
    const iName = idx(["gegen", "auftraggeber", "name", "empfänger", "beguenstigter"]);
    const iIban = idx(["iban", "konto"]);

    // Wenn kein Header erkannt: Standardreihenfolge annehmen.
    const hatHeader = iDatum >= 0 && iBetrag >= 0;
    const datenZeilen = hatHeader ? zeilen.slice(1) : zeilen;

    const neu: BankTransaktion[] = [];
    for (const z of datenZeilen) {
      const f = splitCsvLine(z, delim);
      const datumRaw = hatHeader ? f[iDatum] : f[0];
      const betragRaw = hatHeader ? f[iBetrag] : f[1];
      const betrag = parseBetrag(betragRaw || "");
      if (betrag == null) continue;
      neu.push({
        id: uid(),
        datum: normDatum(datumRaw || ""),
        betrag,
        verwendungszweck: (hatHeader ? f[iZweck] : f[2]) || "",
        gegenpartei: (hatHeader ? f[iName] : f[3]) || "",
        iban: (hatHeader ? f[iIban] : f[4]) || "",
        quelle: "import",
        createdAt: Date.now(),
      });
    }
    if (neu.length) await db.transaktionen.bulkAdd(neu);
    return neu.length;
  }

  async ladeDemodaten(): Promise<number> {
    const wohnungen = await db.wohnungen.toArray();
    const jahr = new Date().getFullYear();
    const heutigerMonat = new Date().getMonth();
    const neu: BankTransaktion[] = [];

    // Für jede Wohnung mit Mieter monatliche Warmmiete-Eingänge erzeugen –
    // ein zurückliegender Monat wird ausgelassen (zeigt "offen").
    wohnungen.forEach((w, wi) => {
      const warm = (w.miete.kaltmiete ?? 0) + (w.miete.betriebskosten ?? 0);
      if (!w.mieter.name || warm <= 0) return;
      const auslassen = wi % 12; // je Wohnung ein anderer fehlender Monat
      for (let m = 0; m <= heutigerMonat; m++) {
        if (m === auslassen) continue;
        neu.push({
          id: uid(),
          datum: `${jahr}-${String(m + 1).padStart(2, "0")}-03`,
          betrag: warm,
          verwendungszweck: `Miete ${MONATE[m]} ${jahr}`,
          gegenpartei: w.mieter.name,
          iban: w.mieter.iban || "",
          quelle: "demo",
          createdAt: Date.now(),
        });
      }
    });
    if (neu.length) await db.transaktionen.bulkAdd(neu);
    return neu.length;
  }

  async clearAll(): Promise<void> {
    await db.transaktionen.clear();
  }
}

const MONATE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

/** Datum in verschiedenen Formaten → ISO yyyy-mm-dd. */
function normDatum(s: string): string {
  const t = s.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (m) {
    const [, d, mo, y] = m;
    const yyyy = y.length === 2 ? "20" + y : y;
    return `${yyyy}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return t;
}

// Zentrale Instanz. Für eine echte Bankanbindung hier austauschen.
export const bankService: BankService = new LocalBankService();
