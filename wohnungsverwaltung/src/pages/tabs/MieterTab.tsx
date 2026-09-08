import { Mail, Phone } from "lucide-react";
import type { TabProps } from "../WohnungDetail";
import type { Mieter } from "@/types";
import { isValidBic, isValidIban } from "@/lib/iban";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, FieldGrid } from "@/components/Field";
import { DocumentSection } from "@/components/DocumentSection";

export function MieterTab({ wohnung, update }: TabProps) {
  const m = wohnung.mieter;

  function setM(patch: Partial<Mieter>) {
    update({ mieter: { ...m, ...patch } });
  }

  const ibanOk = m.iban.trim() === "" || isValidIban(m.iban);
  const bicOk = m.bic.trim() === "" || isValidBic(m.bic);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Mieterdaten</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Name">
            <Input value={m.name} onChange={(e) => setM({ name: e.target.value })} />
          </Field>
          <Field label="Anschrift (Straße & Hausnummer)">
            <Input
              value={m.strasse}
              onChange={(e) => setM({ strasse: e.target.value })}
            />
          </Field>
          <FieldGrid>
            <Field label="PLZ">
              <Input value={m.plz} onChange={(e) => setM({ plz: e.target.value })} />
            </Field>
            <Field label="Ort">
              <Input value={m.ort} onChange={(e) => setM({ ort: e.target.value })} />
            </Field>
            <Field label="Telefon">
              <Input
                type="tel"
                value={m.telefon}
                onChange={(e) => setM({ telefon: e.target.value })}
              />
            </Field>
            <Field label="E-Mail">
              <Input
                type="email"
                value={m.email}
                onChange={(e) => setM({ email: e.target.value })}
              />
            </Field>
          </FieldGrid>

          <div className="flex flex-wrap gap-3 border-t border-border pt-4">
            <ContactButton
              kind="mail"
              value={m.email}
              href={m.email ? `mailto:${encodeURIComponent(m.email)}` : undefined}
            />
            <ContactButton
              kind="tel"
              value={m.telefon}
              href={m.telefon ? `tel:${m.telefon.replace(/\s+/g, "")}` : undefined}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bankverbindung</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGrid>
            <Field
              label="IBAN"
              hint={ibanOk ? undefined : "Ungültige IBAN (Prüfsumme)."}
            >
              <Input
                value={m.iban}
                onChange={(e) => setM({ iban: e.target.value })}
                placeholder="DE.."
                aria-invalid={!ibanOk}
                className={ibanOk ? "" : "border-destructive focus-visible:ring-destructive"}
              />
            </Field>
            <Field
              label="BIC"
              hint={bicOk ? undefined : "Ungültiges BIC-Format (8 oder 11 Stellen)."}
            >
              <Input
                value={m.bic}
                onChange={(e) => setM({ bic: e.target.value })}
                aria-invalid={!bicOk}
                className={bicOk ? "" : "border-destructive focus-visible:ring-destructive"}
              />
            </Field>
          </FieldGrid>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mietverhältnis</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGrid>
            <Field label="Einzugsdatum">
              <Input
                type="date"
                value={m.einzugsdatum}
                onChange={(e) => setM({ einzugsdatum: e.target.value })}
              />
            </Field>
            <Field label="Auszugsdatum (optional)">
              <Input
                type="date"
                value={m.auszugsdatum}
                onChange={(e) => setM({ auszugsdatum: e.target.value })}
              />
            </Field>
          </FieldGrid>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <DocumentSection
            wohnungId={wohnung.id}
            kategorien={["mietvertrag"]}
            standardKategorie="mietvertrag"
            titel="Mietvertrag"
            beschreibung="Mietvertrag hochladen oder scannen."
          />
        </CardContent>
      </Card>
    </div>
  );
}

function ContactButton({
  kind,
  value,
  href,
}: {
  kind: "mail" | "tel";
  value: string;
  href?: string;
}) {
  const classes =
    "inline-flex h-10 items-center justify-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-50";
  const label = kind === "mail" ? "E-Mail schreiben" : "Anrufen";
  const Icon = kind === "mail" ? Mail : Phone;

  if (!value || !href) {
    return (
      <button type="button" className={classes} disabled>
        <Icon className="h-4 w-4" /> {label}
      </button>
    );
  }
  return (
    <a href={href} className={classes}>
      <Icon className="h-4 w-4" /> {label}
    </a>
  );
}
