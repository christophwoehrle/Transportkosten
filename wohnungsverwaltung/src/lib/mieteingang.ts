import type { BankTransaktion, Wohnung } from "@/types";
import { normalizeIban } from "./iban";

// Abgleich von Kontobewegungen (Banking-Schnittstelle) gegen die erwartete
// Miete einer Wohnung. Rein funktional und ohne Seiteneffekte, damit leicht
// testbar.

export type MieteingangStatus = "bezahlt" | "offen" | "ausstehend";

export interface MonatsStatus {
  monat: number; // 0–11
  jahr: number;
  soll: number; // erwartete Warmmiete
  transaktion: BankTransaktion | null;
  status: MieteingangStatus;
}

/** Erwartete Miete: Kaltmiete und Warmmiete (Kalt + Betriebskosten). */
export function erwarteteMiete(w: Wohnung): { kalt: number; warm: number } {
  const kalt = w.miete.kaltmiete ?? 0;
  const warm = kalt + (w.miete.betriebskosten ?? 0);
  return { kalt, warm };
}

/** Passt eine Transaktion zur Miete einer Wohnung? (Betrag + IBAN/Name). */
export function passtZurMiete(w: Wohnung, t: BankTransaktion): boolean {
  if (t.betrag <= 0) return false;
  const { kalt, warm } = erwarteteMiete(w);
  const betragOk =
    (warm > 0 && Math.abs(t.betrag - warm) <= 1) ||
    (kalt > 0 && Math.abs(t.betrag - kalt) <= 1);
  if (!betragOk) return false;

  const ibanOk =
    !!w.mieter.iban &&
    !!t.iban &&
    normalizeIban(w.mieter.iban) === normalizeIban(t.iban);

  const nachname = (w.mieter.name || "").trim().split(/\s+/).pop() || "";
  const nameOk =
    nachname.length > 1 &&
    (t.gegenpartei || "").toLowerCase().includes(nachname.toLowerCase());

  return ibanOk || nameOk;
}

/**
 * Liefert für ein Jahr je Monat den Soll-Betrag, die passende Transaktion und
 * den Status (bezahlt / offen / ausstehend).
 */
export function mieteingangJahr(
  w: Wohnung,
  transaktionen: BankTransaktion[],
  jahr: number,
  jetzt = new Date()
): MonatsStatus[] {
  const { warm } = erwarteteMiete(w);
  const passende = transaktionen.filter((t) => passtZurMiete(w, t));

  const ergebnis: MonatsStatus[] = [];
  for (let m = 0; m < 12; m++) {
    const tx =
      passende.find((t) => {
        const d = new Date(t.datum);
        return d.getFullYear() === jahr && d.getMonth() === m;
      }) ?? null;

    const monatsStart = new Date(jahr, m, 1);
    let status: MieteingangStatus;
    if (tx) status = "bezahlt";
    else if (monatsStart > jetzt) status = "ausstehend";
    else status = "offen";

    ergebnis.push({ monat: m, jahr, soll: warm, transaktion: tx, status });
  }
  return ergebnis;
}

export const MONATE_KURZ = [
  "Jan", "Feb", "Mär", "Apr", "Mai", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dez",
];

export interface MieteStatusKompakt {
  aktuell: boolean; // keine vergangenen Monate offen
  bezahlt: number;
  offen: number; // vergangene/aktuelle Monate ohne Eingang
  hatMiete: boolean;
}

/** Kompakter Mieteingangs-Status (für Dashboard-Übersicht). */
export function mieteStatusKompakt(
  w: Wohnung,
  transaktionen: BankTransaktion[],
  jahr: number,
  jetzt = new Date()
): MieteStatusKompakt {
  const warm = erwarteteMiete(w).warm;
  const monate = mieteingangJahr(w, transaktionen, jahr, jetzt);
  const bezahlt = monate.filter((m) => m.status === "bezahlt").length;
  const offen = monate.filter((m) => m.status === "offen").length;
  return { aktuell: offen === 0, bezahlt, offen, hatMiete: warm > 0 };
}
