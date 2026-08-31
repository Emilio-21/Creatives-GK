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
import { createLaunch, updateLaunch, type LaunchInput } from "@/app/creative/launch-actions";
import { derive, formatMoney, formatPercent } from "@/lib/metrics";
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
  spend: string;
  impressions: string;
  reach: string;
  clicks: string;
  results: string;
  resultType: string;
  notes: string;
};

const RESULT_TYPES = ["lead", "purchase", "lpv", "message", "otro"];

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
    spend: "",
    impressions: "",
    reach: "",
    clicks: "",
    results: "",
    resultType: "",
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
    spend: text(launch.spend),
    impressions: text(launch.impressions),
    reach: text(launch.reach),
    clicks: text(launch.clicks),
    results: text(launch.results),
    resultType: text(launch.result_type),
    notes: text(launch.notes),
  };
}

const numberOrNull = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};
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

  // CTR/CPM/CPC/CPA en vivo, con las mismas formulas que la vista.
  const derived = derive({
    spend: numberOrNull(draft.spend),
    impressions: numberOrNull(draft.impressions),
    clicks: numberOrNull(draft.clicks),
    results: numberOrNull(draft.results),
  });

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
      spend: numberOrNull(draft.spend),
      impressions: numberOrNull(draft.impressions),
      reach: numberOrNull(draft.reach),
      clicks: numberOrNull(draft.clicks),
      results: numberOrNull(draft.results),
      resultType: textOrNull(draft.resultType),
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
            Solo números base. CTR, CPM, CPC y CPA se calculan solos.
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

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Gasto">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={draft.spend}
                onChange={(event) => set("spend")(event.target.value)}
              />
            </Field>
            <Field label="Impresiones">
              <Input
                type="number"
                min="0"
                value={draft.impressions}
                onChange={(event) => set("impressions")(event.target.value)}
              />
            </Field>
            <Field label="Alcance">
              <Input
                type="number"
                min="0"
                value={draft.reach}
                onChange={(event) => set("reach")(event.target.value)}
              />
            </Field>
            <Field label="Clics">
              <Input
                type="number"
                min="0"
                value={draft.clicks}
                onChange={(event) => set("clicks")(event.target.value)}
              />
            </Field>
            <Field label="Resultados">
              <Input
                type="number"
                min="0"
                value={draft.results}
                onChange={(event) => set("results")(event.target.value)}
              />
            </Field>
            <Field label="Tipo de resultado">
              <select
                value={draft.resultType}
                onChange={(event) => set("resultType")(event.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <option value="">—</option>
                {RESULT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground sm:grid-cols-4">
            <Derived label="CTR" value={formatPercent(derived.ctr)} />
            <Derived label="CPM" value={formatMoney(derived.cpm)} />
            <Derived label="CPC" value={formatMoney(derived.cpc)} />
            <Derived label="CPA" value={formatMoney(derived.cpa)} />
          </div>

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

function Derived({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide">{label}</p>
      <p className="tabular-nums">{value}</p>
    </div>
  );
}
