"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** Los creativos se producen por tandas: el batch es la unidad de prueba. */
export async function createBatch(clientId: string, name: string): Promise<string> {
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

export async function listBatches(
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

export async function reopenBatch(batchId: string): Promise<void> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("batches")
    .update({ completed_at: null })
    .eq("id", batchId);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

export async function renameBatch(batchId: string, name: string): Promise<void> {
  await requireUser();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("El nombre no puede ir vacío.");

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("batches")
    .update({ name: trimmed }, { count: "exact" })
    .eq("id", batchId);

  if (error) throw new Error(error.message);
  if (!count) throw new Error("Solo quien creó el batch o un admin puede renombrarlo.");

  revalidatePath("/", "layout");
}

export type BatchNamingInput = {
  campaignCode: string | null;
  adsetCode: string | null;
  campaignLabel: string | null;
  adsetLabel: string | null;
  adLabel: string | null;
};

/** Nomenclatura de Meta del batch. Un batch es un adset. */
export async function setBatchNaming(
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

/** Los creativos del batch en orden estable, para numerar los anuncios. */
export async function getBatchCreatives(
  batchId: string,
): Promise<{ id: string; displayName: string }[]> {
  await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("creatives")
    .select("id, display_name")
    .eq("batch_id", batchId)
    .is("archived_at", null)
    .order("created_at", { ascending: true });

  return (data ?? []).map((row) => ({
    id: row.id as string,
    displayName: row.display_name as string,
  }));
}

export async function getBatchNaming(batchId: string): Promise<BatchNamingInput & { name: string }> {
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
