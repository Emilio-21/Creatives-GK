"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { attempt, type ActionResult } from "@/lib/action-result";

export type Notification = {
  id: string;
  kind: string;
  brief_id: string | null;
  client_id: string | null;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
};

/** Las policies ya limitan a lo propio: no hace falta filtrar por usuario. */
async function listNotificationsImpl(limit = 30): Promise<Notification[]> {
  await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("notifications")
    .select("id, kind, brief_id, client_id, title, body, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []) as Notification[];
}

export async function unreadCount(): Promise<number> {
  await requireUser();
  const supabase = await createClient();

  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);

  return count ?? 0;
}

async function markReadImpl(ids: string[]): Promise<void> {
  await requireUser();
  if (ids.length === 0) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .in("id", ids)
    .is("read_at", null);

  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

async function markAllReadImpl(): Promise<void> {
  await requireUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);

  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

// ---- Acciones expuestas al navegador ----
// Regresan el error en vez de lanzarlo: en produccion Next oculta el mensaje de
// lo que se lanza. Ver src/lib/action-result.ts.

export async function listNotifications(
  ...args: Parameters<typeof listNotificationsImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof listNotificationsImpl>>>> {
  return attempt(() => listNotificationsImpl(...args));
}

export async function markAllRead(
  ...args: Parameters<typeof markAllReadImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof markAllReadImpl>>>> {
  return attempt(() => markAllReadImpl(...args));
}

export async function markRead(
  ...args: Parameters<typeof markReadImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof markReadImpl>>>> {
  return attempt(() => markReadImpl(...args));
}
