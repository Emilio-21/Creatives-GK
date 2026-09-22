"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const ROLES = ["admin", "media", "copy", "design", "member"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  media: "Media buying",
  copy: "Copy",
  design: "Diseño",
  member: "Equipo",
};

export const ROLE_HINT: Record<Role, string> = {
  admin: "Puede borrar y administrar el equipo",
  media: "Recibe los avisos de «listo para lanzar»",
  copy: "Escribe los briefs y los asigna",
  design: "Sube los diseños",
  member: "Sin área asignada",
};

export type Member = {
  id: string;
  name: string;
  role: Role;
  clientIds: string[];
  isMe: boolean;
  openBriefs: number;
};

/** El equipo con sus clientes y cuánto tiene encima. */
export async function listMembers(): Promise<Member[]> {
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: profiles }, { data: members }, { data: briefs }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, role").order("full_name"),
    supabase.from("client_members").select("client_id, profile_id"),
    // Lo que tiene encima cada quien: asignado o en diseño, sin terminar.
    supabase.from("briefs").select("assigned_to").in("status", ["asignado", "en_diseno"]),
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

  return (profiles ?? []).map((row) => ({
    id: row.id as string,
    name: (row.full_name as string | null) ?? "sin nombre",
    role: ((row.role as string) ?? "member") as Role,
    clientIds: porPersona.get(row.id as string) ?? [],
    isMe: row.id === user.id,
    openBriefs: pendientes.get(row.id as string) ?? 0,
  }));
}

export async function setRole(profileId: string, role: Role): Promise<void> {
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
export async function setClientMember(
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
