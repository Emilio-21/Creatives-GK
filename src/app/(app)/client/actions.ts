"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { attempt, type ActionResult } from "@/lib/action-result";

export type ClientFormState = { error: string | null };

async function createClientRecordImpl(
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

async function renameClientImpl(id: string, name: string): Promise<void> {
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
async function archiveClientImpl(id: string): Promise<void> {
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

// ---- Acciones expuestas al navegador ----
// Regresan el error en vez de lanzarlo: en produccion Next oculta el mensaje de
// lo que se lanza. Ver src/lib/action-result.ts.

export async function archiveClient(
  ...args: Parameters<typeof archiveClientImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof archiveClientImpl>>>> {
  return attempt(() => archiveClientImpl(...args));
}

export async function renameClient(
  ...args: Parameters<typeof renameClientImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof renameClientImpl>>>> {
  return attempt(() => renameClientImpl(...args));
}

export async function createClientRecord(
  ...args: Parameters<typeof createClientRecordImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof createClientRecordImpl>>>> {
  return attempt(() => createClientRecordImpl(...args));
}
