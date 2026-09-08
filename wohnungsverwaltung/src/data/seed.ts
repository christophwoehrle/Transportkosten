import type { Dokument, Wohnung } from "@/types";
import { uid } from "@/lib/utils";

// Beispiel-/Seed-Daten, damit der Prototyp sofort etwas anzeigt.
// Die Kaufdaten sind bewusst so gewählt, dass der Zeitstrahl alle drei Zustände
// zeigt: Frist erreicht (grün), < 12 Monate (gelb) und noch weit weg (rot).

export function seedWohnungen(): Wohnung[] {
  const now = Date.now();

  const base = (over: Partial<Wohnung>): Wohnung => ({
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
    ...over,
  });

  return [
    base({
      bezeichnung: "Altbau Schwabing",
      strasse: "Hohenzollernstraße 42",
      plz: "80801",
      ort: "München",
      wohnflaeche: 78,
      zimmer: 3,
      baujahr: 1910,
      geschoss: "2. OG",
      ausstattungText: "Stuckdecken, Dielenboden, saniert 2015.",
      ausstattungFeatures: ["Einbauküche", "Keller", "Gäste-WC"],
      balkonTerrasse: { vorhanden: true, anzahl: 1 },
      heizungsart: "Gas",
      kaufpreis: 520000,
      // grün: Frist bereits überschritten
      kaufdatum: "2015-06-15",
      finanzierung: {
        bank: "Sparkasse München",
        darlehenssumme: 380000,
        restschuld: 210000,
        zins: 1.8,
        tilgung: 3,
        laufzeitJahre: 20,
        kreditvertragsnummer: "SPK-2015-778812",
        ansprechpartner: {
          name: "Frau Berger",
          email: "berger@sparkasse-muenchen.example",
          telefon: "+49 89 1234560",
        },
      },
      mieter: {
        name: "Julia Sommer",
        strasse: "Hohenzollernstraße 42",
        plz: "80801",
        ort: "München",
        telefon: "+49 170 1112233",
        email: "julia.sommer@example.com",
        iban: "DE89370400440532013000",
        bic: "COBADEFFXXX",
        einzugsdatum: "2019-04-01",
        auszugsdatum: "",
      },
      miete: { kaltmiete: 1180, betriebskosten: 220 },
      nebenkosten: {
        zeitraumVon: "2024-01-01",
        zeitraumBis: "2024-12-31",
        posten: [
          { id: uid(), bezeichnung: "Grundsteuer", betrag: 310, umlagefaehig: true },
          { id: uid(), bezeichnung: "Wasser/Abwasser", betrag: 640, umlagefaehig: true },
          { id: uid(), bezeichnung: "Müllabfuhr", betrag: 180, umlagefaehig: true },
          { id: uid(), bezeichnung: "Hausreinigung", betrag: 420, umlagefaehig: true },
          { id: uid(), bezeichnung: "Verwaltergebühr", betrag: 300, umlagefaehig: false },
          { id: uid(), bezeichnung: "Instandhaltungsrücklage", betrag: 900, umlagefaehig: false },
        ],
      },
    }),
    base({
      bezeichnung: "Neubau am Park",
      strasse: "Parkallee 7",
      plz: "60486",
      ort: "Frankfurt am Main",
      wohnflaeche: 64,
      zimmer: 2,
      baujahr: 2017,
      geschoss: "4. OG",
      ausstattungText: "Bodentiefe Fenster, Aufzug, Tiefgaragenstellplatz.",
      ausstattungFeatures: ["Einbauküche", "Aufzug", "Stellplatz", "Fußbodenheizung"],
      balkonTerrasse: { vorhanden: true, anzahl: 1 },
      heizungsart: "Fernwärme",
      kaufpreis: 410000,
      // gelb: Frist in weniger als 12 Monaten (heute ~ 2026-09)
      kaufdatum: "2016-12-20",
      finanzierung: {
        bank: "ING",
        darlehenssumme: 320000,
        restschuld: 240000,
        zins: 2.4,
        tilgung: 2,
        laufzeitJahre: 25,
        kreditvertragsnummer: "ING-99-4451207",
        ansprechpartner: {
          name: "Herr Klein",
          email: "klein@ing.example",
          telefon: "+49 69 5550000",
        },
      },
      mieter: {
        name: "Familie Demir",
        strasse: "Parkallee 7",
        plz: "60486",
        ort: "Frankfurt am Main",
        telefon: "+49 171 9988776",
        email: "demir@example.com",
        iban: "DE02120300000000202051",
        bic: "BYLADEM1001",
        einzugsdatum: "2021-09-15",
        auszugsdatum: "",
      },
      miete: { kaltmiete: 980, betriebskosten: 190 },
      nebenkosten: {
        zeitraumVon: "2024-01-01",
        zeitraumBis: "2024-12-31",
        posten: [
          { id: uid(), bezeichnung: "Heizung/Fernwärme", betrag: 720, umlagefaehig: true },
          { id: uid(), bezeichnung: "Wasser/Abwasser", betrag: 380, umlagefaehig: true },
          { id: uid(), bezeichnung: "Aufzugswartung", betrag: 260, umlagefaehig: true },
          { id: uid(), bezeichnung: "Allgemeinstrom", betrag: 140, umlagefaehig: true },
          { id: uid(), bezeichnung: "Verwaltergebühr", betrag: 288, umlagefaehig: false },
        ],
      },
    }),
    base({
      bezeichnung: "Stadthaus Ost",
      strasse: "Lindenweg 12",
      plz: "04277",
      ort: "Leipzig",
      wohnflaeche: 92,
      zimmer: 4,
      baujahr: 1998,
      geschoss: "EG",
      ausstattungText: "Gartenanteil, ruhige Lage.",
      ausstattungFeatures: ["Keller", "Stellplatz", "Barrierefrei"],
      balkonTerrasse: { vorhanden: true, anzahl: 2 },
      heizungsart: "Wärmepumpe",
      kaufpreis: 295000,
      // rot: Frist noch viele Jahre entfernt
      kaufdatum: "2022-05-10",
      finanzierung: {
        bank: "DKB",
        darlehenssumme: 240000,
        restschuld: 228000,
        zins: 3.6,
        tilgung: 2,
        laufzeitJahre: 30,
        kreditvertragsnummer: "",
        ansprechpartner: {
          name: "Frau Weiß",
          email: "weiss@dkb.example",
          telefon: "+49 30 1200000",
        },
      },
      mieter: {
        name: "Thomas Richter",
        strasse: "Lindenweg 12",
        plz: "04277",
        ort: "Leipzig",
        telefon: "+49 176 5544332",
        email: "t.richter@example.com",
        iban: "DE44500105175407324931",
        bic: "INGDDEFFXXX",
        einzugsdatum: "2022-08-01",
        auszugsdatum: "",
      },
      miete: { kaltmiete: 860, betriebskosten: 210 },
      nebenkosten: {
        zeitraumVon: "2024-01-01",
        zeitraumBis: "2024-12-31",
        posten: [
          { id: uid(), bezeichnung: "Grundsteuer", betrag: 260, umlagefaehig: true },
          { id: uid(), bezeichnung: "Wasser/Abwasser", betrag: 520, umlagefaehig: true },
          { id: uid(), bezeichnung: "Gartenpflege", betrag: 300, umlagefaehig: true },
          { id: uid(), bezeichnung: "Müllabfuhr", betrag: 200, umlagefaehig: true },
          { id: uid(), bezeichnung: "Rücklage", betrag: 720, umlagefaehig: false },
        ],
      },
    }),
  ];
}

/** Erzeugt ein Beispiel-Dokument (kleine, generierte PDF) für die erste Wohnung. */
export async function seedDokumente(): Promise<Dokument[]> {
  // Bewusst leer gelassen: Blobs werden erst durch echte Uploads angelegt.
  // (Struktur hier belassen, damit ein späteres Seeding einfach möglich ist.)
  return [];
}
