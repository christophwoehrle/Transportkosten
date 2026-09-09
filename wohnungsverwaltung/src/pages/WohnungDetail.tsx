import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Banknote,
  Check,
  ClipboardList,
  FileText,
  Home,
  Images,
  Landmark,
  LineChart,
  Receipt,
  Users,
  Wallet,
} from "lucide-react";
import type { Wohnung } from "@/types";
import { repository } from "@/data/repository";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GrunddatenTab } from "./tabs/GrunddatenTab";
import { FinanzierungTab } from "./tabs/FinanzierungTab";
import { GrundbuchTab } from "./tabs/GrundbuchTab";
import { MieterTab } from "./tabs/MieterTab";
import { MieteTab } from "./tabs/MieteTab";
import { HausverwaltungTab } from "./tabs/HausverwaltungTab";
import { FotosTab } from "./tabs/FotosTab";
import { ProtokollTab } from "./tabs/ProtokollTab";
import { MieteingangTab } from "./tabs/MieteingangTab";
import { RentabilitaetTab } from "./tabs/RentabilitaetTab";

export interface TabProps {
  wohnung: Wohnung;
  update: (patch: Partial<Wohnung>) => void;
}

const TABS = [
  { key: "grunddaten", label: "Grunddaten", icon: Home },
  { key: "fotos", label: "Fotos", icon: Images },
  { key: "finanzierung", label: "Finanzierung", icon: Banknote },
  { key: "grundbuch", label: "Grundbuch & Notar", icon: Landmark },
  { key: "mieter", label: "Mieter", icon: Users },
  { key: "miete", label: "Miete & Nebenkosten", icon: Receipt },
  { key: "mieteingang", label: "Mieteingang", icon: Wallet },
  { key: "rentabilitaet", label: "Rentabilität", icon: LineChart },
  { key: "hausverwaltung", label: "Hausverwaltung & NK", icon: FileText },
  { key: "protokoll", label: "Protokoll", icon: ClipboardList },
];

export function WohnungDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [wohnung, setWohnung] = React.useState<Wohnung | null>(null);
  const [tab, setTab] = React.useState("grunddaten");
  const [gespeichert, setGespeichert] = React.useState(true);
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (!id) return;
    repository.getWohnung(id).then((w) => {
      if (w) setWohnung(w);
      else navigate("/wohnungen", { replace: true });
    });
  }, [id, navigate]);

  // Änderungen mergen und verzögert (debounced) speichern.
  const update = React.useCallback((patch: Partial<Wohnung>) => {
    setWohnung((prev) => (prev ? { ...prev, ...patch } : prev));
    setGespeichert(false);
  }, []);

  React.useEffect(() => {
    if (!wohnung || gespeichert) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await repository.saveWohnung(wohnung);
      setGespeichert(true);
    }, 500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [wohnung, gespeichert]);

  if (!wohnung) {
    return <p className="text-sm text-muted-foreground">Lädt …</p>;
  }

  const tabProps: TabProps = { wohnung, update };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            to="/wohnungen"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent"
            aria-label="Zurück"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {wohnung.bezeichnung || "Ohne Namen"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {[wohnung.strasse, wohnung.plz, wohnung.ort]
                .filter(Boolean)
                .join(", ") || "Keine Adresse"}
            </p>
          </div>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Check className="h-3.5 w-3.5" />
          {gespeichert ? "Gespeichert" : "Speichert …"}
        </span>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full overflow-x-auto">
          {TABS.map(({ key, label, icon: Icon }) => (
            <TabsTrigger key={key} value={key}>
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="grunddaten">
          <GrunddatenTab {...tabProps} />
        </TabsContent>
        <TabsContent value="fotos">
          <FotosTab {...tabProps} />
        </TabsContent>
        <TabsContent value="finanzierung">
          <FinanzierungTab {...tabProps} />
        </TabsContent>
        <TabsContent value="grundbuch">
          <GrundbuchTab {...tabProps} />
        </TabsContent>
        <TabsContent value="mieter">
          <MieterTab {...tabProps} />
        </TabsContent>
        <TabsContent value="miete">
          <MieteTab {...tabProps} />
        </TabsContent>
        <TabsContent value="mieteingang">
          <MieteingangTab {...tabProps} />
        </TabsContent>
        <TabsContent value="rentabilitaet">
          <RentabilitaetTab {...tabProps} />
        </TabsContent>
        <TabsContent value="hausverwaltung">
          <HausverwaltungTab {...tabProps} />
        </TabsContent>
        <TabsContent value="protokoll">
          <ProtokollTab {...tabProps} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
