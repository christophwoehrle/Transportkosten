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

  createdAt: number;
  updatedAt: number;
}

export interface Dokument {
  id: string;
  wohnungId: string;
  kategorie: DokumentKategorie;
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
  sonstiges: "Sonstiges",
};
