import type { TabProps } from "../WohnungDetail";
import type { Miete } from "@/types";
import { formatEuro } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NumberInput } from "@/components/NumberInput";
import { Field, FieldGrid } from "@/components/Field";

export function MieteTab({ wohnung, update }: TabProps) {
  const miete = wohnung.miete;

  function setMiete(patch: Partial<Miete>) {
    update({ miete: { ...miete, ...patch } });
  }

  const warm = (miete.kaltmiete ?? 0) + (miete.betriebskosten ?? 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Monatliche Miete</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <FieldGrid>
            <Field label="Kaltmiete (€ / Monat)">
              <NumberInput
                value={miete.kaltmiete}
                onValueChange={(v) => setMiete({ kaltmiete: v })}
              />
            </Field>
            <Field label="Betriebskostenvorauszahlung (€ / Monat)">
              <NumberInput
                value={miete.betriebskosten}
                onValueChange={(v) => setMiete({ betriebskosten: v })}
              />
            </Field>
          </FieldGrid>

          <div className="rounded-lg bg-muted p-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <Betrag label="Kaltmiete" value={miete.kaltmiete} />
              <Betrag label="Nebenkosten (VZ)" value={miete.betriebskosten} />
              <Betrag label="Warmmiete" value={warm} betont />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Jahresübersicht</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <Betrag label="Kaltmiete / Jahr" value={(miete.kaltmiete ?? 0) * 12} />
            <Betrag
              label="Nebenkosten / Jahr"
              value={(miete.betriebskosten ?? 0) * 12}
            />
            <Betrag label="Warmmiete / Jahr" value={warm * 12} betont />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Betrag({
  label,
  value,
  betont,
}: {
  label: string;
  value: number | null;
  betont?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={
          betont
            ? "text-xl font-semibold text-primary"
            : "text-lg font-medium"
        }
      >
        {formatEuro(value)}
      </p>
    </div>
  );
}
