"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { deleteFile } from "@/lib/storage";

export type MetadataInput = {
  creativeId: string;
  displayName: string;
  concept: string | null;
  format: string | null;
  tags: string[];
  notes: string | null;
};

/** RLS deja editar solo al que subio el archivo o a un admin. */
export async function updateMetadata(input: MetadataInput): Promise<void> {
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
export async function setArchived(creativeId: string, archived: boolean): Promise<void> {
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
export async function deleteCreative(creativeId: string): Promise<void> {
  await requireUser();
  const supabase = await createClient();

  const { data: creative } = await supabase
    .from("creatives")
    .select("storage_path, poster_path")
    .eq("id", creativeId)
    .maybeSingle();

  if (!creative) throw new Error("No se encontró el creativo.");

  const { error, count } = await supabase
    .from("creatives")
    .delete({ count: "exact" })
    .eq("id", creativeId);

  if (error) throw new Error(error.message);
  if (!count) throw new Error("Solo quien lo subió o un admin puede borrarlo.");

  await deleteFile(creative.storage_path as string).catch(() => {});
  if (creative.poster_path) {
    await deleteFile(creative.poster_path as string).catch(() => {});
  }

  revalidatePath("/", "layout");
}
