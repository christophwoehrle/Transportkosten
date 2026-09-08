import { Mail } from "lucide-react";
import type { TabProps } from "../WohnungDetail";
import type { Finanzierung } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/NumberInput";
import { Field, FieldGrid } from "@/components/Field";

export function FinanzierungTab({ wohnung, update }: TabProps) {
  const f = wohnung.finanzierung;

  function setF(patch: Partial<Finanzierung>) {
    update({ finanzierung: { ...f, ...patch } });
  }
  function setAnsprech(patch: Partial<Finanzierung["ansprechpartner"]>) {
    setF({ ansprechpartner: { ...f.ansprechpartner, ...patch } });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Darlehen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Kreditgeber / Bank">
            <Input
              value={f.bank}
              onChange={(e) => setF({ bank: e.target.value })}
            />
          </Field>
          <FieldGrid>
            <Field label="Darlehenssumme (€)">
              <NumberInput
                value={f.darlehenssumme}
                onValueChange={(v) => setF({ darlehenssumme: v })}
              />
            </Field>
            <Field label="Aktuelle Restschuld (€)">
              <NumberInput
                value={f.restschuld}
                onValueChange={(v) => setF({ restschuld: v })}
              />
            </Field>
            <Field label="Zins (%)">
              <NumberInput
                value={f.zins}
                onValueChange={(v) => setF({ zins: v })}
              />
            </Field>
            <Field label="Tilgung (%)">
              <NumberInput
                value={f.tilgung}
                onValueChange={(v) => setF({ tilgung: v })}
              />
            </Field>
            <Field label="Laufzeit (Jahre)">
              <NumberInput
                value={f.laufzeitJahre}
                onValueChange={(v) => setF({ laufzeitJahre: v })}
              />
            </Field>
            <Field label="Kreditvertragsnummer">
              <Input
                value={f.kreditvertragsnummer}
                onChange={(e) => setF({ kreditvertragsnummer: e.target.value })}
              />
            </Field>
          </FieldGrid>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ansprechpartner</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FieldGrid>
            <Field label="Name">
              <Input
                value={f.ansprechpartner.name}
                onChange={(e) => setAnsprech({ name: e.target.value })}
              />
            </Field>
            <Field label="Telefon">
              <Input
                type="tel"
                value={f.ansprechpartner.telefon}
                onChange={(e) => setAnsprech({ telefon: e.target.value })}
              />
            </Field>
            <Field label="E-Mail" className="sm:col-span-2">
              <Input
                type="email"
                value={f.ansprechpartner.email}
                onChange={(e) => setAnsprech({ email: e.target.value })}
              />
            </Field>
          </FieldGrid>

          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
            <MailButton
              email={f.ansprechpartner.email}
              kreditvertragsnummer={f.kreditvertragsnummer}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * „E-Mail an Ansprechpartner": öffnet einen mailto-Link, dessen Betreff
 * automatisch die Kreditvertragsnummer enthält. Fehlt die Nummer, ist der
 * Button deaktiviert und ein Hinweis erscheint.
 */
function MailButton({
  email,
  kreditvertragsnummer,
}: {
  email: string;
  kreditvertragsnummer: string;
}) {
  const nummer = kreditvertragsnummer.trim();
  const classes =
    "inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50";

  if (!nummer) {
    return (
      <>
        <button type="button" className={classes} disabled>
          <Mail className="h-4 w-4" /> E-Mail an Ansprechpartner
        </button>
        <p className="text-xs text-muted-foreground">
          Ohne Kreditvertragsnummer ist der E-Mail-Button deaktiviert – der
          Betreff soll die Nummer enthalten.
        </p>
      </>
    );
  }

  const href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(
    `Darlehen Nr. ${nummer}`
  )}`;

  return (
    <a href={href} className={classes}>
      <Mail className="h-4 w-4" /> E-Mail an Ansprechpartner
    </a>
  );
}
