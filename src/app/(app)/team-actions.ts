"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getPreviewUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import type { Member, Role } from "@/lib/team";
import { attempt, type ActionResult } from "@/lib/action-result";

/** El equipo con sus clientes y cuánto tiene encima. */
export async function listMembers(): Promise<Member[]> {
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: profiles }, { data: members }, { data: briefs }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, role, slack_user_id, slack_notify, avatar_path")
      .order("full_name"),
    supabase.from("client_members").select("client_id, profile_id"),
    // Lo que tiene encima cada quien: la etapa en curso de cada brief abierto.
    supabase
      .from("briefs")
      .select("assigned_to")
      .in("status", ["en_revision", "en_produccion", "en_lanzamiento"])
      .is("archived_at", null),
  ]);

  const porPersona = new Map<string, string[]>();
  for (const row of members ?? []) {
    const key = row.profile_id as string;
    porPersona.set(key, [...(porPersona.get(key) ?? []), row.client_id as string]);
  }

  const pendientes = new Map<string, number>();
  for (const row of briefs ?? []) {
    const key = row.assigned_to as string | null;
    if (key) pendientes.set(key, (pendientes.get(key) ?? 0) + 1);
  }

  return Promise.all((profiles ?? []).map(async (row) => ({
    id: row.id as string,
    name: (row.full_name as string | null) ?? "sin nombre",
    role: ((row.role as string) ?? "member") as Role,
    clientIds: porPersona.get(row.id as string) ?? [],
    isMe: row.id === user.id,
    openBriefs: pendientes.get(row.id as string) ?? 0,
    slackLinked: Boolean(row.slack_user_id),
    slackNotify: row.slack_notify !== false,
    avatarUrl: row.avatar_path ? await getPreviewUrl(row.avatar_path as string) : null,
  })));
}

async function setRoleImpl(profileId: string, role: Role): Promise<void> {
  await requireUser();
  const supabase = await createClient();

  const { error } = await supabase.rpc("set_member_role", {
    p_profile: profileId,
    p_role: role,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

/**
 * Pone o quita un cliente a alguien.
 *
 * Es un filtro de vista, no un permiso: quien no tenga clientes asignados los
 * ve todos. Asi la app sigue sirviendo aunque nadie se acuerde de repartir.
 */
async function setClientMemberImpl(
  clientId: string,
  profileId: string,
  belongs: boolean,
): Promise<void> {
  await requireUser();
  const supabase = await createClient();

  const { error } = belongs
    ? await supabase.from("client_members").insert({ client_id: clientId, profile_id: profileId })
    : await supabase
        .from("client_members")
        .delete()
        .eq("client_id", clientId)
        .eq("profile_id", profileId);

  // Poner lo que ya estaba puesto no es un error que valga la pena mostrar.
  if (error && error.code !== "23505") throw new Error(error.message);
  revalidatePath("/", "layout");
}

/** Los clientes de quien pregunta. Vacío = los ve todos. */
export async function myClientIds(): Promise<string[]> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("client_members")
    .select("client_id")
    .eq("profile_id", user.id);

  return (data ?? []).map((row) => row.client_id as string);
}

/** Prende o apaga los mensajes de Slack de quien lo pide. Los avisos de la app siguen. */
async function setSlackNotifyImpl(on: boolean): Promise<void> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_slack_notify", { p_on: on });
  if (error) throw new Error(error.message);
  revalidatePath("/equipo");
}

// ---- Acciones expuestas al navegador ----
// Regresan el error en vez de lanzarlo: en produccion Next oculta el mensaje de
// lo que se lanza. Ver src/lib/action-result.ts.

export async function setClientMember(
  ...args: Parameters<typeof setClientMemberImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof setClientMemberImpl>>>> {
  return attempt(() => setClientMemberImpl(...args));
}

export async function setRole(
  ...args: Parameters<typeof setRoleImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof setRoleImpl>>>> {
  return attempt(() => setRoleImpl(...args));
}

export async function setSlackNotify(
  ...args: Parameters<typeof setSlackNotifyImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof setSlackNotifyImpl>>>> {
  return attempt(() => setSlackNotifyImpl(...args));
}
