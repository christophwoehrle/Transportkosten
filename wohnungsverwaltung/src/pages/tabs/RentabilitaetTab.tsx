import * as React from "react";
import { Plus, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import type { BankTransaktion, TransaktionsArt } from "@/types";
import { TRANSAKTION_ART, istEinnahme } from "@/types";
import type { TabProps } from "../WohnungDetail";
import { bankService } from "@/data/bankService";
import {
  abgangStatus,
  erwarteteKosten,
  gehoertZuWohnung,
  rentabilitaet,
} from "@/lib/rentabilitaet";
import { MONATE_KURZ } from "@/lib/mieteingang";
import { formatEuro, parseNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Field, FieldGrid } from "@/components/Field";
import { NumberInput } from "@/components/NumberInput";

const STATUS_BADGE = {
  aktuell: { variant: "success" as const, label: "aktuell" },
  teilweise: { variant: "warning" as const, label: "teilweise" },
  offen: { variant: "danger" as const, label: "offen" },
  unbekannt: { variant: "secondary" as const, label: "kein Sollwert" },
};

export function RentabilitaetTab({ wohnung }: TabProps) {
  const [transaktionen, setTransaktionen] = React.useState<BankTransaktion[]>([]);
  const [jahr, setJahr] = React.useState(new Date().getFullYear());
  const [neu, setNeu] = React.useState<{
    art: TransaktionsArt;
    datum: string;
    betrag: string;
    zweck: string;
  }>({ art: "hausverwaltung", datum: "", betrag: "", zweck: "" });

  const laden = React.useCallback(async () => {
    setTransaktionen(await bankService.getTransaktionen());
  }, []);
  React.useEffect(() => {
    laden();
  }, [laden]);

  const r = React.useMemo(
    () => rentabilitaet(wohnung, transaktionen, jahr),
    [wohnung, transaktionen, jahr]
  );
  const kosten = erwarteteKosten(wohnung);
  const hvStatus = abgangStatus(
    r.ausgabenNachArt.hausverwaltung,
    kosten.hausverwaltungJahr,
    jahr
  );
  const gsStatus = abgangStatus(
    r.ausgabenNachArt.grundsteuer,
    kosten.grundsteuerJahr,
    jahr
  );

  const eigene = React.useMemo(
    () =>
      transaktionen
        .filter(
          (t) =>
            gehoertZuWohnung(wohnung, t) &&
            new Date(t.datum).getFullYear() === jahr
        )
        .sort((a, b) => (a.datum < b.datum ? 1 : -1)),
    [transaktionen, wohnung, jahr]
  );

  async function buchen() {
    const betrag = parseNumber(neu.betrag);
    if (betrag == null || !neu.datum) return;
    const signiert = istEinnahme(neu.art) ? Math.abs(betrag) : -Math.abs(betrag);
    await bankService.addTransaktion({
      datum: neu.datum,
      betrag: signiert,
      verwendungszweck: neu.zweck || TRANSAKTION_ART[neu.art],
      gegenpartei: istEinnahme(neu.art) ? wohnung.mieter.name : TRANSAKTION_ART[neu.art],
      iban: neu.art === "miete" ? wohnung.mieter.iban : "",
      art: neu.art,
      wohnungId: wohnung.id,
      quelle: "manuell",
    });
    setNeu({ ...neu, datum: "", betrag: "", zweck: "" });
    await laden();
  }
  async function loeschen(id: string) {
    await bankService.deleteTransaktion(id);
    await laden();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Rentabilität – Einnahmen / Ausgaben</CardTitle>
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
        <CardContent className="space-y-6">
          {/* Kennzahlen */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Kpi label="Einnahmen" value={formatEuro(r.einnahmen)} tone="pos" />
            <Kpi label="Ausgaben" value={formatEuro(r.ausgaben)} tone="neg" />
            <Kpi
              label="Saldo (Cashflow)"
              value={formatEuro(r.saldo)}
              tone={r.saldo >= 0 ? "pos" : "neg"}
              betont
              rendite={r.rendite}
            />
          </div>

          {r.anzahl === 0 && (
            <p className="rounded-md bg-amber-50 p-3 text-xs text-amber-800">
              Für {jahr} sind keine Kontobewegungen zugeordnet. Buchungen unten
              erfassen oder im Reiter „Mieteingang" Demodaten laden.
            </p>
          )}

          {/* Vergleich Einnahmen vs. Ausgaben */}
          <VergleichsBalken
            einnahmen={r.einnahmen}
            ausgabenNachArt={r.ausgabenNachArt}
          />

          {/* Monatlicher Cashflow */}
          <div>
            <p className="mb-2 text-sm font-medium">Monatlicher Cashflow {jahr}</p>
            <CashflowChart perMonat={r.perMonat} />
            <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
              <Legende farbe="bg-emerald-500" text="Einnahmen" />
              <Legende farbe="bg-rose-500" text="Ausgaben" />
            </div>
          </div>

          {/* Soll/Ist Abgänge */}
          <div className="grid gap-3 sm:grid-cols-2">
            <AbgangKarte
              titel="Hausverwaltung"
              ist={r.ausgabenNachArt.hausverwaltung}
              soll={hvStatus.soll}
              erwartetJahr={kosten.hausverwaltungJahr}
              status={hvStatus.status}
            />
            <AbgangKarte
              titel="Grundsteuer"
              ist={r.ausgabenNachArt.grundsteuer}
              soll={gsStatus.soll}
              erwartetJahr={kosten.grundsteuerJahr}
              status={gsStatus.status}
            />
          </div>
        </CardContent>
      </Card>

      {/* Buchung erfassen */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Buchung erfassen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FieldGrid>
            <Field label="Art">
              <Select
                value={neu.art}
                onChange={(e) =>
                  setNeu({ ...neu, art: e.target.value as TransaktionsArt })
                }
              >
                {(Object.keys(TRANSAKTION_ART) as TransaktionsArt[]).map((a) => (
                  <option key={a} value={a}>
                    {TRANSAKTION_ART[a]} {istEinnahme(a) ? "(Einnahme)" : "(Ausgabe)"}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Datum">
              <Input
                type="date"
                value={neu.datum}
                onChange={(e) => setNeu({ ...neu, datum: e.target.value })}
              />
            </Field>
            <Field label="Betrag (€)" hint="Vorzeichen wird aus der Art abgeleitet.">
              <NumberInput
                value={parseNumber(neu.betrag)}
                onValueChange={(v) =>
                  setNeu({ ...neu, betrag: v == null ? "" : String(v).replace(".", ",") })
                }
              />
            </Field>
            <Field label="Verwendungszweck">
              <Input
                value={neu.zweck}
                onChange={(e) => setNeu({ ...neu, zweck: e.target.value })}
              />
            </Field>
          </FieldGrid>
          <Button size="sm" onClick={buchen} disabled={!neu.datum || parseNumber(neu.betrag) == null}>
            <Plus /> Buchung hinzufügen
          </Button>

          {eigene.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium">
                Buchungen {jahr} ({eigene.length})
              </p>
              <div className="divide-y divide-border rounded-lg border border-border">
                {eigene.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-2 p-2.5 text-sm">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={t.betrag >= 0 ? "font-medium text-emerald-700" : "font-medium text-rose-700"}>
                          {t.betrag >= 0 ? "+" : "−"}
                          {formatEuro(Math.abs(t.betrag))}
                        </span>
                        <Badge variant="secondary">{TRANSAKTION_ART[t.art]}</Badge>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {new Date(t.datum).toLocaleDateString("de-DE")} ·{" "}
                        {t.verwendungszweck || t.gegenpartei || "–"}
                        {t.quelle === "demo" ? " · Demo" : ""}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
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

function Kpi({
  label,
  value,
  tone,
  betont,
  rendite,
}: {
  label: string;
  value: string;
  tone: "pos" | "neg";
  betont?: boolean;
  rendite?: number | null;
}) {
  const color = tone === "pos" ? "text-emerald-700" : "text-rose-700";
  return (
    <div className={`rounded-lg border border-border p-4 ${betont ? "bg-muted" : ""}`}>
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {tone === "pos" ? (
          <TrendingUp className="h-4 w-4 text-emerald-600" />
        ) : (
          <TrendingDown className="h-4 w-4 text-rose-600" />
        )}
        {label}
      </div>
      <p className={`mt-1 text-2xl font-semibold ${betont ? color : "text-foreground"}`}>{value}</p>
      {rendite != null && (
        <p className="text-xs text-muted-foreground">
          Rendite (Saldo/Einnahmen): {(rendite * 100).toFixed(0)} %
        </p>
      )}
    </div>
  );
}

function VergleichsBalken({
  einnahmen,
  ausgabenNachArt,
}: {
  einnahmen: number;
  ausgabenNachArt: { hausverwaltung: number; grundsteuer: number; sonstige_ausgabe: number };
}) {
  const ausgaben =
    ausgabenNachArt.hausverwaltung +
    ausgabenNachArt.grundsteuer +
    ausgabenNachArt.sonstige_ausgabe;
  const max = Math.max(einnahmen, ausgaben, 1);
  const pct = (v: number) => `${(v / max) * 100}%`;
  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1 flex justify-between text-xs">
          <span className="text-muted-foreground">Einnahmen</span>
          <span className="font-medium">{formatEuro(einnahmen)}</span>
        </div>
        <div className="h-6 w-full overflow-hidden rounded-md bg-muted">
          <div className="h-full rounded-md bg-emerald-500" style={{ width: pct(einnahmen) }} />
        </div>
      </div>
      <div>
        <div className="mb-1 flex justify-between text-xs">
          <span className="text-muted-foreground">Ausgaben</span>
          <span className="font-medium">{formatEuro(ausgaben)}</span>
        </div>
        <div className="flex h-6 w-full overflow-hidden rounded-md bg-muted" style={{ width: pct(ausgaben) }}>
          <Segment value={ausgabenNachArt.hausverwaltung} total={ausgaben} className="bg-rose-500" title="Hausverwaltung" />
          <Segment value={ausgabenNachArt.grundsteuer} total={ausgaben} className="bg-amber-500" title="Grundsteuer" />
          <Segment value={ausgabenNachArt.sonstige_ausgabe} total={ausgaben} className="bg-slate-400" title="Sonstige" />
        </div>
        <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <Legende farbe="bg-rose-500" text={`Hausverwaltung ${formatEuro(ausgabenNachArt.hausverwaltung)}`} />
          <Legende farbe="bg-amber-500" text={`Grundsteuer ${formatEuro(ausgabenNachArt.grundsteuer)}`} />
          {ausgabenNachArt.sonstige_ausgabe > 0 && (
            <Legende farbe="bg-slate-400" text={`Sonstige ${formatEuro(ausgabenNachArt.sonstige_ausgabe)}`} />
          )}
        </div>
      </div>
    </div>
  );
}

function Segment({ value, total, className, title }: { value: number; total: number; className: string; title: string }) {
  if (value <= 0 || total <= 0) return null;
  return <div className={`h-full ${className}`} style={{ width: `${(value / total) * 100}%` }} title={`${title}: ${formatEuro(value)}`} />;
}

function CashflowChart({ perMonat }: { perMonat: { einnahmen: number; ausgaben: number }[] }) {
  const W = 720, H = 200, padL = 44, padR = 8, padT = 10, padB = 22;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const max = Math.max(1, ...perMonat.map((m) => Math.max(m.einnahmen, m.ausgaben)));
  const groupW = innerW / 12;
  const barW = Math.min(10, groupW / 2 - 2);
  const y = (v: number) => padT + innerH - (v / max) * innerH;
  const gridVals = [0, max / 2, max];

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-52 w-full min-w-[520px]" role="img" aria-label="Monatlicher Cashflow">
        {gridVals.map((gv, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(gv)} y2={y(gv)} stroke="currentColor" className="text-border" strokeWidth={1} />
            <text x={padL - 6} y={y(gv) + 3} textAnchor="end" className="fill-muted-foreground" fontSize={9}>
              {Math.round(gv)}
            </text>
          </g>
        ))}
        {perMonat.map((m, i) => {
          const gx = padL + i * groupW + groupW / 2;
          return (
            <g key={i}>
              <rect x={gx - barW - 1} y={y(m.einnahmen)} width={barW} height={padT + innerH - y(m.einnahmen)} className="fill-emerald-500" rx={1}>
                <title>{`${MONATE_KURZ[i]}: Einnahmen ${formatEuro(m.einnahmen)}`}</title>
              </rect>
              <rect x={gx + 1} y={y(m.ausgaben)} width={barW} height={padT + innerH - y(m.ausgaben)} className="fill-rose-500" rx={1}>
                <title>{`${MONATE_KURZ[i]}: Ausgaben ${formatEuro(m.ausgaben)}`}</title>
              </rect>
              <text x={gx} y={H - 6} textAnchor="middle" className="fill-muted-foreground" fontSize={9}>
                {MONATE_KURZ[i]}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function AbgangKarte({
  titel,
  ist,
  soll,
  erwartetJahr,
  status,
}: {
  titel: string;
  ist: number;
  soll: number;
  erwartetJahr: number | null;
  status: "aktuell" | "teilweise" | "offen" | "unbekannt";
}) {
  const b = STATUS_BADGE[status];
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{titel}</p>
        <Badge variant={b.variant}>{b.label}</Badge>
      </div>
      <p className="mt-2 text-lg font-semibold">{formatEuro(ist)}</p>
      <p className="text-xs text-muted-foreground">
        {erwartetJahr != null
          ? `Soll bis heute: ${formatEuro(soll)} · erwartet/Jahr: ${formatEuro(erwartetJahr)}`
          : "Kein Sollwert (NK-Posten fehlt)"}
      </p>
    </div>
  );
}

function Legende({ farbe, text }: { farbe: string; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-2.5 rounded-sm ${farbe}`} />
      {text}
    </span>
  );
}
