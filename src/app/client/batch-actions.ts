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
