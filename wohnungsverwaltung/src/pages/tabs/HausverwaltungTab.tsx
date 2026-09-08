import type * as React from "react";
import { Plus, Printer, Trash2 } from "lucide-react";
import type { TabProps } from "../WohnungDetail";
import type { Nebenkosten, NkPosten } from "@/types";
import { formatDate, formatEuro, uid } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { NumberInput } from "@/components/NumberInput";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Field, FieldGrid } from "@/components/Field";
import { DocumentSection } from "@/components/DocumentSection";

/** Volle Monate zwischen zwei ISO-Daten (inklusive), Fallback 12. */
function monateImZeitraum(von: string, bis: string): number {
  if (!von || !bis) return 12;
  const a = new Date(von);
  const b = new Date(bis);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 12;
  const monate =
    (b.getFullYear() - a.getFullYear()) * 12 +
    (b.getMonth() - a.getMonth()) +
    1;
  return monate > 0 ? monate : 12;
}

export function HausverwaltungTab({ wohnung, update }: TabProps) {
  const nk = wohnung.nebenkosten;

  function setNk(patch: Partial<Nebenkosten>) {
    update({ nebenkosten: { ...nk, ...patch } });
  }
  function setPosten(posten: NkPosten[]) {
    setNk({ posten });
  }
  function updatePosten(id: string, patch: Partial<NkPosten>) {
    setPosten(nk.posten.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }
  function addPosten() {
    setPosten([
      ...nk.posten,
      { id: uid(), bezeichnung: "", betrag: null, umlagefaehig: true },
    ]);
  }
  function removePosten(id: string) {
    setPosten(nk.posten.filter((p) => p.id !== id));
  }

  const summeUmlagefaehig = nk.posten
    .filter((p) => p.umlagefaehig)
    .reduce((s, p) => s + (p.betrag ?? 0), 0);
  const summeGesamt = nk.posten.reduce((s, p) => s + (p.betrag ?? 0), 0);

  const monate = monateImZeitraum(nk.zeitraumVon, nk.zeitraumBis);
  const vorauszahlung = (wohnung.miete.betriebskosten ?? 0) * monate;
  const differenz = summeUmlagefaehig - vorauszahlung; // > 0 = Nachzahlung
  const istNachzahlung = differenz > 0;

  return (
    <div className="space-y-6">
      {/* Upload / Scan */}
      <Card>
        <CardContent className="p-6">
          <DocumentSection
            wohnungId={wohnung.id}
            kategorien={["hausverwaltung", "sonstiges"]}
            standardKategorie="hausverwaltung"
            titel="Abrechnungen der Hausverwaltung"
            beschreibung="Abrechnungen hochladen oder scannen. Die einzelnen Kostenposten trägst du unten ein."
          />
        </CardContent>
      </Card>

      {/* NK-Abrechnung */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Nebenkostenabrechnung</CardTitle>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer /> Als PDF / Drucken
          </Button>
        </CardHeader>
        <CardContent className="space-y-5">
          <FieldGrid>
            <Field label="Zeitraum von">
              <Input
                type="date"
                value={nk.zeitraumVon}
                onChange={(e) => setNk({ zeitraumVon: e.target.value })}
              />
            </Field>
            <Field label="Zeitraum bis" hint={`${monate} Monat(e) im Zeitraum`}>
              <Input
                type="date"
                value={nk.zeitraumBis}
                onChange={(e) => setNk({ zeitraumBis: e.target.value })}
              />
            </Field>
          </FieldGrid>

          <div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[45%]">Kostenposten</TableHead>
                  <TableHead className="w-[25%]">Betrag</TableHead>
                  <TableHead className="text-center">Umlagefähig</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {nk.posten.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      Noch keine Posten. Erfasse die Positionen aus der
                      hochgeladenen Abrechnung.
                    </TableCell>
                  </TableRow>
                )}
                {nk.posten.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Input
                        value={p.bezeichnung}
                        onChange={(e) =>
                          updatePosten(p.id, { bezeichnung: e.target.value })
                        }
                        placeholder="z. B. Wasser/Abwasser"
                      />
                    </TableCell>
                    <TableCell>
                      <NumberInput
                        value={p.betrag}
                        onValueChange={(v) => updatePosten(p.id, { betrag: v })}
                        placeholder="0,00"
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex justify-center">
                        <Checkbox
                          checked={p.umlagefaehig}
                          onCheckedChange={(c) =>
                            updatePosten(p.id, { umlagefaehig: c })
                          }
                          aria-label="Umlagefähig"
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => removePosten(p.id)}
                        aria-label="Posten löschen"
                      >
                        <Trash2 />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Button variant="outline" size="sm" className="mt-3" onClick={addPosten}>
              <Plus /> Posten hinzufügen
            </Button>
          </div>

          {/* Ergebnis */}
          <div className="rounded-lg border border-border">
            <Zeile label="Umlagefähige Kosten" value={formatEuro(summeUmlagefaehig)} />
            <Zeile
              label={`Geleistete Vorauszahlung (${monate} × ${formatEuro(
                wohnung.miete.betriebskosten
              )})`}
              value={`− ${formatEuro(vorauszahlung)}`}
            />
            <div
              className={`flex items-center justify-between px-4 py-3 text-base font-semibold ${
                istNachzahlung ? "text-rose-700" : "text-emerald-700"
              }`}
            >
              <span>{istNachzahlung ? "Nachzahlung Mieter" : "Guthaben Mieter"}</span>
              <span>{formatEuro(Math.abs(differenz))}</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Nicht umlagefähige Kosten (Summe aller Posten: {formatEuro(summeGesamt)})
            fließen nicht in die Abrechnung ein.
          </p>
        </CardContent>
      </Card>

      {/* Druckansicht (nur beim Drucken sichtbar) */}
      <div className="print-only">
        <NkDruckansicht
          wohnung={wohnung}
          summeUmlagefaehig={summeUmlagefaehig}
          vorauszahlung={vorauszahlung}
          differenz={differenz}
          monate={monate}
        />
      </div>
    </div>
  );
}

function Zeile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-2.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function NkDruckansicht({
  wohnung,
  summeUmlagefaehig,
  vorauszahlung,
  differenz,
  monate,
}: {
  wohnung: TabProps["wohnung"];
  summeUmlagefaehig: number;
  vorauszahlung: number;
  differenz: number;
  monate: number;
}) {
  const nk = wohnung.nebenkosten;
  const istNachzahlung = differenz > 0;
  return (
    <div style={{ fontFamily: "sans-serif", color: "#111", maxWidth: 720 }}>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>Nebenkostenabrechnung</h1>
      <p style={{ margin: "2px 0" }}>
        <strong>Objekt:</strong> {wohnung.bezeichnung} —{" "}
        {[wohnung.strasse, wohnung.plz, wohnung.ort].filter(Boolean).join(", ")}
      </p>
      <p style={{ margin: "2px 0" }}>
        <strong>Mieter:</strong> {wohnung.mieter.name || "–"}
      </p>
      <p style={{ margin: "2px 0" }}>
        <strong>Zeitraum:</strong> {formatDate(nk.zeitraumVon)} –{" "}
        {formatDate(nk.zeitraumBis)} ({monate} Monate)
      </p>

      <table
        style={{ width: "100%", borderCollapse: "collapse", marginTop: 16 }}
      >
        <thead>
          <tr>
            <th style={thStyle}>Kostenposten</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Betrag</th>
            <th style={{ ...thStyle, textAlign: "center" }}>Umlagefähig</th>
          </tr>
        </thead>
        <tbody>
          {nk.posten.map((p) => (
            <tr key={p.id}>
              <td style={tdStyle}>{p.bezeichnung || "–"}</td>
              <td style={{ ...tdStyle, textAlign: "right" }}>
                {formatEuro(p.betrag)}
              </td>
              <td style={{ ...tdStyle, textAlign: "center" }}>
                {p.umlagefaehig ? "ja" : "nein"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 16, fontSize: 14 }}>
        <div style={sumRow}>
          <span>Umlagefähige Kosten</span>
          <span>{formatEuro(summeUmlagefaehig)}</span>
        </div>
        <div style={sumRow}>
          <span>Geleistete Vorauszahlung</span>
          <span>− {formatEuro(vorauszahlung)}</span>
        </div>
        <div style={{ ...sumRow, fontWeight: 700, borderTop: "2px solid #111" }}>
          <span>{istNachzahlung ? "Nachzahlung Mieter" : "Guthaben Mieter"}</span>
          <span>{formatEuro(Math.abs(differenz))}</span>
        </div>
      </div>

      <p style={{ marginTop: 24, fontSize: 11, color: "#666" }}>
        Erstellt am {formatDate(new Date().toISOString().slice(0, 10))}. Keine
        Steuerberatung.
      </p>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  borderBottom: "1px solid #999",
  textAlign: "left",
  padding: "6px 8px",
  fontSize: 13,
};
const tdStyle: React.CSSProperties = {
  borderBottom: "1px solid #ddd",
  padding: "6px 8px",
  fontSize: 13,
};
const sumRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  padding: "6px 0",
};
