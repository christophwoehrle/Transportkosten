import type { TabProps } from "../WohnungDetail";
import { Card, CardContent } from "@/components/ui/card";
import { DocumentSection } from "@/components/DocumentSection";

export function GrundbuchTab({ wohnung }: TabProps) {
  return (
    <Card>
      <CardContent className="p-6">
        <DocumentSection
          wohnungId={wohnung.id}
          kategorien={["notarvertrag", "grundbuch", "sonstiges"]}
          standardKategorie="notarvertrag"
          titel="Grundbuch & Notar"
          beschreibung="Notarverträge, Grundbuchauszüge und weitere Unterlagen hochladen oder mit der Kamera scannen. PDF und Bilder werden lokal gespeichert."
        />
      </CardContent>
    </Card>
  );
}
