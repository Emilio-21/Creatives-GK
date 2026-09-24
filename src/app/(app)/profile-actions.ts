"use server";

import { revalidatePath } from "next/cache";
import { attempt, type ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth";
import { BACKGROUNDS } from "@/lib/backgrounds";
import { buildAvatarPath, deleteFile, getUploadUrl, statFile } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

/** La foto se recorta a 256×256 en el navegador; esto es solo el tope por si no. */
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

async function requestAvatarUploadImpl(): Promise<{ path: string; uploadUrl: string }> {
  const user = await requireUser();
  const path = buildAvatarPath(user.id);
  return { path, uploadUrl: await getUploadUrl(path, "image/jpeg") };
}

async function currentAvatar(userId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("avatar_path").eq("id", userId).single();
  return (data?.avatar_path as string | null) ?? null;
}

/** Guarda la foto ya subida y borra la anterior de R2. */
async function setAvatarImpl(path: string): Promise<void> {
  const user = await requireUser();
  if (!path.startsWith(`avatars/${user.id}/`)) throw new Error("Esa foto no es tuya.");

  const stat = await statFile(path);
  if (!stat) throw new Error("La foto no terminó de subir. Inténtalo de nuevo.");
  if (stat.size > MAX_AVATAR_BYTES) {
    await deleteFile(path);
    throw new Error("La foto pesa demasiado.");
  }

  const anterior = await currentAvatar(user.id);
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ avatar_path: path }).eq("id", user.id);
  if (error) {
    await deleteFile(path);
    throw new Error(error.message);
  }
  if (anterior && anterior !== path) await deleteFile(anterior).catch(() => {});
  revalidatePath("/", "layout");
}

async function removeAvatarImpl(): Promise<void> {
  const user = await requireUser();
  const anterior = await currentAvatar(user.id);
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ avatar_path: null }).eq("id", user.id);
  if (error) throw new Error(error.message);
  if (anterior) await deleteFile(anterior).catch(() => {});
  revalidatePath("/", "layout");
}

/** El nombre que ve el equipo: en avisos, Slack, briefs y la barra lateral. */
async function updateNameImpl(name: string): Promise<void> {
  const user = await requireUser();
  const limpio = name.trim().replace(/\s+/g, " ");
  if (!limpio) throw new Error("Escribe tu nombre.");
  if (limpio.length > 80) throw new Error("El nombre va hasta 80 caracteres.");

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ full_name: limpio }).eq("id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

/** El fondo de mi pantalla. Solo el propio: la policy deja tocar solo mi perfil. */
async function setBackgroundImpl(id: string): Promise<void> {
  const user = await requireUser();
  if (!BACKGROUNDS.some((bg) => bg.id === id)) throw new Error("Ese fondo no existe.");

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ background: id }).eq("id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

// ---- Acciones expuestas al navegador ----
// Regresan el error en vez de lanzarlo: en produccion Next oculta el mensaje de
// lo que se lanza. Ver src/lib/action-result.ts.

export async function requestAvatarUpload(): Promise<
  ActionResult<Awaited<ReturnType<typeof requestAvatarUploadImpl>>>
> {
  return attempt(() => requestAvatarUploadImpl());
}

export async function setAvatar(
  ...args: Parameters<typeof setAvatarImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof setAvatarImpl>>>> {
  return attempt(() => setAvatarImpl(...args));
}

export async function removeAvatar(): Promise<ActionResult<void>> {
  return attempt(() => removeAvatarImpl());
}

export async function setBackground(
  ...args: Parameters<typeof setBackgroundImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof setBackgroundImpl>>>> {
  return attempt(() => setBackgroundImpl(...args));
}

export async function updateName(
  ...args: Parameters<typeof updateNameImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof updateNameImpl>>>> {
  return attempt(() => updateNameImpl(...args));
}
