"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { deleteFile } from "@/lib/storage";
import { attempt, type ActionResult } from "@/lib/action-result";

export type MetadataInput = {
  creativeId: string;
  displayName: string;
  concept: string | null;
  format: string | null;
  tags: string[];
  notes: string | null;
};

/** RLS deja editar solo al que subio el archivo o a un admin. */
async function updateMetadataImpl(input: MetadataInput): Promise<void> {
  await requireUser();

  const displayName = input.displayName.trim();
  if (!displayName) throw new Error("El nombre no puede ir vacío.");

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("creatives")
    .update(
      {
        display_name: displayName,
        concept: input.concept,
        format: input.format,
        tags: input.tags,
        notes: input.notes,
      },
      { count: "exact" },
    )
    .eq("id", input.creativeId);

  if (error) throw new Error(error.message);
  if (!count) throw new Error("Solo quien lo subió o un admin puede editarlo.");

  revalidatePath(`/creative/${input.creativeId}`);
  revalidatePath("/", "layout");
}

/**
 * Archivar, no borrar: el archivo sigue en R2 y los lanzamientos con sus
 * metricas siguen existiendo. Sale de la biblioteca y de los KPIs.
 */
async function setArchivedImpl(creativeId: string, archived: boolean): Promise<void> {
  await requireUser();

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("creatives")
    .update({ archived_at: archived ? new Date().toISOString() : null }, { count: "exact" })
    .eq("id", creativeId);

  if (error) throw new Error(error.message);
  if (!count) throw new Error("Solo quien lo subió o un admin puede archivarlo.");

  revalidatePath(`/creative/${creativeId}`);
  revalidatePath("/", "layout");
}

/**
 * Borrado definitivo: el registro, sus lanzamientos (cascade) y los archivos.
 *
 * Primero la fila y luego R2: si se cayera al reves, quedaria un creativo
 * apuntando a archivos que ya no existen. Al hacerlo en este orden lo peor que
 * pasa es un huerfano en R2, que es justo lo que barre cleanup-orphans.
 */
async function deleteCreativeImpl(creativeId: string): Promise<void> {
  await requireUser();
  const supabase = await createClient();

  const { data: creative } = await supabase
    .from("creatives")
    .select("storage_path, poster_path")
    .eq("id", creativeId)
    .maybeSingle();

  if (!creative) throw new Error("No se encontró el creativo.");

  // Las variantes se van con el padre por la FK (on delete cascade), pero la
  // cascada es de la base: sus archivos en R2 hay que juntarlos ANTES de borrar
  // la fila, o se quedan pagando espacio sin registro que los apunte.
  const { data: variantRows } = await supabase
    .from("creatives")
    .select("storage_path, poster_path")
    .eq("parent_id", creativeId);

  const { error, count } = await supabase
    .from("creatives")
    .delete({ count: "exact" })
    .eq("id", creativeId);

  if (error) throw new Error(error.message);
  if (!count) throw new Error("Solo quien lo subió o un admin puede borrarlo.");

  const archivos = [creative, ...(variantRows ?? [])];
  for (const fila of archivos) {
    await deleteFile(fila.storage_path as string).catch(() => {});
    if (fila.poster_path) await deleteFile(fila.poster_path as string).catch(() => {});
  }

  revalidatePath("/", "layout");
}

/**
 * Pausar o reanudar a mano.
 *
 * Lo que viene de Meta se actualiza solo en cada sync; esto es para los
 * lanzamientos manuales, que no tienen un anuncio que consultar. Afecta a los
 * lanzamientos del creativo que siguen abiertos.
 */
async function setCreativePausedImpl(
  creativeId: string,
  paused: boolean,
): Promise<number> {
  await requireUser();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_creative_paused", {
    p_creative: creativeId,
    p_paused: paused,
  });

  if (error) throw new Error(error.message);

  revalidatePath(`/creative/${creativeId}`);
  revalidatePath("/", "layout");
  return (data as number) ?? 0;
}

// ---- Acciones expuestas al navegador ----
// Regresan el error en vez de lanzarlo: en produccion Next oculta el mensaje de
// lo que se lanza. Ver src/lib/action-result.ts.

export async function deleteCreative(
  ...args: Parameters<typeof deleteCreativeImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof deleteCreativeImpl>>>> {
  return attempt(() => deleteCreativeImpl(...args));
}

export async function setCreativePaused(
  ...args: Parameters<typeof setCreativePausedImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof setCreativePausedImpl>>>> {
  return attempt(() => setCreativePausedImpl(...args));
}

export async function setArchived(
  ...args: Parameters<typeof setArchivedImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof setArchivedImpl>>>> {
  return attempt(() => setArchivedImpl(...args));
}

export async function updateMetadata(
  ...args: Parameters<typeof updateMetadataImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof updateMetadataImpl>>>> {
  return attempt(() => updateMetadataImpl(...args));
}
