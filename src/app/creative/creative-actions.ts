"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

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
