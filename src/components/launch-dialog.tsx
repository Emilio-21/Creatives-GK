"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createLaunch, updateLaunch, type LaunchInput } from "@/app/(app)/creative/launch-actions";
import type { LaunchRow } from "@/lib/launches";

type Draft = {
  launchedAt: string;
  endedAt: string;
  platform: string;
  campaignName: string;
  adsetName: string;
  metaCampaignId: string;
  metaAdsetId: string;
  metaAdId: string;
  notes: string;
};

function emptyDraft(): Draft {
  return {
    launchedAt: new Date().toISOString().slice(0, 10),
    endedAt: "",
    platform: "meta",
    campaignName: "",
    adsetName: "",
    metaCampaignId: "",
    metaAdsetId: "",
    metaAdId: "",
    notes: "",
  };
}

function draftFrom(launch: LaunchRow): Draft {
  const text = (value: string | number | null) => (value === null ? "" : String(value));
  return {
    launchedAt: launch.launched_at,
    endedAt: launch.ended_at ?? "",
    platform: launch.platform,
    campaignName: text(launch.campaign_name),
    adsetName: text(launch.adset_name),
    metaCampaignId: text(launch.meta_campaign_id),
    metaAdsetId: text(launch.meta_adset_id),
    metaAdId: text(launch.meta_ad_id),
    notes: text(launch.notes),
  };
}

const textOrNull = (value: string): string | null => value.trim() || null;

export function LaunchDialog({
  creativeId,
  launch,
  trigger,
}: {
  creativeId: string;
  launch?: LaunchRow;
  trigger: React.ReactElement;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(launch ? draftFrom(launch) : emptyDraft());
  const [pending, startTransition] = useTransition();

  const set = (key: keyof Draft) => (value: string) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  function submit() {
    const input: LaunchInput = {
      creativeId,
      launchedAt: draft.launchedAt,
      endedAt: textOrNull(draft.endedAt),
      platform: draft.platform || "meta",
      campaignName: textOrNull(draft.campaignName),
      adsetName: textOrNull(draft.adsetName),
      metaCampaignId: textOrNull(draft.metaCampaignId),
      metaAdsetId: textOrNull(draft.metaAdsetId),
      metaAdId: textOrNull(draft.metaAdId),
      spend: null,
      impressions: null,
      reach: null,
      clicks: null,
      results: null,
      resultType: null,
      notes: textOrNull(draft.notes),
    };

    startTransition(async () => {
      try {
        if (launch) await updateLaunch(launch.id, input);
        else await createLaunch(input);
        toast.success(launch ? "Lanzamiento actualizado" : "Lanzamiento registrado");
        setOpen(false);
        if (!launch) setDraft(emptyDraft());
        router.refresh();
      } catch (error) {
        toast.error((error as Error).message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{launch ? "Editar lanzamiento" : "Registrar lanzamiento"}</DialogTitle>
          <DialogDescription>
            Solo el periodo y de qué campaña salió. Las métricas las jala el sync.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Inicio *">
              <Input
                type="date"
                value={draft.launchedAt}
                onChange={(event) => set("launchedAt")(event.target.value)}
              />
            </Field>
            <Field label="Fin">
              <Input
                type="date"
                value={draft.endedAt}
                onChange={(event) => set("endedAt")(event.target.value)}
              />
            </Field>
            <Field label="Campaña">
              <Input
                value={draft.campaignName}
                onChange={(event) => set("campaignName")(event.target.value)}
              />
            </Field>
            <Field label="Ad set">
              <Input
                value={draft.adsetName}
                onChange={(event) => set("adsetName")(event.target.value)}
              />
            </Field>
            <Field label="meta_ad_id">
              <Input
                value={draft.metaAdId}
                onChange={(event) => set("metaAdId")(event.target.value)}
                placeholder="Para el sync automático más adelante"
              />
            </Field>
            <Field label="meta_adset_id">
              <Input
                value={draft.metaAdsetId}
                onChange={(event) => set("metaAdsetId")(event.target.value)}
              />
            </Field>
          </div>

          <p className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            Gasto, impresiones, clics y resultados los trae el sync de Meta. Solo hace
            falta que el nombre del anuncio lleve el código del creativo.
          </p>

          <Field label="Notas">
            <Textarea
              rows={2}
              value={draft.notes}
              onChange={(event) => set("notes")(event.target.value)}
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Guardando…" : launch ? "Guardar" : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

