import * as React from "react";
import { Banknote, Check, Plus, RefreshCw, Trash2, Upload, X } from "lucide-react";
import type { BankTransaktion } from "@/types";
import type { TabProps } from "../WohnungDetail";
import { bankService } from "@/data/bankService";
import { mieteingangJahr, MONATE_KURZ, erwarteteMiete } from "@/lib/mieteingang";
import { formatDate, formatEuro, parseNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Field, FieldGrid } from "@/components/Field";
import { NumberInput } from "@/components/NumberInput";

const STATUS = {
  bezahlt: { variant: "success" as const, label: "bezahlt" },
  offen: { variant: "danger" as const, label: "offen" },
  ausstehend: { variant: "secondary" as const, label: "ausstehend" },
};

export function MieteingangTab({ wohnung }: TabProps) {
  const [transaktionen, setTransaktionen] = React.useState<BankTransaktion[]>([]);
  const [jahr, setJahr] = React.useState(new Date().getFullYear());
  const [importOffen, setImportOffen] = React.useState(false);
  const [csv, setCsv] = React.useState("");
  const [neu, setNeu] = React.useState({ datum: "", betrag: "", zweck: "" });
  const [meldung, setMeldung] = React.useState<string | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);

  const laden = React.useCallback(async () => {
    setTransaktionen(await bankService.getTransaktionen());
  }, []);
  React.useEffect(() => {
    laden();
  }, [laden]);

  const monate = React.useMemo(
    () => mieteingangJahr(wohnung, transaktionen, jahr),
    [wohnung, transaktionen, jahr]
  );
  const { warm } = erwarteteMiete(wohnung);
  const bezahlt = monate.filter((m) => m.status === "bezahlt").length;
  const offen = monate.filter((m) => m.status === "offen").length;

  async function demodaten() {
    const n = await bankService.ladeDemodaten();
    await laden();
    setMeldung(`${n} Demo-Buchungen geladen.`);
  }
  async function importieren() {
    const n = await bankService.importCsv(csv);
    await laden();
    setImportOffen(false);
    setCsv("");
    setMeldung(`${n} Buchungen importiert.`);
  }
  async function datei(files: FileList | null) {
    if (!files || !files[0]) return;
    const text = await files[0].text();
    const n = await bankService.importCsv(text);
    await laden();
    setMeldung(`${n} Buchungen aus Datei importiert.`);
    if (fileInput.current) fileInput.current.value = "";
  }
  async function manuellHinzufuegen() {
    const betrag = parseNumber(neu.betrag);
    if (betrag == null || !neu.datum) return;
    await bankService.addTransaktion({
      datum: neu.datum,
      betrag,
      verwendungszweck: neu.zweck,
      gegenpartei: wohnung.mieter.name,
      iban: wohnung.mieter.iban,
      quelle: "manuell",
    });
    setNeu({ datum: "", betrag: "", zweck: "" });
    await laden();
  }
  async function loeschen(id: string) {
    await bankService.deleteTransaktion(id);
    await laden();
  }

  // Nur zu dieser Wohnung passende Buchungen fürs Kontoauszug-Listing.
  const zugeordnet = React.useMemo(() => {
    const ids = new Set(monate.map((m) => m.transaktion?.id).filter(Boolean));
    return transaktionen.filter((t) => ids.has(t.id));
  }, [monate, transaktionen]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Mieteingang prüfen</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setJahr((j) => j - 1)} aria-label="Vorheriges Jahr">
              <span className="text-lg">‹</span>
            </Button>
            <span className="w-14 text-center text-sm font-medium">{jahr}</span>
            <Button variant="ghost" size="icon" onClick={() => setJahr((j) => j + 1)} aria-label="Nächstes Jahr">
              <span className="text-lg">›</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="text-muted-foreground">
              Erwartete Warmmiete: <b className="text-foreground">{formatEuro(warm)}</b> / Monat
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="text-emerald-700">{bezahlt} bezahlt</span>
            <span className="text-rose-700">{offen} offen</span>
          </div>

          {warm <= 0 && (
            <p className="rounded-md bg-amber-50 p-3 text-xs text-amber-800">
              Keine Kaltmiete hinterlegt – der Abgleich benötigt die Miete aus dem
              Reiter „Miete & Nebenkosten".
            </p>
          )}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {monate.map((m) => {
              const s = STATUS[m.status];
              return (
                <div key={m.monat} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{MONATE_KURZ[m.monat]}</span>
                    <Badge variant={s.variant}>{s.label}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">Soll: {formatEuro(m.soll)}</p>
                  <p className="text-xs text-muted-foreground">
                    {m.transaktion
                      ? `Ist: ${formatEuro(m.transaktion.betrag)} · ${formatDate(m.transaktion.datum)}`
                      : m.status === "ausstehend"
                      ? "noch nicht fällig"
                      : "kein Eingang"}
                  </p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Banking-Schnittstelle */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Banking-Schnittstelle</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Kontobewegungen werden lokal gehalten und gegen die erwartete Miete
            abgeglichen. Import als CSV, aus Datei oder manuell; eine echte
            Bank-Anbindung (FinTS/HBCI oder Banking-API) lässt sich über die
            <code className="mx-1 rounded bg-muted px-1">BankService</code>-Schnittstelle
            ergänzen.
          </p>

          {meldung && (
            <p className="flex items-center gap-2 rounded-md bg-emerald-50 p-2 text-xs text-emerald-800">
              <Check className="h-4 w-4" /> {meldung}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={demodaten}>
              <RefreshCw /> Demodaten laden
            </Button>
            <Button variant="outline" size="sm" onClick={() => setImportOffen((v) => !v)}>
              <Upload /> CSV einfügen
            </Button>
            <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
              <Upload /> CSV-Datei
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv,text/plain"
              className="hidden"
              onChange={(e) => datei(e.target.files)}
            />
            {transaktionen.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={async () => {
                  await bankService.clearAll();
                  await laden();
                }}
              >
                <Trash2 /> Alle löschen
              </Button>
            )}
          </div>

          {importOffen && (
            <div className="space-y-2">
              <textarea
                value={csv}
                onChange={(e) => setCsv(e.target.value)}
                placeholder={"Datum;Betrag;Verwendungszweck;Gegenpartei;IBAN\n03.01.2026;1400,00;Miete Januar;Julia Sommer;DE89370400440532013000"}
                className="h-28 w-full rounded-md border border-input bg-background p-2 font-mono text-xs"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={importieren} disabled={!csv.trim()}>
                  Importieren
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setImportOffen(false)}>
                  <X /> Abbrechen
                </Button>
              </div>
            </div>
          )}

          {/* Manuelle Buchung */}
          <div className="rounded-lg border border-dashed border-border p-4">
            <p className="mb-3 text-sm font-medium">Buchung manuell erfassen</p>
            <FieldGrid>
              <Field label="Datum">
                <Input type="date" value={neu.datum} onChange={(e) => setNeu({ ...neu, datum: e.target.value })} />
              </Field>
              <Field label="Betrag (€)">
                <NumberInput
                  value={parseNumber(neu.betrag)}
                  onValueChange={(v) => setNeu({ ...neu, betrag: v == null ? "" : String(v).replace(".", ",") })}
                />
              </Field>
              <Field label="Verwendungszweck" className="sm:col-span-2">
                <Input value={neu.zweck} onChange={(e) => setNeu({ ...neu, zweck: e.target.value })} placeholder="z. B. Miete" />
              </Field>
            </FieldGrid>
            <Button size="sm" className="mt-3" onClick={manuellHinzufuegen} disabled={!neu.datum || parseNumber(neu.betrag) == null}>
              <Plus /> Hinzufügen (Mieter {wohnung.mieter.name || "?"})
            </Button>
          </div>

          {/* Zugeordnete Buchungen */}
          {zugeordnet.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium">
                Zugeordnete Eingänge {jahr} ({zugeordnet.length})
              </p>
              <div className="divide-y divide-border rounded-lg border border-border">
                {zugeordnet.map((t) => (
                  <div key={t.id} className="flex items-center justify-between p-2.5 text-sm">
                    <div>
                      <p className="font-medium">{formatEuro(t.betrag)}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(t.datum)} · {t.verwendungszweck || t.gegenpartei || "–"}
                        {t.quelle === "demo" ? " · Demo" : ""}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => loeschen(t.id)}
                      aria-label="Buchung löschen"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
