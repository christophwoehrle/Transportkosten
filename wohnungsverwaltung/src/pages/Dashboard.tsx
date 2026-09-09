import * as React from "react";
import { Link } from "react-router-dom";
import { CalendarClock, Info, Landmark, TrendingUp, Wallet } from "lucide-react";
import type { BankTransaktion, Wohnung } from "@/types";
import { repository } from "@/data/repository";
import { bankService } from "@/data/bankService";
import { berechneFrist, formatDate, formatEuro } from "@/lib/utils";
import { mieteStatusKompakt } from "@/lib/mieteingang";
import { abgangStatus, erwarteteKosten, rentabilitaet } from "@/lib/rentabilitaet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const STATUS_BADGE = {
  gruen: { variant: "success" as const, label: "Frist erreicht" },
  gelb: { variant: "warning" as const, label: "< 12 Monate" },
  rot: { variant: "danger" as const, label: "noch weit entfernt" },
  unbekannt: { variant: "secondary" as const, label: "kein Kaufdatum" },
};

const BAR_COLOR = {
  gruen: "bg-emerald-500",
  gelb: "bg-amber-500",
  rot: "bg-rose-500",
  unbekannt: "bg-slate-300",
};

export function Dashboard() {
  const [wohnungen, setWohnungen] = React.useState<Wohnung[] | null>(null);
  const [transaktionen, setTransaktionen] = React.useState<BankTransaktion[]>([]);
  const jahr = new Date().getFullYear();

  React.useEffect(() => {
    repository.getWohnungen().then(setWohnungen);
    bankService.getTransaktionen().then(setTransaktionen);
  }, []);

  const zeilen = React.useMemo(() => {
    if (!wohnungen) return [];
    return wohnungen
      .map((w) => ({ w, frist: berechneFrist(w.kaufdatum) }))
      .sort((a, b) => {
        // Nach nächstem anstehenden Fristende sortieren.
        const ta = a.frist.ende?.getTime() ?? Infinity;
        const tb = b.frist.ende?.getTime() ?? Infinity;
        return ta - tb;
      });
  }, [wohnungen]);

  const summeKaufpreis = React.useMemo(
    () => (wohnungen ?? []).reduce((s, w) => s + (w.kaufpreis ?? 0), 0),
    [wohnungen]
  );
  const summeKaltmiete = React.useMemo(
    () => (wohnungen ?? []).reduce((s, w) => s + (w.miete.kaltmiete ?? 0), 0),
    [wohnungen]
  );

  if (!wohnungen) {
    return <p className="text-sm text-muted-foreground">Lädt …</p>;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Übersicht aller Objekte und der 10-Jahres-Fristen.
        </p>
      </header>

      {/* Kennzahlen */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Wohnungen" value={String(wohnungen.length)} />
        <StatCard
          label="Kaufpreise gesamt"
          value={formatEuro(summeKaufpreis)}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard
          label="Kaltmiete / Monat"
          value={formatEuro(summeKaltmiete)}
        />
      </div>

      {/* Zeitstrahl */}
      <Card>
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <CalendarClock className="h-5 w-5 text-muted-foreground" />
          <CardTitle>Zeitstrahl – 10-Jahres-Frist (Spekulationsfrist)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {zeilen.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Noch keine Wohnung angelegt.
            </p>
          )}
          {zeilen.map(({ w, frist }) => {
            const badge = STATUS_BADGE[frist.status];
            return (
              <Link
                key={w.id}
                to={`/wohnungen/${w.id}`}
                className="block rounded-lg border border-border p-4 transition-colors hover:bg-accent/50"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{w.bezeichnung || "Ohne Namen"}</p>
                    <p className="text-xs text-muted-foreground">
                      {w.ort || "–"} · Kauf: {formatDate(w.kaufdatum)}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge variant={badge.variant}>{frist.labelVerbleibend}</Badge>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Frist:{" "}
                      {frist.ende
                        ? formatDate(frist.ende.toISOString().slice(0, 10))
                        : "–"}
                    </p>
                  </div>
                </div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${BAR_COLOR[frist.status]}`}
                    style={{ width: `${frist.fortschritt}%` }}
                  />
                </div>
              </Link>
            );
          })}
        </CardContent>
      </Card>

      {/* Finanzstatus je Wohnung */}
      <Card>
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <Wallet className="h-5 w-5 text-muted-foreground" />
          <CardTitle>Finanzstatus je Wohnung ({jahr})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {wohnungen.length === 0 && (
            <p className="text-sm text-muted-foreground">Noch keine Wohnung angelegt.</p>
          )}
          {transaktionen.length === 0 && wohnungen.length > 0 && (
            <p className="rounded-md bg-amber-50 p-3 text-xs text-amber-800">
              Noch keine Kontobewegungen. Im Reiter „Mieteingang" einer Wohnung
              lassen sich Demodaten laden oder Umsätze importieren.
            </p>
          )}
          {wohnungen.map((w) => (
            <FinanzZeile
              key={w.id}
              wohnung={w}
              transaktionen={transaktionen}
              jahr={jahr}
            />
          ))}
        </CardContent>
      </Card>

      <p className="flex items-start gap-2 rounded-md bg-muted p-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        Keine Steuerberatung – bitte steuerliche Fragen mit einem Fachberater
        klären. Die 10-Jahres-Frist bezieht sich auf § 23 EStG (privater
        Veräußerungsgewinn).
      </p>
    </div>
  );
}

const ABGANG_BADGE = {
  aktuell: { variant: "success" as const, label: "aktuell" },
  teilweise: { variant: "warning" as const, label: "teilweise" },
  offen: { variant: "danger" as const, label: "offen" },
  unbekannt: { variant: "secondary" as const, label: "–" },
};

function FinanzZeile({
  wohnung,
  transaktionen,
  jahr,
}: {
  wohnung: Wohnung;
  transaktionen: BankTransaktion[];
  jahr: number;
}) {
  const miete = mieteStatusKompakt(wohnung, transaktionen, jahr);
  const r = rentabilitaet(wohnung, transaktionen, jahr);
  const kosten = erwarteteKosten(wohnung);
  const hv = abgangStatus(r.ausgabenNachArt.hausverwaltung, kosten.hausverwaltungJahr, jahr);
  const gs = abgangStatus(r.ausgabenNachArt.grundsteuer, kosten.grundsteuerJahr, jahr);

  const mieteBadge = !miete.hatMiete
    ? { variant: "secondary" as const, label: "keine Miete" }
    : miete.aktuell
    ? { variant: "success" as const, label: "aktuell" }
    : { variant: "danger" as const, label: `${miete.offen} offen` };

  return (
    <Link
      to={`/wohnungen/${wohnung.id}`}
      className="block rounded-lg border border-border p-4 transition-colors hover:bg-accent/50"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{wohnung.bezeichnung || "Ohne Namen"}</p>
          <p className="text-xs text-muted-foreground">{wohnung.ort || "–"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          <StatusChip icon={<Wallet className="h-3.5 w-3.5" />} label="Miete" badge={mieteBadge} />
          <StatusChip icon={<span className="text-[13px]">🏢</span>} label="Hausverwaltung" badge={ABGANG_BADGE[hv.status]} />
          <StatusChip icon={<Landmark className="h-3.5 w-3.5" />} label="Grundsteuer" badge={ABGANG_BADGE[gs.status]} />
          <div className="text-right">
            <p className="text-muted-foreground">Saldo</p>
            <p className={`font-semibold ${r.saldo >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
              {formatEuro(r.saldo)}
            </p>
          </div>
        </div>
      </div>
      {/* Mini-Cashflow-Balken */}
      <MiniBalken einnahmen={r.einnahmen} ausgaben={r.ausgaben} />
    </Link>
  );
}

function StatusChip({
  icon,
  label,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  badge: { variant: "success" | "warning" | "danger" | "secondary"; label: string };
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-muted-foreground">{label}:</span>
      <Badge variant={badge.variant}>{badge.label}</Badge>
    </div>
  );
}

function MiniBalken({ einnahmen, ausgaben }: { einnahmen: number; ausgaben: number }) {
  const max = Math.max(einnahmen, ausgaben, 1);
  if (einnahmen === 0 && ausgaben === 0) return null;
  return (
    <div className="mt-3 space-y-1">
      <div className="flex items-center gap-2">
        <span className="w-16 shrink-0 text-[10px] text-muted-foreground">Einnahmen</span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(einnahmen / max) * 100}%` }} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-16 shrink-0 text-[10px] text-muted-foreground">Ausgaben</span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-rose-500" style={{ width: `${(ausgaben / max) * 100}%` }} />
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{label}</p>
          {icon && <span className="text-muted-foreground">{icon}</span>}
        </div>
        <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}
