import "server-only";
import { appUrl } from "@/lib/app-url";
import {
  BRIEF_STATUSES,
  CHANNEL_LABEL,
  STAGES,
  type BriefStatus,
  type Channel,
} from "@/lib/brief-flow";
import { createAdminClient } from "@/lib/supabase/admin";
import { esc, lookupSlackUser, sendDirectMessage, slackToken } from "@/lib/slack";

/**
 * Manda a Slack los avisos que todavia no salen.
 *
 * Lee de notifications, que escribe transition_brief en la misma transaccion
 * que el cambio de etapa: Slack es otra salida del mismo aviso, no otro aviso.
 * Corre justo despues de cada cambio (after() en las acciones) y en el
 * reintento periodico del cron, por si Slack fallo en ese momento.
 *
 * Con service role: tiene que leer avisos y correos de todo el equipo.
 */

/** Avisos mas viejos que esto ya no se mandan: a destiempo solo confunden. */
const VENTANA_HORAS = 24;
const MAX_INTENTOS = 3;
/** Un reclamo mas viejo que esto es de un proceso que murio: se puede retomar. */
const RECLAMO_MINUTOS = 5;

export type SlackDeliveryReport = {
  skipped?: string;
  sent: number;
  failed: number;
  errors: string[];
};

export async function deliverPendingSlack(limit = 25): Promise<SlackDeliveryReport> {
  const report: SlackDeliveryReport = { sent: 0, failed: 0, errors: [] };
  if (!slackToken()) return { ...report, skipped: "Sin SLACK_BOT_TOKEN: Slack apagado." };

  const db = createAdminClient();
  const desde = new Date(Date.now() - VENTANA_HORAS * 3_600_000).toISOString();
  const reclamoViejo = new Date(Date.now() - RECLAMO_MINUTOS * 60_000).toISOString();

  // Reclamar antes de mandar: el update solo devuelve las filas que gano este
  // proceso, asi que dos entregas a la vez no mandan el mismo aviso.
  const { data: candidatos } = await db
    .from("notifications")
    .select("id")
    .is("slack_sent_at", null)
    .is("slack_error", null)
    .lt("slack_attempts", MAX_INTENTOS)
    .gte("created_at", desde)
    .or(`slack_claimed_at.is.null,slack_claimed_at.lt.${reclamoViejo}`)
    .order("created_at")
    .limit(limit);
  if (!candidatos?.length) return report;

  const { data: reclamados, error: reclamoError } = await db
    .from("notifications")
    .update({ slack_claimed_at: new Date().toISOString() })
    .in(
      "id",
      candidatos.map((c) => c.id),
    )
    .is("slack_sent_at", null)
    .or(`slack_claimed_at.is.null,slack_claimed_at.lt.${reclamoViejo}`)
    .select("id, profile_id, kind, brief_id, title, body, slack_attempts");
  if (reclamoError) throw new Error(reclamoError.message);
  if (!reclamados?.length) return report;

  const profileIds = [...new Set(reclamados.map((n) => n.profile_id as string))];
  const briefIds = [...new Set(reclamados.map((n) => n.brief_id as string | null).filter(Boolean))];

  const [{ data: perfiles }, { data: briefs }] = await Promise.all([
    db.from("profiles").select("id, full_name, slack_user_id, slack_notify").in("id", profileIds),
    briefIds.length
      ? db
          .from("briefs")
          .select(
            "id, title, status, channel, client_id, doc_url, due_date, reviewer_id, producer_id, launcher_id, clients(name)",
          )
          .in("id", briefIds as string[])
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  // Nombres de todos los responsables, para dibujar el flujo completo.
  const ownerIds = [
    ...new Set(
      (briefs ?? []).flatMap((b) =>
        [b.reviewer_id, b.producer_id, b.launcher_id].filter(Boolean),
      ),
    ),
  ] as string[];
  const { data: owners } = ownerIds.length
    ? await db.from("profiles").select("id, full_name").in("id", ownerIds)
    : { data: [] };
  const nombres = new Map((owners ?? []).map((o) => [o.id as string, (o.full_name as string) ?? "—"]));
  const briefPorId = new Map((briefs ?? []).map((b) => [b.id as string, b]));
  const perfilPorId = new Map((perfiles ?? []).map((p) => [p.id as string, p]));

  for (const aviso of reclamados) {
    const perfil = perfilPorId.get(aviso.profile_id as string);
    try {
      if (!perfil) throw new Final("La persona ya no existe.");
      if (perfil.slack_notify === false) throw new Final("Apagó los avisos de Slack.");

      const slackId = await slackIdFor(db, perfil);
      if (!slackId) throw new Final("Su correo no está en el Slack de la agencia.");

      const brief = aviso.brief_id ? briefPorId.get(aviso.brief_id as string) : undefined;
      await sendDirectMessage(
        slackId,
        buildMessage({
          title: aviso.title as string,
          body: (aviso.body as string | null) ?? null,
          kind: aviso.kind as string,
          recipientId: aviso.profile_id as string,
          brief,
          nombres,
        }),
      );

      await db
        .from("notifications")
        .update({ slack_sent_at: new Date().toISOString(), slack_claimed_at: null })
        .eq("id", aviso.id);
      report.sent += 1;
    } catch (error) {
      const message = (error as Error).message;
      const final = error instanceof Final;
      // Un error final (no esta en Slack, lo apago) no se reintenta; uno de red si.
      await db
        .from("notifications")
        .update({
          slack_attempts: ((aviso.slack_attempts as number) ?? 0) + 1,
          slack_error: final ? message : null,
          slack_claimed_at: null,
        })
        .eq("id", aviso.id);
      report.failed += 1;
      report.errors.push(message);
    }
  }

  return report;
}

/** Un error que no se arregla reintentando. */
class Final extends Error {}

async function slackIdFor(
  db: ReturnType<typeof createAdminClient>,
  perfil: Record<string, unknown>,
): Promise<string | null> {
  if (perfil.slack_user_id) return perfil.slack_user_id as string;

  // Primera vez: se busca por el correo con el que entra a la app y se guarda.
  const { data } = await db.auth.admin.getUserById(perfil.id as string);
  const email = data.user?.email;
  if (!email) return null;

  const slackId = await lookupSlackUser(email);
  if (slackId) {
    await db.from("profiles").update({ slack_user_id: slackId }).eq("id", perfil.id);
  }
  return slackId;
}

/**
 * El mensaje: que te toca, de que cliente, el flujo completo con donde vas tu,
 * y los links al brief y al Doc. Links en el texto y no botones: un boton de
 * Slack exige un endpoint de interactividad aunque solo abra una URL.
 */
export function buildMessage({
  title,
  body,
  kind,
  recipientId,
  brief,
  nombres,
}: {
  title: string;
  body: string | null;
  kind: string;
  recipientId: string;
  brief?: Record<string, unknown>;
  nombres: Map<string, string>;
}): { text: string; blocks: unknown[] } {
  const blocks: unknown[] = [
    { type: "section", text: { type: "mrkdwn", text: `*${esc(title)}*` } },
  ];

  if (brief) {
    const cliente = (brief.clients as { name?: string } | null)?.name ?? "—";
    const canal = CHANNEL_LABEL[brief.channel as Channel] ?? "Ads";
    const detalles = [esc(cliente), canal];
    if (brief.due_date) detalles.push(`entrega ${brief.due_date as string}`);
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: detalles.join("  ·  ") }],
    });
  }

  // "Te regresaron": el motivo es lo importante, va citado y arriba del flujo.
  if (kind === "devuelto" && body) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `> ${esc(body)}` } });
  }

  if (brief) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: flowLine(brief, recipientId, nombres) },
    });

    const links = [`<${appUrl()}/client/${brief.client_id}?brief=${brief.id}|Abrir en Relevo>`];
    if (brief.doc_url) links.push(`<${brief.doc_url as string}|Abrir el Doc>`);
    blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: links.join("  ·  ") }] });
  }

  return { text: title, blocks };
}

/** ✓ Revisión — Catalina  →  ▶ *Producción — tú*  →  ○ Lanzamiento — Chris */
function flowLine(
  brief: Record<string, unknown>,
  recipientId: string,
  nombres: Map<string, string>,
): string {
  const actual = BRIEF_STATUSES.indexOf(brief.status as BriefStatus);

  return STAGES.map((stage) => {
    const owner = brief[stage.field] as string | null;
    const quien = !owner ? "sin asignar" : owner === recipientId ? "tú" : (nombres.get(owner) ?? "—");
    const i = BRIEF_STATUSES.indexOf(stage.status);
    if (i === actual) return `▶ *${stage.label} — ${esc(quien)}*`;
    return `${i < actual ? "✓" : "○"} ${stage.label} — ${esc(quien)}`;
  }).join("   →   ");
}
