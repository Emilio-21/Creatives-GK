"use server";

import { revalidatePath } from "next/cache";
import { deliverSlackSoon } from "@/lib/slack-after";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { type BriefStatus, type Channel, type OwnerStatus } from "@/lib/brief-flow";
import { attempt, type ActionResult } from "@/lib/action-result";

export type TeamMember = { id: string; name: string; role: string; isMe: boolean };

async function listTeamImpl(): Promise<TeamMember[]> {
  const user = await requireUser();
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
    isMe: row.id === user.id,
  }));
}

/**
 * Mueve el brief de estado.
 *
 * Todo el criterio vive en transition_brief: que transiciones son validas, que
 * asignar exige persona y que devolver exige motivo. Aqui no se repite, porque
 * dos copias de la misma regla se separan.
 */
async function moveBriefImpl(
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
  deliverSlackSoon();
  return data as BriefStatus;
}

/**
 * Cambia quien se encarga de una etapa. Si es la etapa en curso, la base
 * registra el relevo y avisa a la persona nueva.
 */
async function setBriefOwnerImpl(
  briefId: string,
  stage: OwnerStatus,
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
  deliverSlackSoon();
}

async function setBriefDueDateImpl(briefId: string, dueDate: string | null): Promise<void> {
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
  kind: "paso" | "relevo" | "empezo" | "aprobo" | "salto";
  actorName: string;
  assigneeName: string | null;
  created_at: string;
};

async function getBriefHistoryImpl(briefId: string): Promise<BriefEvent[]> {
  await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("brief_events")
    .select("id, from_status, to_status, note, actor, assigned_to, kind, created_at")
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
    kind: (row.kind as BriefEvent["kind"]) ?? "paso",
    actorName: names.get(row.actor as string) ?? "sin nombre",
    assigneeName: row.assigned_to ? (names.get(row.assigned_to as string) ?? null) : null,
    created_at: row.created_at as string,
  }));
}

/** "Ya lo tome." La base valida que sea quien tiene la etapa (o un admin). */
async function startBriefStageImpl(briefId: string): Promise<void> {
  await requireUser();
  const supabase = await createClient();

  const { error } = await supabase.rpc("start_brief_stage", { p_brief: briefId });
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

/**
 * Visto bueno en aprobación. La base decide de que lado cuenta (copy, media o
 * los dos si es la misma persona) y la pasa sola a lanzamiento con los dos.
 */
async function approveBriefImpl(briefId: string, note?: string | null): Promise<BriefStatus> {
  await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("approve_brief", {
    p_brief: briefId,
    p_note: note ?? null,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/", "layout");
  deliverSlackSoon();
  return data as BriefStatus;
}

export type MyTask = {
  id: string;
  title: string;
  channel: Channel;
  status: BriefStatus;
  clientId: string;
  clientName: string;
  docUrl: string | null;
  dueDate: string | null;
  enteredAt: string | null;
  startedAt: string | null;
  reviewerId: string | null;
  producerId: string | null;
  launcherId: string | null;
  /** En aprobación: si ya dio su visto bueno cada lado. */
  copyOk: boolean;
  mediaOk: boolean;
};

const TASK_COLUMNS =
  "id, title, channel, status, client_id, doc_url, due_date, stage_entered_at, stage_started_at, reviewer_id, producer_id, launcher_id, copy_ok_at, media_ok_at, clients(name)";

/**
 * Lo que es mio: la etapa que tengo a cargo, o una aprobación donde falta mi
 * visto bueno (en aprobación nadie tiene la tarea sola: la tienen copy y media).
 */
function mineFilter(userId: string): string {
  return [
    `and(assigned_to.eq.${userId},status.in.(borrador,en_revision,en_produccion,en_lanzamiento))`,
    `and(status.eq.en_aprobacion,reviewer_id.eq.${userId},copy_ok_at.is.null)`,
    `and(status.eq.en_aprobacion,launcher_id.eq.${userId},media_ok_at.is.null)`,
  ].join(",");
}

/**
 * Lo que me toca, de todos los clientes. Una etapa es de quien la tiene
 * asignada ahora (o de quien falta que apruebe): lo que viene despues todavia
 * no es pendiente de nadie.
 */
export async function listMyTasks(): Promise<MyTask[]> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("briefs")
    .select(TASK_COLUMNS)
    .or(mineFilter(user.id))
    .is("archived_at", null);

  const tasks = (data ?? []).map((row) => ({
    id: row.id as string,
    title: row.title as string,
    channel: row.channel as Channel,
    status: row.status as BriefStatus,
    clientId: row.client_id as string,
    clientName:
      ((row.clients as unknown as { name: string } | null)?.name as string | undefined) ?? "—",
    docUrl: (row.doc_url as string | null) ?? null,
    dueDate: (row.due_date as string | null) ?? null,
    enteredAt: (row.stage_entered_at as string | null) ?? null,
    startedAt: (row.stage_started_at as string | null) ?? null,
    reviewerId: (row.reviewer_id as string | null) ?? null,
    producerId: (row.producer_id as string | null) ?? null,
    launcherId: (row.launcher_id as string | null) ?? null,
    copyOk: row.copy_ok_at !== null,
    mediaOk: row.media_ok_at !== null,
  }));

  // Lo que vence primero, arriba; sin fecha, al final por lo que lleva esperando.
  return tasks.sort((a, b) => {
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return (a.enteredAt ?? "").localeCompare(b.enteredAt ?? "");
  });
}

export async function myTaskCount(): Promise<number> {
  const user = await requireUser();
  const supabase = await createClient();

  const { count } = await supabase
    .from("briefs")
    .select("id", { count: "exact", head: true })
    .or(mineFilter(user.id))
    .is("archived_at", null);

  return count ?? 0;
}

// ---- Acciones expuestas al navegador ----
// Regresan el error en vez de lanzarlo: en produccion Next oculta el mensaje de
// lo que se lanza. Ver src/lib/action-result.ts.

export async function approveBrief(
  ...args: Parameters<typeof approveBriefImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof approveBriefImpl>>>> {
  return attempt(() => approveBriefImpl(...args));
}

export async function getBriefHistory(
  ...args: Parameters<typeof getBriefHistoryImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof getBriefHistoryImpl>>>> {
  return attempt(() => getBriefHistoryImpl(...args));
}

export async function listTeam(
  ...args: Parameters<typeof listTeamImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof listTeamImpl>>>> {
  return attempt(() => listTeamImpl(...args));
}

export async function moveBrief(
  ...args: Parameters<typeof moveBriefImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof moveBriefImpl>>>> {
  return attempt(() => moveBriefImpl(...args));
}

export async function setBriefDueDate(
  ...args: Parameters<typeof setBriefDueDateImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof setBriefDueDateImpl>>>> {
  return attempt(() => setBriefDueDateImpl(...args));
}

export async function setBriefOwner(
  ...args: Parameters<typeof setBriefOwnerImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof setBriefOwnerImpl>>>> {
  return attempt(() => setBriefOwnerImpl(...args));
}

export async function startBriefStage(
  ...args: Parameters<typeof startBriefStageImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof startBriefStageImpl>>>> {
  return attempt(() => startBriefStageImpl(...args));
}
