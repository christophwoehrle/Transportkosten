// Zentrale Datentypen der Anwendung.
// Die Wohnung ist die zentrale Entität; Dokumente werden getrennt als Blobs
// gespeichert und über die wohnungId referenziert.

export type Heizungsart =
  | "Gas"
  | "Öl"
  | "Fernwärme"
  | "Wärmepumpe"
  | "Nachtspeicher"
  | "Pellets"
  | "Sonstige";

export type DokumentKategorie =
  | "notarvertrag"
  | "grundbuch"
  | "mietvertrag"
  | "hausverwaltung"
  | "foto"
  | "beleg"
  | "sonstiges";

export type ProtokollTyp =
  | "reparatur"
  | "wartung"
  | "besichtigung"
  | "schaden"
  | "sonstiges";

export interface Ansprechpartner {
  name: string;
  email: string;
  telefon: string;
}

export interface Finanzierung {
  bank: string;
  darlehenssumme: number | null;
  restschuld: number | null;
  zins: number | null; // in %
  tilgung: number | null; // in %
  laufzeitJahre: number | null;
  kreditvertragsnummer: string;
  ansprechpartner: Ansprechpartner;
}

export interface Mieter {
  name: string;
  strasse: string;
  plz: string;
  ort: string;
  telefon: string;
  email: string;
  iban: string;
  bic: string;
  einzugsdatum: string; // ISO yyyy-mm-dd
  auszugsdatum: string; // ISO yyyy-mm-dd, "" falls aktiv
}

export interface Miete {
  kaltmiete: number | null;
  betriebskosten: number | null; // Betriebskostenvorauszahlung / Monat
}

export interface NkPosten {
  id: string;
  bezeichnung: string;
  betrag: number | null;
  umlagefaehig: boolean;
}

export interface Nebenkosten {
  zeitraumVon: string; // ISO yyyy-mm-dd
  zeitraumBis: string; // ISO yyyy-mm-dd
  posten: NkPosten[];
}

export interface BalkonTerrasse {
  vorhanden: boolean;
  anzahl: number | null;
}

export interface Mietminderung {
  aktiv: boolean;
  von: string; // ISO yyyy-mm-dd
  bis: string; // ISO yyyy-mm-dd
  betrag: number | null; // geminderte Miete (€ / Monat)
}

export interface ProtokollEintrag {
  id: string;
  typ: ProtokollTyp;
  datum: string; // ISO yyyy-mm-dd – wann
  beschreibung: string;
  // durch wen (Handwerker / Kontakt)
  kontaktName: string;
  kontaktEmail: string;
  kontaktTelefon: string;
  behoben: boolean; // Problem behoben ja/nein
  mietminderung: Mietminderung;
  createdAt: number;
}

export type TransaktionsArt =
  | "miete"
  | "sonstige_einnahme"
  | "hausverwaltung"
  | "grundsteuer"
  | "sonstige_ausgabe";

/** Kontobewegung aus der Banking-Schnittstelle (global, nicht pro Wohnung). */
export interface BankTransaktion {
  id: string;
  datum: string; // ISO yyyy-mm-dd
  betrag: number; // Eingang positiv, Ausgang negativ
  verwendungszweck: string;
  gegenpartei: string; // Name des Auftraggebers
  iban: string;
  art: TransaktionsArt;
  /** Optionale feste Zuordnung zu einer Wohnung (z. B. bei Ausgaben). */
  wohnungId?: string;
  quelle: "manuell" | "import" | "demo";
  createdAt: number;
}

export interface Wohnung {
  id: string;
  // 1. Grunddaten
  bezeichnung: string;
  strasse: string;
  plz: string;
  ort: string;
  wohnflaeche: number | null; // m²
  zimmer: number | null;
  baujahr: number | null;
  geschoss: string;
  ausstattungText: string;
  ausstattungFeatures: string[]; // Einbauküche, Keller, Aufzug, Stellplatz …
  balkonTerrasse: BalkonTerrasse;
  heizungsart: Heizungsart;
  kaufpreis: number | null;
  kaufdatum: string; // ISO yyyy-mm-dd – Basis für den Zeitstrahl

  // 2.–6. Bereiche
  finanzierung: Finanzierung;
  mieter: Mieter;
  miete: Miete;
  nebenkosten: Nebenkosten;
  protokoll: ProtokollEintrag[];

  createdAt: number;
  updatedAt: number;
}

export interface Dokument {
  id: string;
  wohnungId: string;
  kategorie: DokumentKategorie;
  /** Optionale Verknüpfung, z. B. Beleg zu einem Protokolleintrag. */
  protokollId?: string;
  titel: string;
  datum: string; // ISO yyyy-mm-dd
  mimeType: string;
  size: number;
  blob: Blob;
  createdAt: number;
}

export const AUSSTATTUNG_OPTIONEN = [
  "Einbauküche",
  "Keller",
  "Aufzug",
  "Stellplatz",
  "Garage",
  "Gäste-WC",
  "Fußbodenheizung",
  "Barrierefrei",
] as const;

export const HEIZUNGSARTEN: Heizungsart[] = [
  "Gas",
  "Öl",
  "Fernwärme",
  "Wärmepumpe",
  "Nachtspeicher",
  "Pellets",
  "Sonstige",
];

export const DOKUMENT_KATEGORIEN: Record<DokumentKategorie, string> = {
  notarvertrag: "Notarvertrag",
  grundbuch: "Grundbuchauszug",
  mietvertrag: "Mietvertrag",
  hausverwaltung: "Hausverwaltungs-Abrechnung",
  foto: "Foto",
  beleg: "Beleg",
  sonstiges: "Sonstiges",
};

export const PROTOKOLL_TYPEN: Record<ProtokollTyp, string> = {
  reparatur: "Reparatur",
  wartung: "Wartung",
  besichtigung: "Besichtigung",
  schaden: "Schaden",
  sonstiges: "Sonstiges",
};

export const TRANSAKTION_ART: Record<TransaktionsArt, string> = {
  miete: "Mieteingang",
  sonstige_einnahme: "Sonstige Einnahme",
  hausverwaltung: "Hausverwaltung",
  grundsteuer: "Grundsteuer",
  sonstige_ausgabe: "Sonstige Ausgabe",
};

/** Ist die Art eine Einnahme (positiver Betrag)? */
export function istEinnahme(art: TransaktionsArt): boolean {
  return art === "miete" || art === "sonstige_einnahme";
}
