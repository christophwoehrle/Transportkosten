import type { TabProps } from "../WohnungDetail";
import { AUSSTATTUNG_OPTIONEN, HEIZUNGSARTEN, type Heizungsart } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { NumberInput } from "@/components/NumberInput";
import { Field, FieldGrid } from "@/components/Field";

export function GrunddatenTab({ wohnung, update }: TabProps) {
  function toggleFeature(feature: string) {
    const has = wohnung.ausstattungFeatures.includes(feature);
    update({
      ausstattungFeatures: has
        ? wohnung.ausstattungFeatures.filter((f) => f !== feature)
        : [...wohnung.ausstattungFeatures, feature],
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Objekt & Adresse</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Bezeichnung / Name">
            <Input
              value={wohnung.bezeichnung}
              onChange={(e) => update({ bezeichnung: e.target.value })}
              placeholder="z. B. Altbau Schwabing"
            />
          </Field>
          <Field label="Straße & Hausnummer">
            <Input
              value={wohnung.strasse}
              onChange={(e) => update({ strasse: e.target.value })}
            />
          </Field>
          <FieldGrid>
            <Field label="PLZ">
              <Input
                value={wohnung.plz}
                onChange={(e) => update({ plz: e.target.value })}
              />
            </Field>
            <Field label="Ort">
              <Input
                value={wohnung.ort}
                onChange={(e) => update({ ort: e.target.value })}
              />
            </Field>
          </FieldGrid>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Merkmale</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FieldGrid>
            <Field label="Wohnfläche (m²)">
              <NumberInput
                value={wohnung.wohnflaeche}
                onValueChange={(v) => update({ wohnflaeche: v })}
              />
            </Field>
            <Field label="Zimmeranzahl">
              <NumberInput
                value={wohnung.zimmer}
                onValueChange={(v) => update({ zimmer: v })}
              />
            </Field>
            <Field label="Baujahr">
              <NumberInput
                value={wohnung.baujahr}
                onValueChange={(v) => update({ baujahr: v })}
                placeholder="z. B. 1998"
              />
            </Field>
            <Field label="Geschoss / Etage">
              <Input
                value={wohnung.geschoss}
                onChange={(e) => update({ geschoss: e.target.value })}
                placeholder="z. B. 2. OG"
              />
            </Field>
            <Field label="Heizungsart">
              <Select
                value={wohnung.heizungsart}
                onChange={(e) =>
                  update({ heizungsart: e.target.value as Heizungsart })
                }
              >
                {HEIZUNGSARTEN.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Balkon / Terrasse (Anzahl)">
              <NumberInput
                value={wohnung.balkonTerrasse.anzahl}
                onValueChange={(v) =>
                  update({
                    balkonTerrasse: {
                      anzahl: v,
                      vorhanden: (v ?? 0) > 0,
                    },
                  })
                }
                placeholder="0 = keiner"
              />
            </Field>
          </FieldGrid>

          <div className="space-y-2">
            <p className="text-sm font-medium">Ausstattung</p>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {AUSSTATTUNG_OPTIONEN.map((opt) => {
                const checked = wohnung.ausstattungFeatures.includes(opt);
                return (
                  <label
                    key={opt}
                    className="flex cursor-pointer items-center gap-2 text-sm"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleFeature(opt)}
                      aria-label={opt}
                    />
                    {opt}
                  </label>
                );
              })}
            </div>
          </div>

          <Field label="Weitere Ausstattung (Freitext)">
            <Textarea
              value={wohnung.ausstattungText}
              onChange={(e) => update({ ausstattungText: e.target.value })}
              placeholder="Besonderheiten, Zustand, Sanierungen …"
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kauf</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGrid>
            <Field label="Kaufpreis (€)">
              <NumberInput
                value={wohnung.kaufpreis}
                onValueChange={(v) => update({ kaufpreis: v })}
              />
            </Field>
            <Field
              label="Kaufdatum (notarieller Vertrag)"
              hint="Basis für den Zeitstrahl / die 10-Jahres-Frist."
            >
              <Input
                type="date"
                value={wohnung.kaufdatum}
                onChange={(e) => update({ kaufdatum: e.target.value })}
              />
            </Field>
          </FieldGrid>
        </CardContent>
      </Card>
    </div>
  );
}
