"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { attempt, type ActionResult } from "@/lib/action-result";

/** Los creativos se producen por tandas: el batch es la unidad de prueba. */
async function createBatchImpl(clientId: string, name: string): Promise<string> {
  const user = await requireUser();

  const trimmed = name.trim();
  if (!trimmed) throw new Error("Ponle nombre al batch.");
  if (trimmed.length > 80) throw new Error("Máximo 80 caracteres.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("batches")
    .insert({ client_id: clientId, name: trimmed, created_by: user.id })
    .select("id")
    .single();

  if (error) {
    throw new Error(
      error.code === "23505"
        ? `Ya existe un batch llamado "${trimmed}" en este cliente.`
        : error.message,
    );
  }

  revalidatePath("/", "layout");
  return data.id as string;
}

async function listBatchesImpl(
  clientId: string,
): Promise<{ id: string; name: string }[]> {
  await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("batches")
    .select("id, name")
    .eq("client_id", clientId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  return (data ?? []) as { id: string; name: string }[];
}

export type BatchNamingInput = {
  campaignCode: string | null;
  adsetCode: string | null;
  campaignLabel: string | null;
  adsetLabel: string | null;
  adLabel: string | null;
};

/** Nomenclatura de Meta del batch. Un batch es un adset. */
async function setBatchNamingImpl(
  batchId: string,
  input: BatchNamingInput,
): Promise<void> {
  await requireUser();

  const clean = (value: string | null) => value?.trim() || null;
  const code = clean(input.campaignCode);
  const adset = clean(input.adsetCode);

  // Sin corchetes: los pone la app al componer, y si vinieran aqui saldrian
  // dobles.
  if (code && /[\[\]]/.test(code)) throw new Error("El código de campaña va sin corchetes.");
  if (adset && /[\[\]]/.test(adset)) throw new Error("El código de ad set va sin corchetes.");

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("batches")
    .update(
      {
        campaign_code: code,
        adset_code: adset,
        campaign_label: clean(input.campaignLabel),
        adset_label: clean(input.adsetLabel),
        ad_label: clean(input.adLabel),
      },
      { count: "exact" },
    )
    .eq("id", batchId);

  if (error) throw new Error(error.message);
  if (!count) throw new Error("Solo quien creó el batch o un admin puede editarlo.");

  revalidatePath("/", "layout");
}

/**
 * Los ANUNCIOS del batch en orden estable, para numerarlos.
 *
 * Excluye variantes a proposito: un par de estaticos (1:1 + 9:16) es un solo
 * anuncio en Meta, y contarlo dos veces correria el consecutivo de todos los
 * demas.
 */
async function getBatchCreativesImpl(
  batchId: string,
): Promise<{ id: string; displayName: string }[]> {
  await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("creatives")
    .select("id, display_name")
    .eq("batch_id", batchId)
    .is("parent_id", null)
    .is("archived_at", null)
    .order("created_at", { ascending: true });

  return (data ?? []).map((row) => ({
    id: row.id as string,
    displayName: row.display_name as string,
  }));
}

async function getBatchNamingImpl(batchId: string): Promise<BatchNamingInput & { name: string }> {
  await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("batches")
    .select("name, campaign_code, adset_code, campaign_label, adset_label, ad_label")
    .eq("id", batchId)
    .single();

  return {
    name: (data?.name as string) ?? "",
    campaignCode: (data?.campaign_code as string) ?? null,
    adsetCode: (data?.adset_code as string) ?? null,
    campaignLabel: (data?.campaign_label as string) ?? null,
    adsetLabel: (data?.adset_label as string) ?? null,
    adLabel: (data?.ad_label as string) ?? null,
  };
}

/**
 * Mueve creativos ya subidos a un batch (o los saca, con batchId null).
 *
 * Pasa por la funcion assign_creatives_to_batch y no por un update directo
 * porque la policy de creatives solo deja al que subio el archivo: sin esto,
 * copy no podria agrupar lo que subio diseño.
 */
async function assignCreativesToBatchImpl(
  creativeIds: string[],
  batchId: string | null,
): Promise<number> {
  await requireUser();
  if (creativeIds.length === 0) return 0;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("assign_creatives_to_batch", {
    p_ids: creativeIds,
    p_batch: batchId,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/", "layout");
  return (data as number) ?? 0;
}

// ---- Acciones expuestas al navegador ----
// Regresan el error en vez de lanzarlo: en produccion Next oculta el mensaje de
// lo que se lanza. Ver src/lib/action-result.ts.

export async function assignCreativesToBatch(
  ...args: Parameters<typeof assignCreativesToBatchImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof assignCreativesToBatchImpl>>>> {
  return attempt(() => assignCreativesToBatchImpl(...args));
}

export async function createBatch(
  ...args: Parameters<typeof createBatchImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof createBatchImpl>>>> {
  return attempt(() => createBatchImpl(...args));
}

export async function listBatches(
  ...args: Parameters<typeof listBatchesImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof listBatchesImpl>>>> {
  return attempt(() => listBatchesImpl(...args));
}

export async function getBatchCreatives(
  ...args: Parameters<typeof getBatchCreativesImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof getBatchCreativesImpl>>>> {
  return attempt(() => getBatchCreativesImpl(...args));
}

export async function getBatchNaming(
  ...args: Parameters<typeof getBatchNamingImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof getBatchNamingImpl>>>> {
  return attempt(() => getBatchNamingImpl(...args));
}

export async function setBatchNaming(
  ...args: Parameters<typeof setBatchNamingImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof setBatchNamingImpl>>>> {
  return attempt(() => setBatchNamingImpl(...args));
}
