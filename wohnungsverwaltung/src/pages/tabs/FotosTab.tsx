import * as React from "react";
import { Camera, Trash2, Upload } from "lucide-react";
import type { Dokument } from "@/types";
import type { TabProps } from "../WohnungDetail";
import { repository } from "@/data/repository";
import { uid } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Fotoalbum der Wohnung: Grundfotos hochladen oder mit der Kamera aufnehmen.
 * Bilder werden als Blob in IndexedDB gespeichert (Kategorie "foto").
 */
export function FotosTab({ wohnung }: TabProps) {
  const [fotos, setFotos] = React.useState<Dokument[]>([]);
  const [urls, setUrls] = React.useState<Record<string, string>>({});
  const [gross, setGross] = React.useState<string | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const cameraInput = React.useRef<HTMLInputElement>(null);

  const laden = React.useCallback(async () => {
    const alle = await repository.getDokumente(wohnung.id, "foto");
    setFotos(alle);
  }, [wohnung.id]);

  React.useEffect(() => {
    laden();
  }, [laden]);

  React.useEffect(() => {
    const map: Record<string, string> = {};
    fotos.forEach((f) => (map[f.id] = URL.createObjectURL(f.blob)));
    setUrls(map);
    return () => Object.values(map).forEach((u) => URL.revokeObjectURL(u));
  }, [fotos]);

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      await repository.saveDokument({
        id: uid(),
        wohnungId: wohnung.id,
        kategorie: "foto",
        titel: file.name || "Foto",
        datum: new Date().toISOString().slice(0, 10),
        mimeType: file.type,
        size: file.size,
        blob: file,
        createdAt: Date.now(),
      });
    }
    await laden();
    if (fileInput.current) fileInput.current.value = "";
    if (cameraInput.current) cameraInput.current.value = "";
  }

  async function loeschen(id: string) {
    await repository.deleteDokument(id);
    await laden();
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Fotoalbum</CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
            <Upload /> Hochladen
          </Button>
          <Button variant="outline" size="sm" onClick={() => cameraInput.current?.click()}>
            <Camera /> Aufnehmen
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

        {fotos.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Noch keine Fotos. Lade Grundfotos hoch oder nimm sie mit der Kamera auf.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {fotos.map((f) => (
              <div key={f.id} className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted">
                <img
                  src={urls[f.id]}
                  alt={f.titel}
                  className="h-full w-full cursor-zoom-in object-cover"
                  onClick={() => setGross(urls[f.id])}
                />
                <button
                  onClick={() => loeschen(f.id)}
                  className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-md bg-black/50 text-white opacity-0 transition-opacity hover:bg-destructive group-hover:opacity-100"
                  aria-label="Foto löschen"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {gross && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
            onClick={() => setGross(null)}
          >
            <img src={gross} alt="Vorschau" className="max-h-full max-w-full rounded-lg" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
