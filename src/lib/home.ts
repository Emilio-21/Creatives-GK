import "server-only";
import { createClient } from "@/lib/supabase/server";
import { OPEN_STATUSES, type BriefStatus, type Channel, type StageStatus } from "@/lib/brief-flow";
import { today } from "@/lib/dates";

/**
 * Lo que alimenta el inicio: que hago ahora y que esta atorado.
 *
 * Una sola consulta de briefs abiertos y de ahi se sacan los tres bloques. Son
 * decenas de briefs, no miles: filtrar aqui es mas simple que tres consultas
 * que tienen que coincidir en que es "abierto".
 */

/** Cuanto puede esperar algo sin que nadie lo toque antes de contar como atorado. */
export const DIAS_ATORADO = 2;

export type HomeBrief = {
  id: string;
  title: string;
  channel: Channel;
  status: BriefStatus;
  clientId: string;
  clientName: string;
  assigneeName: string | null;
  enteredAt: string | null;
  startedAt: string | null;
  dueDate: string | null;
};

export type Stuck = HomeBrief & { reason: string };

export type HomeData = {
  /** Lo que yo mande o pase y sigue en manos de alguien mas. */
  sent: HomeBrief[];
  /** Cuantos briefs hay en cada estado; "lanzado" cuenta solo los de esta semana. */
  pipeline: Record<BriefStatus, number>;
  stuck: Stuck[];
};

export async function getHomeData(userId: string): Promise<HomeData> {
  const supabase = await createClient();
  const semana = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const [{ data: rows }, { data: pasados }] = await Promise.all([
    supabase
      .from("briefs")
      .select(
        "id, title, channel, status, client_id, created_by, assigned_to, stage_entered_at, stage_started_at, due_date, clients(name)",
      )
      .is("archived_at", null)
      // Lanzados solo los recientes: los viejos no le piden nada a nadie.
      .or(`status.neq.lanzado,stage_entered_at.gte.${semana}`),
    // Los que yo movi de etapa: "los que pase" aunque no los haya creado.
    supabase.from("brief_events").select("brief_id").eq("actor", userId).eq("kind", "paso"),
  ]);

  const briefs = rows ?? [];
  const assigneeIds = [
    ...new Set(briefs.map((b) => b.assigned_to as string | null).filter(Boolean)),
  ] as string[];
  const { data: profiles } = assigneeIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", assigneeIds)
    : { data: [] };
  const names = new Map(
    (profiles ?? []).map((p) => [p.id as string, (p.full_name as string | null) ?? "sin nombre"]),
  );

  const toHome = (b: (typeof briefs)[number]): HomeBrief => ({
    id: b.id as string,
    title: b.title as string,
    channel: b.channel as Channel,
    status: b.status as BriefStatus,
    clientId: b.client_id as string,
    clientName: (b.clients as unknown as { name: string } | null)?.name ?? "—",
    assigneeName: b.assigned_to ? (names.get(b.assigned_to as string) ?? null) : null,
    enteredAt: (b.stage_entered_at as string | null) ?? null,
    startedAt: (b.stage_started_at as string | null) ?? null,
    dueDate: (b.due_date as string | null) ?? null,
  });

  const mios = new Set((pasados ?? []).map((e) => e.brief_id as string));

  const sent = briefs
    .filter(
      (b) =>
        OPEN_STATUSES.includes(b.status as StageStatus) &&
        b.assigned_to !== userId &&
        (b.created_by === userId || mios.has(b.id as string)),
    )
    .map(toHome)
    .sort((a, b) => (a.enteredAt ?? "").localeCompare(b.enteredAt ?? ""));

  const pipeline: Record<BriefStatus, number> = {
    borrador: 0,
    en_revision: 0,
    en_produccion: 0,
    en_lanzamiento: 0,
    lanzado: 0,
  };
  for (const b of briefs) pipeline[b.status as BriefStatus] += 1;

  const hoy = today();
  const limite = Date.now() - DIAS_ATORADO * 86_400_000;
  const stuck: Stuck[] = [];
  for (const b of briefs) {
    const brief = toHome(b);
    if (!OPEN_STATUSES.includes(brief.status as StageStatus)) continue;
    const esperando = brief.enteredAt ? new Date(brief.enteredAt).getTime() < limite : false;

    // Una razon por brief, la mas grave: tres renglones del mismo brief son ruido.
    // Sin responsable va primero: no hay a quien esperar.
    let reason: string | null = null;
    if (!brief.assigneeName) reason = "Nadie lo tiene";
    else if (brief.dueDate && brief.dueDate < hoy) reason = `Vencido desde el ${brief.dueDate}`;
    else if (brief.status === "en_lanzamiento" && esperando) reason = "Listo y sin lanzar";
    else if (!brief.startedAt && esperando) reason = "Nadie lo ha empezado";
    if (reason) stuck.push({ ...brief, reason });
  }
  stuck.sort((a, b) => (a.enteredAt ?? "").localeCompare(b.enteredAt ?? ""));

  return { sent, pipeline, stuck };
}
