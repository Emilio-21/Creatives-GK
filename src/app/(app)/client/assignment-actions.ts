"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { BriefStatus, StageStatus } from "@/lib/brief-flow";

export type TeamMember = { id: string; name: string; role: string };

export async function listTeam(): Promise<TeamMember[]> {
  await requireUser();
  const supabase = await createClient();

  // Las policies ya limitan a la organizacion de quien pregunta.
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .order("full_name");

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: (row.full_name as string | null) ?? "sin nombre",
    role: (row.role as string) ?? "member",
  }));
}

/**
 * Mueve el brief de estado.
 *
 * Todo el criterio vive en transition_brief: que transiciones son validas, que
 * asignar exige persona y que devolver exige motivo. Aqui no se repite, porque
 * dos copias de la misma regla se separan.
 */
export async function moveBrief(
  briefId: string,
  to: BriefStatus,
  assignedTo?: string | null,
  note?: string | null,
): Promise<BriefStatus> {
  await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("transition_brief", {
    p_brief: briefId,
    p_to: to,
    p_assigned: assignedTo ?? null,
    p_note: note ?? null,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/", "layout");
  return data as BriefStatus;
}

/**
 * Cambia quien se encarga de una etapa. Si es la etapa en curso, la base
 * registra el relevo y avisa a la persona nueva.
 */
export async function setBriefOwner(
  briefId: string,
  stage: StageStatus,
  profileId: string | null,
): Promise<void> {
  await requireUser();
  const supabase = await createClient();

  const { error } = await supabase.rpc("set_brief_owner", {
    p_brief: briefId,
    p_stage: stage,
    p_profile: profileId,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

export async function setBriefDueDate(briefId: string, dueDate: string | null): Promise<void> {
  await requireUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from("briefs")
    .update({ due_date: dueDate || null })
    .eq("id", briefId);

  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

export type BriefEvent = {
  id: string;
  from_status: string | null;
  to_status: string;
  note: string | null;
  actorName: string;
  assigneeName: string | null;
  created_at: string;
};

export async function getBriefHistory(briefId: string): Promise<BriefEvent[]> {
  await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("brief_events")
    .select("id, from_status, to_status, note, actor, assigned_to, created_at")
    .eq("brief_id", briefId)
    .order("created_at", { ascending: false });

  const rows = data ?? [];
  const actorIds = [
    ...new Set(
      rows.flatMap((row) => [row.actor as string, row.assigned_to as string | null]).filter(Boolean),
    ),
  ] as string[];

  const names = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", actorIds);
    for (const profile of profiles ?? []) {
      names.set(profile.id as string, (profile.full_name as string | null) ?? "sin nombre");
    }
  }

  return rows.map((row) => ({
    id: row.id as string,
    from_status: (row.from_status as string | null) ?? null,
    to_status: row.to_status as string,
    note: (row.note as string | null) ?? null,
    actorName: names.get(row.actor as string) ?? "sin nombre",
    assigneeName: row.assigned_to ? (names.get(row.assigned_to as string) ?? null) : null,
    created_at: row.created_at as string,
  }));
}
