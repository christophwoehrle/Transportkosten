import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind-Klassen zusammenführen (shadcn-Konvention). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const eur = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

const num2 = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Formatiert einen Betrag als „1.234,56 €". null/leer → „–". */
export function formatEuro(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "–";
  return eur.format(value);
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "–";
  return num2.format(value);
}

/** ISO-Datum (yyyy-mm-dd) → „TT.MM.JJJJ". */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "–";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "–";
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Kaufdatum + 10 Jahre (Spekulationsfrist § 23 EStG). */
export function fristEnde(kaufdatum: string): Date | null {
  if (!kaufdatum) return null;
  const d = new Date(kaufdatum);
  if (Number.isNaN(d.getTime())) return null;
  const end = new Date(d);
  end.setFullYear(end.getFullYear() + 10);
  return end;
}

export interface FristInfo {
  ende: Date | null;
  fortschritt: number; // 0–100 %
  tageVerbleibend: number | null;
  status: "rot" | "gelb" | "gruen" | "unbekannt";
  labelVerbleibend: string;
}

const TAG_MS = 24 * 60 * 60 * 1000;

/** Berechnet Fortschritt und Status der 10-Jahres-Frist. */
export function berechneFrist(kaufdatum: string, jetzt = new Date()): FristInfo {
  const start = kaufdatum ? new Date(kaufdatum) : null;
  const ende = fristEnde(kaufdatum);
  if (!start || !ende || Number.isNaN(start.getTime())) {
    return {
      ende: null,
      fortschritt: 0,
      tageVerbleibend: null,
      status: "unbekannt",
      labelVerbleibend: "Kein Kaufdatum",
    };
  }

  const gesamt = ende.getTime() - start.getTime();
  const verstrichen = jetzt.getTime() - start.getTime();
  const fortschritt = Math.max(0, Math.min(100, (verstrichen / gesamt) * 100));

  const tageVerbleibend = Math.ceil((ende.getTime() - jetzt.getTime()) / TAG_MS);

  let status: FristInfo["status"];
  let labelVerbleibend: string;

  if (tageVerbleibend <= 0) {
    status = "gruen";
    labelVerbleibend = "Frist erreicht";
  } else if (tageVerbleibend <= 365) {
    status = "gelb";
    labelVerbleibend = restlaufzeitLabel(tageVerbleibend);
  } else {
    status = "rot";
    labelVerbleibend = restlaufzeitLabel(tageVerbleibend);
  }

  return { ende, fortschritt, tageVerbleibend, status, labelVerbleibend };
}

function restlaufzeitLabel(tage: number): string {
  if (tage <= 0) return "Frist erreicht";
  const jahre = Math.floor(tage / 365);
  const monate = Math.floor((tage % 365) / 30);
  if (jahre > 0) {
    return monate > 0
      ? `noch ${jahre} J. ${monate} Mon.`
      : `noch ${jahre} Jahr${jahre === 1 ? "" : "e"}`;
  }
  if (monate > 0) return `noch ${monate} Monat${monate === 1 ? "" : "e"}`;
  return `noch ${tage} Tag${tage === 1 ? "" : "e"}`;
}

/** Google-Maps-Link aus der Adresse einer Wohnung (null, wenn keine Adresse). */
export function googleMapsUrl(parts: {
  strasse?: string;
  plz?: string;
  ort?: string;
}): string | null {
  const adresse = [parts.strasse, parts.plz, parts.ort]
    .map((s) => (s || "").trim())
    .filter(Boolean)
    .join(", ");
  if (!adresse) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    adresse
  )}`;
}

/** Kleiner, kollisionsarmer ID-Generator. */
export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Robustes Parsen von Zahleneingaben mit deutschem Format ("1.234,56"). */
export function parseNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const normalized = trimmed.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isNaN(n) ? null : n;
}
