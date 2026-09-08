// Einfache Format-Validierung für IBAN und BIC.
// Die IBAN-Prüfung nutzt den offiziellen Modulo-97-Algorithmus (ISO 13616),
// bleibt aber bewusst leichtgewichtig.

export function normalizeIban(iban: string): string {
  return iban.replace(/\s+/g, "").toUpperCase();
}

/** Formatiert eine IBAN in 4er-Gruppen zur Anzeige. */
export function formatIban(iban: string): string {
  return normalizeIban(iban).replace(/(.{4})/g, "$1 ").trim();
}

/** true, wenn die IBAN strukturell und per Modulo-97-Prüfsumme gültig ist. */
export function isValidIban(input: string): boolean {
  const iban = normalizeIban(input);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;

  // Erste vier Zeichen ans Ende, Buchstaben in Zahlen (A=10 … Z=35)
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (ch) =>
    (ch.charCodeAt(0) - 55).toString()
  );

  // Modulo 97 in Blöcken (vermeidet BigInt-Overflow)
  let remainder = 0;
  for (let i = 0; i < numeric.length; i += 7) {
    const block = String(remainder) + numeric.slice(i, i + 7);
    remainder = Number(block) % 97;
  }
  return remainder === 1;
}

/** true, wenn die BIC dem 8- oder 11-stelligen Format entspricht. */
export function isValidBic(input: string): boolean {
  const bic = input.replace(/\s+/g, "").toUpperCase();
  return /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic);
}
