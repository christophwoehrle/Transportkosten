import * as React from "react";
import {
  Camera,
  Download,
  FileText,
  Image as ImageIcon,
  Trash2,
  Upload,
} from "lucide-react";
import type { Dokument, DokumentKategorie } from "@/types";
import { DOKUMENT_KATEGORIEN } from "@/types";
import { repository } from "@/data/repository";
import { formatDate, uid } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  wohnungId: string;
  /** Auf diese Kategorien beschränken (sonst alle). */
  kategorien: DokumentKategorie[];
  /** Vorausgewählte Kategorie für neue Uploads. */
  standardKategorie: DokumentKategorie;
  titel: string;
  beschreibung?: string;
}

/**
 * Wiederverwendbarer Datei-Upload + Kamera-Scan mit Vorschau, Titel, Datum
 * sowie Download/Löschen. Dokumente werden als Blob über das Repository
 * gespeichert und bleiben nach Reload erhalten.
 */
export function DocumentSection({
  wohnungId,
  kategorien,
  standardKategorie,
  titel,
  beschreibung,
}: Props) {
  const [dokumente, setDokumente] = React.useState<Dokument[]>([]);
  const [kategorie, setKategorie] =
    React.useState<DokumentKategorie>(standardKategorie);
  const [previews, setPreviews] = React.useState<Record<string, string>>({});
  const fileInput = React.useRef<HTMLInputElement>(null);
  const cameraInput = React.useRef<HTMLInputElement>(null);

  const laden = React.useCallback(async () => {
    const alle = await repository.getDokumente(wohnungId);
    const gefiltert = alle.filter((d) => kategorien.includes(d.kategorie));
    setDokumente(gefiltert);
  }, [wohnungId, kategorien]);

  React.useEffect(() => {
    laden();
  }, [laden]);

  // Blob-URLs für Bildvorschauen erzeugen und wieder freigeben.
  React.useEffect(() => {
    const urls: Record<string, string> = {};
    for (const d of dokumente) {
      if (d.mimeType.startsWith("image/")) {
        urls[d.id] = URL.createObjectURL(d.blob);
      }
    }
    setPreviews(urls);
    return () => Object.values(urls).forEach((u) => URL.revokeObjectURL(u));
  }, [dokumente]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      const dok: Dokument = {
        id: uid(),
        wohnungId,
        kategorie,
        titel: file.name || "Unbenannt",
        datum: new Date().toISOString().slice(0, 10),
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        blob: file,
        createdAt: Date.now(),
      };
      await repository.saveDokument(dok);
    }
    await laden();
    if (fileInput.current) fileInput.current.value = "";
    if (cameraInput.current) cameraInput.current.value = "";
  }

  async function loeschen(id: string) {
    await repository.deleteDokument(id);
    await laden();
  }

  function download(dok: Dokument) {
    const url = URL.createObjectURL(dok.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = dok.titel;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function titelAendern(dok: Dokument, neuerTitel: string) {
    await repository.saveDokument({ ...dok, titel: neuerTitel });
    await laden();
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">{titel}</h3>
        {beschreibung && (
          <p className="mt-1 text-sm text-muted-foreground">{beschreibung}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {kategorien.length > 1 && (
          <select
            value={kategorie}
            onChange={(e) =>
              setKategorie(e.target.value as DokumentKategorie)
            }
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            aria-label="Dokumenttyp"
          >
            {kategorien.map((k) => (
              <option key={k} value={k}>
                {DOKUMENT_KATEGORIEN[k]}
              </option>
            ))}
          </select>
        )}

        <Button
          type="button"
          variant="outline"
          onClick={() => fileInput.current?.click()}
        >
          <Upload /> Datei hochladen
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => cameraInput.current?.click()}
        >
          <Camera /> Scannen
        </Button>

        {/* Datei-Upload: Bilder + PDF */}
        <input
          ref={fileInput}
          type="file"
          accept="image/*,application/pdf"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        {/* Kamera-Scan (mobil): öffnet direkt die Kamera */}
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {dokumente.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Noch keine Dokumente. Lade eine Datei hoch oder scanne sie mit der
          Kamera.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {dokumente.map((dok) => (
            <Card key={dok.id}>
              <CardContent className="flex gap-3 p-3">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                  {previews[dok.id] ? (
                    <img
                      src={previews[dok.id]}
                      alt={dok.titel}
                      className="h-full w-full object-cover"
                    />
                  ) : dok.mimeType === "application/pdf" ? (
                    <FileText className="h-7 w-7 text-muted-foreground" />
                  ) : (
                    <ImageIcon className="h-7 w-7 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <input
                    value={dok.titel}
                    onChange={(e) => titelAendern(dok, e.target.value)}
                    className="w-full truncate rounded border border-transparent bg-transparent text-sm font-medium hover:border-input focus:border-input focus:outline-none"
                  />
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {DOKUMENT_KATEGORIEN[dok.kategorie]} · {formatDate(dok.datum)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {(dok.size / 1024).toFixed(0)} KB
                  </p>
                  <div className="mt-2 flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => download(dok)}
                    >
                      <Download /> Download
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => loeschen(dok.id)}
                    >
                      <Trash2 /> Löschen
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
