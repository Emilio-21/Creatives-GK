"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { attempt, type ActionResult } from "@/lib/action-result";

export type LaunchInput = {
  creativeId: string;
  launchedAt: string;
  endedAt: string | null;
  platform: string;
  campaignName: string | null;
  adsetName: string | null;
  metaCampaignId: string | null;
  metaAdsetId: string | null;
  metaAdId: string | null;
  spend: number | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  results: number | null;
  resultType: string | null;
  notes: string | null;
};

function validate(input: LaunchInput) {
  if (!input.launchedAt) throw new Error("La fecha de inicio es obligatoria.");
  if (input.endedAt && input.endedAt < input.launchedAt) {
    throw new Error("La fecha de fin no puede ser anterior a la de inicio.");
  }
  for (const [label, value] of [
    ["gasto", input.spend],
    ["impresiones", input.impressions],
    ["alcance", input.reach],
    ["clics", input.clicks],
    ["resultados", input.results],
  ] as const) {
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      throw new Error(`El valor de ${label} no es válido.`);
    }
  }
}

/**
 * Un creativo tiene muchos lanzamientos (§3.3): esto siempre inserta, nunca
 * pisa el anterior. `publicado` sale de aqui, no es un campo editable.
 */
async function createLaunchImpl(input: LaunchInput): Promise<void> {
  const user = await requireUser();
  validate(input);

  const supabase = await createClient();
  const { error } = await supabase.from("launches").insert({
    creative_id: input.creativeId,
    launched_at: input.launchedAt,
    ended_at: input.endedAt,
    platform: input.platform || "meta",
    campaign_name: input.campaignName,
    adset_name: input.adsetName,
    meta_campaign_id: input.metaCampaignId,
    meta_adset_id: input.metaAdsetId,
    meta_ad_id: input.metaAdId,
    spend: input.spend,
    impressions: input.impressions,
    reach: input.reach,
    clicks: input.clicks,
    results: input.results,
    result_type: input.resultType,
    metrics_source: "manual",
    metrics_updated_at: new Date().toISOString(),
    notes: input.notes,
    created_by: user.id,
  });

  if (error) throw new Error(`No se pudo registrar: ${error.message}`);

  revalidatePath(`/creative/${input.creativeId}`);
  revalidatePath("/", "layout");
}

async function updateLaunchImpl(launchId: string, input: LaunchInput): Promise<void> {
  await requireUser();
  validate(input);

  const supabase = await createClient();
  const { error } = await supabase
    .from("launches")
    .update({
      launched_at: input.launchedAt,
      ended_at: input.endedAt,
      platform: input.platform || "meta",
      campaign_name: input.campaignName,
      adset_name: input.adsetName,
      meta_campaign_id: input.metaCampaignId,
      meta_adset_id: input.metaAdsetId,
      meta_ad_id: input.metaAdId,
      spend: input.spend,
      impressions: input.impressions,
      reach: input.reach,
      clicks: input.clicks,
      results: input.results,
      result_type: input.resultType,
      metrics_updated_at: new Date().toISOString(),
      notes: input.notes,
    })
    .eq("id", launchId);

  if (error) throw new Error(`No se pudo actualizar: ${error.message}`);

  revalidatePath(`/creative/${input.creativeId}`);
  revalidatePath("/", "layout");
}

/** Solo admin, por RLS. Un member recibe 0 filas afectadas. */
async function deleteLaunchImpl(launchId: string, creativeId: string): Promise<void> {
  await requireUser();

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("launches")
    .delete({ count: "exact" })
    .eq("id", launchId);

  if (error) throw new Error(error.message);
  if (!count) throw new Error("Solo un admin puede borrar lanzamientos.");

  revalidatePath(`/creative/${creativeId}`);
  revalidatePath("/", "layout");
}

// ---- Acciones expuestas al navegador ----
// Regresan el error en vez de lanzarlo: en produccion Next oculta el mensaje de
// lo que se lanza. Ver src/lib/action-result.ts.

export async function createLaunch(
  ...args: Parameters<typeof createLaunchImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof createLaunchImpl>>>> {
  return attempt(() => createLaunchImpl(...args));
}

export async function updateLaunch(
  ...args: Parameters<typeof updateLaunchImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof updateLaunchImpl>>>> {
  return attempt(() => updateLaunchImpl(...args));
}

export async function deleteLaunch(
  ...args: Parameters<typeof deleteLaunchImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof deleteLaunchImpl>>>> {
  return attempt(() => deleteLaunchImpl(...args));
}
