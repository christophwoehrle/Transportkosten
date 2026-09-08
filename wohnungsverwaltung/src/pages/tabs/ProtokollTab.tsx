import { Plus, Trash2, Wrench } from "lucide-react";
import type { TabProps } from "../WohnungDetail";
import type { ProtokollEintrag, ProtokollTyp } from "@/types";
import { PROTOKOLL_TYPEN } from "@/types";
import { formatDate, formatEuro, uid } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { NumberInput } from "@/components/NumberInput";
import { Field, FieldGrid } from "@/components/Field";
import { DocumentSection } from "@/components/DocumentSection";
import { repository } from "@/data/repository";

export function ProtokollTab({ wohnung, update }: TabProps) {
  const eintraege = wohnung.protokoll;

  function setEintraege(next: ProtokollEintrag[]) {
    update({ protokoll: next });
  }
  function upd(id: string, patch: Partial<ProtokollEintrag>) {
    setEintraege(eintraege.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }
  function add() {
    const neu: ProtokollEintrag = {
      id: uid(),
      typ: "reparatur",
      datum: new Date().toISOString().slice(0, 10),
      beschreibung: "",
      kontaktName: "",
      kontaktEmail: "",
      kontaktTelefon: "",
      behoben: false,
      mietminderung: { aktiv: false, von: "", bis: "", betrag: null },
      createdAt: Date.now(),
    };
    setEintraege([neu, ...eintraege]);
  }
  async function remove(id: string) {
    // Zugehörige Belege mit entfernen (sonst verwaiste Blobs).
    const belege = await repository.getDokumente(wohnung.id, "beleg");
    await Promise.all(
      belege
        .filter((d) => d.protokollId === id)
        .map((d) => repository.deleteDokument(d.id))
    );
    setEintraege(eintraege.filter((e) => e.id !== id));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Protokoll</h2>
          <p className="text-sm text-muted-foreground">
            Reparaturen, Wartungen und Schäden dokumentieren – inkl. Belegen und
            eventueller Mietminderung.
          </p>
        </div>
        <Button onClick={add}>
          <Plus /> Neuer Eintrag
        </Button>
      </div>

      {eintraege.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Wrench className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              Noch keine Einträge. Lege z. B. eine Reparatur an.
            </p>
            <Button onClick={add}>
              <Plus /> Neuer Eintrag
            </Button>
          </CardContent>
        </Card>
      ) : (
        eintraege.map((e) => (
          <Card key={e.id}>
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">
                  {PROTOKOLL_TYPEN[e.typ]}
                </CardTitle>
                <Badge variant={e.behoben ? "success" : "warning"}>
                  {e.behoben ? "behoben" : "offen"}
                </Badge>
                {e.mietminderung.aktiv && (
                  <Badge variant="danger">Mietminderung</Badge>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => remove(e.id)}
                aria-label="Eintrag löschen"
              >
                <Trash2 />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <FieldGrid>
                <Field label="Art">
                  <Select
                    value={e.typ}
                    onChange={(ev) =>
                      upd(e.id, { typ: ev.target.value as ProtokollTyp })
                    }
                  >
                    {(Object.keys(PROTOKOLL_TYPEN) as ProtokollTyp[]).map((t) => (
                      <option key={t} value={t}>
                        {PROTOKOLL_TYPEN[t]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Wann">
                  <Input
                    type="date"
                    value={e.datum}
                    onChange={(ev) => upd(e.id, { datum: ev.target.value })}
                  />
                </Field>
              </FieldGrid>

              <Field label="Beschreibung">
                <Textarea
                  value={e.beschreibung}
                  onChange={(ev) => upd(e.id, { beschreibung: ev.target.value })}
                  placeholder="z. B. Wespennest am Balkon muss entfernt werden."
                />
              </Field>

              <div>
                <p className="mb-2 text-sm font-medium">Durch wen (Kontakt)</p>
                <FieldGrid>
                  <Field label="Name">
                    <Input
                      value={e.kontaktName}
                      onChange={(ev) => upd(e.id, { kontaktName: ev.target.value })}
                    />
                  </Field>
                  <Field label="Telefon">
                    <Input
                      type="tel"
                      value={e.kontaktTelefon}
                      onChange={(ev) =>
                        upd(e.id, { kontaktTelefon: ev.target.value })
                      }
                    />
                  </Field>
                  <Field label="E-Mail" className="sm:col-span-2">
                    <Input
                      type="email"
                      value={e.kontaktEmail}
                      onChange={(ev) => upd(e.id, { kontaktEmail: ev.target.value })}
                    />
                  </Field>
                </FieldGrid>
                {(e.kontaktEmail || e.kontaktTelefon) && (
                  <div className="mt-3 flex gap-2">
                    {e.kontaktEmail && (
                      <a
                        href={`mailto:${encodeURIComponent(e.kontaktEmail)}`}
                        className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm hover:bg-accent"
                      >
                        ✉️ E-Mail
                      </a>
                    )}
                    {e.kontaktTelefon && (
                      <a
                        href={`tel:${e.kontaktTelefon.replace(/\s+/g, "")}`}
                        className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm hover:bg-accent"
                      >
                        📞 Anrufen
                      </a>
                    )}
                  </div>
                )}
              </div>

              {/* Belege */}
              <div className="rounded-lg border border-border p-4">
                <DocumentSection
                  wohnungId={wohnung.id}
                  protokollId={e.id}
                  kategorien={["beleg"]}
                  standardKategorie="beleg"
                  titel="Belege"
                  beschreibung="Rechnung/Beleg hochladen oder scannen."
                  kompakt
                />
              </div>

              {/* Status + Mietminderung */}
              <div className="flex flex-wrap items-center gap-6 border-t border-border pt-4">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                  <Checkbox
                    checked={e.behoben}
                    onCheckedChange={(c) => upd(e.id, { behoben: c })}
                  />
                  Problem behoben
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                  <Checkbox
                    checked={e.mietminderung.aktiv}
                    onCheckedChange={(c) =>
                      upd(e.id, {
                        mietminderung: { ...e.mietminderung, aktiv: c },
                      })
                    }
                  />
                  Mietminderung
                </label>
              </div>

              {e.mietminderung.aktiv && (
                <div className="rounded-lg bg-muted p-4">
                  <FieldGrid>
                    <Field label="Von">
                      <Input
                        type="date"
                        value={e.mietminderung.von}
                        onChange={(ev) =>
                          upd(e.id, {
                            mietminderung: {
                              ...e.mietminderung,
                              von: ev.target.value,
                            },
                          })
                        }
                      />
                    </Field>
                    <Field label="Bis">
                      <Input
                        type="date"
                        value={e.mietminderung.bis}
                        onChange={(ev) =>
                          upd(e.id, {
                            mietminderung: {
                              ...e.mietminderung,
                              bis: ev.target.value,
                            },
                          })
                        }
                      />
                    </Field>
                    <Field
                      label="Geminderte Miete (€ / Monat)"
                      className="sm:col-span-2"
                      hint={
                        wohnung.miete.kaltmiete != null
                          ? `Reguläre Kaltmiete: ${formatEuro(
                              wohnung.miete.kaltmiete
                            )}`
                          : undefined
                      }
                    >
                      <NumberInput
                        value={e.mietminderung.betrag}
                        onValueChange={(v) =>
                          upd(e.id, {
                            mietminderung: { ...e.mietminderung, betrag: v },
                          })
                        }
                      />
                    </Field>
                  </FieldGrid>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Mietminderung {formatDate(e.mietminderung.von)} –{" "}
                    {formatDate(e.mietminderung.bis)} auf{" "}
                    {formatEuro(e.mietminderung.betrag)} / Monat.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
