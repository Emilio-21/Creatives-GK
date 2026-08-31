"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type ClientFormState = { error: string | null };

export async function createClientRecord(
  _prev: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();

  if (!name) return { error: "Escribe el nombre del cliente." };
  if (name.length > 60) return { error: "Máximo 60 caracteres." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .insert({ name, created_by: user.id })
    .select("id")
    .single();

  if (error) {
    return {
      error:
        error.code === "23505"
          ? `Ya existe un cliente llamado "${name}".`
          : `No se pudo crear: ${error.message}`,
    };
  }

  revalidatePath("/", "layout");
  redirect(`/client/${data.id as string}`);
}

export async function renameClient(id: string, name: string): Promise<void> {
  await requireUser();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("El nombre no puede ir vacío.");

  const supabase = await createClient();
  const { error } = await supabase.from("clients").update({ name: trimmed }).eq("id", id);
  if (error) {
    throw new Error(
      error.code === "23505" ? `Ya existe un cliente llamado "${trimmed}".` : error.message,
    );
  }

  revalidatePath("/", "layout");
}

/** Archivar en vez de borrar: los creativos apuntan al cliente. */
export async function archiveClient(id: string): Promise<void> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("clients")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/", "layout");
  redirect("/");
}
