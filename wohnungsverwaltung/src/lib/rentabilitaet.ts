import type { BankTransaktion, Wohnung } from "@/types";
import { passtZurMiete } from "./mieteingang";

// Auswertung der Kontobewegungen je Wohnung: Einnahmen/Ausgaben-Vergleich und
// Rentabilität. Rein funktional, damit leicht testbar.

/** Gehört eine Transaktion zu dieser Wohnung? */
export function gehoertZuWohnung(w: Wohnung, t: BankTransaktion): boolean {
  if (t.wohnungId) return t.wohnungId === w.id;
  // Ohne feste Zuordnung: nur Mieteingänge werden automatisch erkannt.
  return passtZurMiete(w, t);
}

export interface MonatsCashflow {
  einnahmen: number;
  ausgaben: number;
}

export interface Rentabilitaet {
  jahr: number;
  einnahmen: number;
  miete: number;
  sonstigeEinnahme: number;
  ausgaben: number;
  ausgabenNachArt: {
    hausverwaltung: number;
    grundsteuer: number;
    sonstige_ausgabe: number;
  };
  saldo: number;
  /** Rendite = Saldo / Einnahmen (null, wenn keine Einnahmen). */
  rendite: number | null;
  perMonat: MonatsCashflow[]; // 12 Einträge
  anzahl: number;
}

export function rentabilitaet(
  w: Wohnung,
  transaktionen: BankTransaktion[],
  jahr: number
): Rentabilitaet {
  const zug = transaktionen.filter(
    (t) => gehoertZuWohnung(w, t) && new Date(t.datum).getFullYear() === jahr
  );

  let einnahmen = 0;
  let miete = 0;
  let sonstigeEinnahme = 0;
  const aus = { hausverwaltung: 0, grundsteuer: 0, sonstige_ausgabe: 0 };
  const perMonat: MonatsCashflow[] = Array.from({ length: 12 }, () => ({
    einnahmen: 0,
    ausgaben: 0,
  }));

  for (const t of zug) {
    const m = new Date(t.datum).getMonth();
    if (t.betrag >= 0) {
      einnahmen += t.betrag;
      perMonat[m].einnahmen += t.betrag;
      if (t.art === "sonstige_einnahme") sonstigeEinnahme += t.betrag;
      else miete += t.betrag;
    } else {
      const a = Math.abs(t.betrag);
      perMonat[m].ausgaben += a;
      if (t.art === "hausverwaltung") aus.hausverwaltung += a;
      else if (t.art === "grundsteuer") aus.grundsteuer += a;
      else aus.sonstige_ausgabe += a;
    }
  }

  const ausgaben =
    aus.hausverwaltung + aus.grundsteuer + aus.sonstige_ausgabe;
  const saldo = einnahmen - ausgaben;
  return {
    jahr,
    einnahmen,
    miete,
    sonstigeEinnahme,
    ausgaben,
    ausgabenNachArt: aus,
    saldo,
    rendite: einnahmen > 0 ? saldo / einnahmen : null,
    perMonat,
    anzahl: zug.length,
  };
}

/** Erwartete Jahreskosten aus den NK-Posten (Verwaltergebühr, Grundsteuer). */
export function erwarteteKosten(w: Wohnung): {
  hausverwaltungJahr: number | null;
  grundsteuerJahr: number | null;
} {
  const p = w.nebenkosten.posten;
  const find = (kw: string) =>
    p.find((x) => (x.bezeichnung || "").toLowerCase().includes(kw));
  const hv = find("verwalt");
  const gs = find("grundsteuer");
  return {
    hausverwaltungJahr: hv?.betrag ?? null,
    grundsteuerJahr: gs?.betrag ?? null,
  };
}

export type AbgangStatus = "aktuell" | "teilweise" | "offen" | "unbekannt";

/**
 * Vergleicht die bisher geleisteten Abgänge einer Art mit dem anteilig bis heute
 * erwarteten Betrag.
 */
export function abgangStatus(
  ist: number,
  erwartetProJahr: number | null,
  jahr: number,
  jetzt = new Date()
): { status: AbgangStatus; soll: number } {
  if (erwartetProJahr == null || erwartetProJahr <= 0) {
    return { status: "unbekannt", soll: 0 };
  }
  const anteil =
    jetzt.getFullYear() > jahr
      ? 1
      : jetzt.getFullYear() < jahr
      ? 0
      : (jetzt.getMonth() + 1) / 12;
  const soll = erwartetProJahr * anteil;
  let status: AbgangStatus;
  if (soll <= 0) status = "aktuell";
  else if (ist >= soll - 1) status = "aktuell";
  else if (ist > 0) status = "teilweise";
  else status = "offen";
  return { status, soll };
}
