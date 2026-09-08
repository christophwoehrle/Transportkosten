import * as React from "react";
import { useNavigate } from "react-router-dom";
import { Building2, MapPin, Plus, Search, Trash2 } from "lucide-react";
import type { Wohnung } from "@/types";
import { createLeereWohnung, repository } from "@/data/repository";
import { berechneFrist, formatEuro } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/Field";

const STATUS_VARIANT = {
  gruen: "success" as const,
  gelb: "warning" as const,
  rot: "danger" as const,
  unbekannt: "secondary" as const,
};

export function WohnungenList() {
  const navigate = useNavigate();
  const [wohnungen, setWohnungen] = React.useState<Wohnung[] | null>(null);
  const [suche, setSuche] = React.useState("");
  const [neuOffen, setNeuOffen] = React.useState(false);
  const [neuName, setNeuName] = React.useState("");
  const [loeschKandidat, setLoeschKandidat] = React.useState<Wohnung | null>(
    null
  );

  const laden = React.useCallback(() => {
    repository.getWohnungen().then(setWohnungen);
  }, []);

  React.useEffect(() => laden(), [laden]);

  const gefiltert = React.useMemo(() => {
    if (!wohnungen) return [];
    const q = suche.trim().toLowerCase();
    if (!q) return wohnungen;
    return wohnungen.filter((w) =>
      [w.bezeichnung, w.strasse, w.plz, w.ort, w.mieter.name]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [wohnungen, suche]);

  async function anlegen() {
    const w = createLeereWohnung();
    w.bezeichnung = neuName.trim() || "Neue Wohnung";
    await repository.saveWohnung(w);
    setNeuOffen(false);
    setNeuName("");
    navigate(`/wohnungen/${w.id}`);
  }

  async function loeschen() {
    if (!loeschKandidat) return;
    await repository.deleteWohnung(loeschKandidat.id);
    setLoeschKandidat(null);
    laden();
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Wohnungen</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Alle Mietobjekte verwalten.
          </p>
        </div>
        <Button onClick={() => setNeuOffen(true)}>
          <Plus /> Wohnung anlegen
        </Button>
      </header>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          placeholder="Suchen nach Name, Ort, Mieter …"
          className="pl-9"
        />
      </div>

      {!wohnungen ? (
        <p className="text-sm text-muted-foreground">Lädt …</p>
      ) : gefiltert.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Building2 className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">
                {suche ? "Keine Treffer" : "Noch keine Wohnung angelegt"}
              </p>
              <p className="text-sm text-muted-foreground">
                {suche
                  ? "Passe die Suche an."
                  : "Lege deine erste Wohnung an, um zu starten."}
              </p>
            </div>
            {!suche && (
              <Button onClick={() => setNeuOffen(true)}>
                <Plus /> Wohnung anlegen
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {gefiltert.map((w) => {
            const frist = berechneFrist(w.kaufdatum);
            return (
              <Card
                key={w.id}
                className="group cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => navigate(`/wohnungen/${w.id}`)}
              >
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {w.bezeichnung || "Ohne Namen"}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {[w.plz, w.ort].filter(Boolean).join(" ") || "Keine Adresse"}
                      </p>
                    </div>
                    <Badge variant={STATUS_VARIANT[frist.status]}>
                      {frist.status === "gruen"
                        ? "frei"
                        : frist.labelVerbleibend}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Wohnfläche</p>
                      <p>{w.wohnflaeche ? `${w.wohnflaeche} m²` : "–"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Kaltmiete</p>
                      <p>{formatEuro(w.miete.kaltmiete)}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-border pt-3">
                    <p className="truncate text-xs text-muted-foreground">
                      Mieter: {w.mieter.name || "–"}
                    </p>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLoeschKandidat(w);
                      }}
                      aria-label="Löschen"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog: Neue Wohnung */}
      <Dialog open={neuOffen} onOpenChange={setNeuOffen}>
        <DialogContent onClose={() => setNeuOffen(false)}>
          <DialogHeader>
            <DialogTitle>Neue Wohnung anlegen</DialogTitle>
            <DialogDescription>
              Vergib einen Namen. Alle weiteren Daten erfasst du danach in den
              Reitern.
            </DialogDescription>
          </DialogHeader>
          <Field label="Bezeichnung">
            <Input
              value={neuName}
              onChange={(e) => setNeuName(e.target.value)}
              placeholder="z. B. Altbau Schwabing"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && anlegen()}
            />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNeuOffen(false)}>
              Abbrechen
            </Button>
            <Button onClick={anlegen}>Anlegen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Löschen bestätigen */}
      <Dialog
        open={!!loeschKandidat}
        onOpenChange={(o) => !o && setLoeschKandidat(null)}
      >
        <DialogContent onClose={() => setLoeschKandidat(null)}>
          <DialogHeader>
            <DialogTitle>Wohnung löschen?</DialogTitle>
            <DialogDescription>
              „{loeschKandidat?.bezeichnung}" und alle zugehörigen Dokumente
              werden dauerhaft entfernt.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLoeschKandidat(null)}>
              Abbrechen
            </Button>
            <Button variant="destructive" onClick={loeschen}>
              <Trash2 /> Endgültig löschen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
