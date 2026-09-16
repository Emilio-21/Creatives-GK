"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Junta varios archivos bajo un solo anuncio.
 *
 * El principal se queda con el codigo [GK-xxxx], con los lanzamientos y con su
 * lugar en el tablero; los demas pasan a ser formatos suyos.
 */
export async function groupAsAd(parentId: string, variantIds: string[]): Promise<number> {
  await requireUser();
  const otros = variantIds.filter((id) => id !== parentId);
  if (otros.length === 0) return 0;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("group_creatives_as_ad", {
    p_parent: parentId,
    p_variantes: otros,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/", "layout");
  return (data as number) ?? 0;
}

/** Devuelve variantes a ser anuncios por su cuenta. */
export async function ungroup(variantIds: string[]): Promise<number> {
  await requireUser();
  if (variantIds.length === 0) return 0;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ungroup_creatives", { p_ids: variantIds });

  if (error) throw new Error(error.message);

  revalidatePath("/", "layout");
  return (data as number) ?? 0;
}
