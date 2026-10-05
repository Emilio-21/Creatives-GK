import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  approvalState,
  CHANNEL_LABEL,
  CHANNELS,
  nextSteps,
  normalizeDocUrl,
  STATUS_LABEL,
  stagesFor,
  type BriefStatus,
  type Channel,
} from "../../../src/lib/brief-flow";
import { adCodeFor } from "../../../src/lib/ad-code";
import { mensajeParaCliente, portalPath } from "../../../src/lib/client-requests";
import { userClient, type Env, type Props } from "./supabase";

/**
 * Lo que Claude puede hacer en Relevo. Todo corre con la sesion de quien
 * conecto: RLS decide que ve, y las reglas del flujo (transition_brief,
 * approve_brief, set_brief_owner…) son las mismas funciones de la base que usa
 * la app. Aqui no se repite ninguna regla: solo se traducen nombres a ids.
 */

type Ctx = { env: Env; props: Props; waitUntil: (p: Promise<unknown>) => void };

/** Las etapas como las dice la gente, y como se llaman en la base. */
const ETAPA = {
  copy: "borrador",
  revision: "en_revision",
  produccion: "en_produccion",
  aprobacion: "en_aprobacion",
  lanzamiento: "en_lanzamiento",
  lanzada: "lanzado",
} as const satisfies Record<string, BriefStatus>;
type Etapa = keyof typeof ETAPA;
const ETAPA_DE = Object.fromEntries(Object.entries(ETAPA).map(([k, v]) => [v, k])) as Record<
  BriefStatus,
  Etapa
>;
const ETAPAS_CON_RESPONSABLE = ["copy", "revision", "produccion", "lanzamiento"] as const;

const OPEN: BriefStatus[] = ["borrador", "en_revision", "en_produccion", "en_aprobacion", "en_lanzamiento"];

const TASK_COLUMNS =
  "id, title, angle, channel, status, client_id, doc_url, request_note, brief_date, due_date, assigned_to, writer_id, reviewer_id, producer_id, launcher_id, copy_ok_at, media_ok_at, stage_entered_at, stage_started_at, created_at, updated_at, batch_id";

type Task = {
  id: string;
  title: string;
  angle: string | null;
  channel: Channel;
  status: BriefStatus;
  client_id: string;
  doc_url: string | null;
  request_note: string | null;
  brief_date: string;
  due_date: string | null;
  assigned_to: string | null;
  writer_id: string | null;
  reviewer_id: string | null;
  producer_id: string | null;
  launcher_id: string | null;
  copy_ok_at: string | null;
  media_ok_at: string | null;
  stage_entered_at: string | null;
  stage_started_at: string | null;
  created_at: string;
  updated_at: string;
  batch_id: string | null;
};

/** Un error que Claude debe leer tal cual (no un fallo del conector). */
class UserError extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
}

/** Sin acentos ni mayusculas: "Catalína" encuentra a "catalina". */
function norm(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 1) }] };
}

function fail(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

/** Envuelve cada herramienta: un error de la base o de nombres le llega a Claude como texto. */
function run<A>(fn: (args: A) => Promise<unknown>) {
  return async (args: A) => {
    try {
      return ok(await fn(args));
    } catch (error) {
      return fail(error);
    }
  };
}

export function registerTools(server: McpServer, ctx: Ctx) {
  const db: SupabaseClient = userClient(ctx.env, ctx.props.accessToken);
  const app = ctx.env.APP_URL;

  // ---- Lo que se consulta seguido, una vez por llamada ----

  let teamCache: { id: string; name: string; role: string }[] | null = null;
  async function team() {
    if (!teamCache) {
      const { data, error } = await db.from("profiles").select("id, full_name, role").order("full_name");
      if (error) throw new Error(error.message);
      teamCache = (data ?? []).map((p) => ({
        id: p.id as string,
        name: (p.full_name as string | null) ?? "sin nombre",
        role: p.role as string,
      }));
    }
    return teamCache;
  }

  let clientsCache: { id: string; name: string; meta: string | null }[] | null = null;
  async function clients() {
    if (!clientsCache) {
      const { data, error } = await db
        .from("clients")
        .select("id, name, meta_ad_account_id")
        .is("archived_at", null)
        .order("name");
      if (error) throw new Error(error.message);
      clientsCache = (data ?? []).map((c) => ({
        id: c.id as string,
        name: c.name as string,
        meta: (c.meta_ad_account_id as string | null) ?? null,
      }));
    }
    return clientsCache;
  }

  const nameOf = async (id: string | null) =>
    id ? ((await team()).find((p) => p.id === id)?.name ?? "—") : null;
  const clientName = async (id: string) => (await clients()).find((c) => c.id === id)?.name ?? "—";

  async function resolveClient(ref: string) {
    const all = await clients();
    const q = norm(ref);
    const exact = all.filter((c) => norm(c.name) === q || c.id === ref);
    const matches = exact.length ? exact : all.filter((c) => norm(c.name).includes(q));
    if (matches.length === 1) return matches[0];
    const lista = all.map((c) => c.name).join(", ");
    if (matches.length === 0) throw new UserError(`No hay un cliente "${ref}". Clientes: ${lista}.`);
    throw new UserError(`"${ref}" coincide con varios clientes: ${matches.map((c) => c.name).join(", ")}.`);
  }

  async function resolvePerson(ref: string) {
    const all = await team();
    const q = norm(ref);
    if (["yo", "mi", "mí", "me", "a mi"].includes(q)) {
      const me = all.find((p) => p.id === ctx.props.userId);
      if (me) return me;
    }
    const exact = all.filter((p) => norm(p.name) === q || p.id === ref);
    const starts = all.filter((p) => norm(p.name).split(/\s+/).some((part) => part.startsWith(q)));
    const contains = all.filter((p) => norm(p.name).includes(q));
    const matches = exact.length ? exact : starts.length ? starts : contains;
    if (matches.length === 1) return matches[0];
    const lista = all.map((p) => p.name).join(", ");
    if (matches.length === 0) throw new UserError(`No hay nadie llamado "${ref}" en el equipo. Equipo: ${lista}.`);
    throw new UserError(`"${ref}" coincide con varias personas: ${matches.map((p) => p.name).join(", ")}.`);
  }

  /** Una tarea por id o por parte de su titulo (prefiere las abiertas). */
  async function resolveTask(ref: string): Promise<Task> {
    const query = db.from("briefs").select(TASK_COLUMNS).is("archived_at", null);
    if (UUID.test(ref.trim())) {
      const { data, error } = await query.eq("id", ref.trim()).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new UserError("Esa tarea no existe o no la puedes ver.");
      return data as Task;
    }
    const { data, error } = await query.ilike("title", `%${ref.trim()}%`).limit(20);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Task[];
    const abiertas = rows.filter((t) => OPEN.includes(t.status));
    const matches = abiertas.length ? abiertas : rows;
    if (matches.length === 1) return matches[0];
    if (matches.length === 0) throw new UserError(`No encontré una tarea con "${ref}". Usa buscar_tareas.`);
    throw new UserError(
      `"${ref}" coincide con varias tareas; usa el id:\n` +
        matches
          .slice(0, 10)
          .map((t) => `- ${t.id} · ${t.title} (${STATUS_LABEL[t.status]})`)
          .join("\n"),
    );
  }

  /** La tarea como la lee Claude: nombres, no ids; etapas en palabras. */
  async function summary(t: Task) {
    const holders =
      t.status === "en_aprobacion"
        ? approvalState(t).pending
        : ([t.assigned_to].filter(Boolean) as string[]);
    return {
      id: t.id,
      titulo: t.title,
      cliente: await clientName(t.client_id),
      canal: CHANNEL_LABEL[t.channel],
      etapa: ETAPA_DE[t.status],
      etapa_texto: STATUS_LABEL[t.status],
      a_cargo: (await Promise.all(holders.map(nameOf))).join(" y ") || null,
      angulo: t.angle,
      entrega: t.due_date,
      vencida: Boolean(t.due_date && t.due_date < today() && t.status !== "lanzado"),
      en_etapa_desde: t.stage_entered_at,
      empezada: t.status === "en_aprobacion" ? null : Boolean(t.stage_started_at),
      link: `${app}/client/${t.client_id}?brief=${t.id}`,
    };
  }

  /** Lo que se escribio en la base ya trae su aviso: Slack sale al momento. */
  function slackSoon() {
    if (!ctx.env.CRON_SECRET) return;
    ctx.waitUntil(
      fetch(`${app}/api/cron/slack`, {
        headers: { authorization: `Bearer ${ctx.env.CRON_SECRET}` },
      }).catch(() => undefined),
    );
  }

  async function rpc(fn: string, params: Record<string, unknown>) {
    const { data, error } = await db.rpc(fn, params);
    if (error) throw new UserError(error.message);
    return data;
  }

  const readOnly = { readOnlyHint: true, openWorldHint: false } as const;
  const write = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

  // ---- Consultar ----

  server.registerTool(
    "mi_trabajo",
    {
      title: "Mi trabajo",
      description:
        "Lo que le toca ahora a quien conectó Relevo: tareas a su cargo, aprobaciones pendientes y sus pedidos al cliente abiertos. Úsala para '¿qué tengo pendiente?'.",
      inputSchema: {},
      annotations: readOnly,
    },
    run(async () => {
      const me = ctx.props.userId;
      const [{ data: mias, error }, { data: pedidos }] = await Promise.all([
        db
          .from("briefs")
          .select(TASK_COLUMNS)
          .is("archived_at", null)
          .or(
            [
              `and(assigned_to.eq.${me},status.in.(borrador,en_revision,en_produccion,en_lanzamiento))`,
              `and(status.eq.en_aprobacion,reviewer_id.eq.${me},copy_ok_at.is.null)`,
              `and(status.eq.en_aprobacion,launcher_id.eq.${me},media_ok_at.is.null)`,
            ].join(","),
          )
          .order("stage_entered_at"),
        db
          .from("client_requests")
          .select("id, title, client_id, due_date, created_at, client_request_files(count)")
          .eq("created_by", me)
          .is("closed_at", null)
          .order("created_at"),
      ]);
      if (error) throw new Error(error.message);
      const yo = (await team()).find((p) => p.id === me);
      return {
        quien: yo ? { nombre: yo.name, rol: yo.role } : { email: ctx.props.email },
        hoy: today(),
        lo_tuyo_ahora: await Promise.all(((mias ?? []) as Task[]).map(summary)),
        esperando_al_cliente: await Promise.all(
          (pedidos ?? []).map(async (r) => ({
            id: r.id,
            que: r.title,
            cliente: await clientName(r.client_id as string),
            para_cuando: r.due_date,
            archivos_recibidos:
              (r.client_request_files as unknown as { count: number }[] | null)?.[0]?.count ?? 0,
            link: `${app}/client/${r.client_id}#pedidos`,
          })),
        ),
      };
    }),
  );

  server.registerTool(
    "buscar_tareas",
    {
      title: "Buscar tareas",
      description:
        "Lista tareas del equipo con filtros. Sin filtros: las abiertas de todos los clientes. 'atoradas' = vencidas, sin responsable o sin moverse en 2+ días.",
      inputSchema: {
        cliente: z.string().optional().describe("Nombre del cliente (o parte)"),
        etapa: z.enum(Object.keys(ETAPA) as [Etapa, ...Etapa[]]).optional(),
        persona: z.string().optional().describe("Quien la tiene a cargo ahora, o 'yo'"),
        texto: z.string().optional().describe("Parte del título o del ángulo"),
        canal: z.enum(CHANNELS as unknown as [Channel, ...Channel[]]).optional(),
        solo_atoradas: z.boolean().optional(),
        incluir_lanzadas: z.boolean().optional().describe("Por defecto solo abiertas"),
        limite: z.number().int().min(1).max(100).optional(),
      },
      annotations: readOnly,
    },
    run(async (args: {
      cliente?: string;
      etapa?: Etapa;
      persona?: string;
      texto?: string;
      canal?: Channel;
      solo_atoradas?: boolean;
      incluir_lanzadas?: boolean;
      limite?: number;
    }) => {
      let q = db.from("briefs").select(TASK_COLUMNS).is("archived_at", null);
      if (args.cliente) q = q.eq("client_id", (await resolveClient(args.cliente)).id);
      if (args.etapa) q = q.eq("status", ETAPA[args.etapa]);
      else if (!args.incluir_lanzadas) q = q.in("status", OPEN);
      if (args.canal) q = q.eq("channel", args.canal);
      if (args.texto) {
        const t = args.texto.replace(/[,()]/g, " ");
        q = q.or(`title.ilike.%${t}%,angle.ilike.%${t}%`);
      }
      const { data, error } = await q.order("updated_at", { ascending: false }).limit(200);
      if (error) throw new Error(error.message);
      let rows = (data ?? []) as Task[];

      if (args.persona) {
        const p = await resolvePerson(args.persona);
        rows = rows.filter((t) =>
          t.status === "en_aprobacion" ? approvalState(t).pending.includes(p.id) : t.assigned_to === p.id,
        );
      }
      if (args.solo_atoradas) {
        const limite = Date.now() - 2 * 86_400_000;
        rows = rows.filter((t) => {
          if (!OPEN.includes(t.status)) return false;
          const quieta = t.stage_entered_at ? new Date(t.stage_entered_at).getTime() < limite : false;
          const sinNadie = t.status === "en_aprobacion" ? approvalState(t).pending.length === 0 : !t.assigned_to;
          return sinNadie || (t.due_date !== null && t.due_date < today()) || (quieta && !t.stage_started_at);
        });
      }
      const total = rows.length;
      rows = rows.slice(0, args.limite ?? 30);
      return { total, mostrando: rows.length, tareas: await Promise.all(rows.map(summary)) };
    }),
  );

  server.registerTool(
    "ver_tarea",
    {
      title: "Ver tarea",
      description:
        "Todo de una tarea: responsables por etapa, aprobaciones, el pedido, Doc, lo que puede seguir, historial y comentarios. Acepta el id o parte del título.",
      inputSchema: { tarea: z.string().describe("Id de la tarea o parte de su título") },
      annotations: readOnly,
    },
    run(async ({ tarea }: { tarea: string }) => {
      const t = await resolveTask(tarea);
      const [{ data: eventos }, { data: comentarios }] = await Promise.all([
        db
          .from("brief_events")
          .select("from_status, to_status, kind, note, actor, assigned_to, created_at")
          .eq("brief_id", t.id)
          .order("created_at", { ascending: false })
          .limit(15),
        db
          .from("brief_comments")
          .select("author, kind, body, created_at")
          .eq("brief_id", t.id)
          .order("created_at", { ascending: false })
          .limit(15),
      ]);
      const { copyOk, mediaOk } = approvalState(t);
      return {
        ...(await summary(t)),
        el_pedido: t.request_note,
        doc: t.doc_url,
        fecha: t.brief_date,
        responsables: Object.fromEntries(
          await Promise.all(
            stagesFor(t.channel)
              .filter((s) => s.field)
              .map(async (s) => [ETAPA_DE[s.status], await nameOf(t[s.field!])] as const),
          ),
        ),
        aprobacion:
          t.status === "en_aprobacion"
            ? { copy: await nameOf(t.reviewer_id), copy_ok: copyOk, media: await nameOf(t.launcher_id), media_ok: mediaOk }
            : null,
        etapas_del_canal: stagesFor(t.channel).map((s) => ETAPA_DE[s.status]),
        puede_seguir: nextSteps(t.channel, t.status).map((s) => ({
          a_etapa: ETAPA_DE[s.to],
          boton: s.label,
          pide_motivo: Boolean(s.back),
        })),
        historial: await Promise.all(
          (eventos ?? []).map(async (e) => ({
            cuando: e.created_at,
            quien: await nameOf(e.actor as string),
            de: e.from_status ? ETAPA_DE[e.from_status as BriefStatus] ?? e.from_status : null,
            a: ETAPA_DE[e.to_status as BriefStatus] ?? e.to_status,
            tipo: e.kind,
            a_cargo: await nameOf(e.assigned_to as string | null),
            nota: e.note,
          })),
        ),
        comentarios: await Promise.all(
          (comentarios ?? []).map(async (c) => ({
            cuando: c.created_at,
            quien: await nameOf(c.author as string),
            tipo: c.kind,
            texto: c.body,
          })),
        ),
      };
    }),
  );

  server.registerTool(
    "listar_clientes",
    {
      title: "Clientes",
      description: "Los clientes activos, con cuántas tareas abiertas tienen y si su cuenta de Meta está conectada.",
      inputSchema: {},
      annotations: readOnly,
    },
    run(async () => {
      const { data } = await db.from("briefs").select("client_id").is("archived_at", null).in("status", OPEN);
      const abiertas = new Map<string, number>();
      for (const r of data ?? []) abiertas.set(r.client_id as string, (abiertas.get(r.client_id as string) ?? 0) + 1);
      return (await clients()).map((c) => ({
        nombre: c.name,
        tareas_abiertas: abiertas.get(c.id) ?? 0,
        meta_conectado: Boolean(c.meta),
        link: `${app}/client/${c.id}`,
      }));
    }),
  );

  server.registerTool(
    "listar_equipo",
    {
      title: "Equipo",
      description: "Las personas del equipo y su área (admin, media, copy, design, tech, member).",
      inputSchema: {},
      annotations: readOnly,
    },
    run(async () =>
      (await team()).map((p) => ({ nombre: p.name, area: p.role, eres_tu: p.id === ctx.props.userId })),
    ),
  );

  server.registerTool(
    "metricas_cliente",
    {
      title: "Métricas de un cliente",
      description:
        "Creativos de un cliente con sus métricas de Meta (gasto, CTR, CPA…). Ordena por cpa (mejores primero), ctr, gasto o recientes. Las métricas se sincronizan una vez al día.",
      inputSchema: {
        cliente: z.string(),
        orden: z.enum(["cpa", "ctr", "gasto", "recientes"]).optional(),
        limite: z.number().int().min(1).max(50).optional(),
        solo_lanzados: z.boolean().optional().describe("Por defecto sí"),
      },
      annotations: readOnly,
    },
    run(async (args: { cliente: string; orden?: "cpa" | "ctr" | "gasto" | "recientes"; limite?: number; solo_lanzados?: boolean }) => {
      const c = await resolveClient(args.cliente);
      const { data: creativos, error } = await db
        .from("creatives")
        .select("id, display_name, format, media_type, created_at, batches(name)")
        .eq("client_id", c.id)
        .is("parent_id", null)
        .is("archived_at", null);
      if (error) throw new Error(error.message);
      const ids = (creativos ?? []).map((x) => x.id as string);
      const { data: stats } = ids.length
        ? await db.from("creative_stats").select("*").in("id", ids)
        : { data: [] };
      const porId = new Map((stats ?? []).map((s) => [s.id as string, s]));

      let filas = (creativos ?? []).map((x) => {
        const s = porId.get(x.id as string) ?? {};
        return {
          nombre: x.display_name as string,
          codigo: adCodeFor(x.id as string),
          batch: (x.batches as unknown as { name: string } | null)?.name ?? null,
          formato: x.format,
          tipo: x.media_type,
          subido: x.created_at,
          lanzado: Boolean(s.is_published),
          activo: Number(s.active_launch_count ?? 0) > 0,
          gasto: s.total_spend ?? null,
          impresiones: s.total_impressions ?? null,
          clics: s.total_clicks ?? null,
          resultados: s.total_results ?? null,
          ctr_pct: s.ctr ?? null,
          cpm: s.cpm ?? null,
          cpc: s.cpc ?? null,
          cpa: s.cpa ?? null,
          link: `${app}/creative/${x.id}`,
        };
      });
      const sinLanzar = filas.filter((f) => !f.lanzado).length;
      if (args.solo_lanzados !== false) filas = filas.filter((f) => f.lanzado);

      const orden = args.orden ?? "cpa";
      const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
      filas.sort((a, b) => {
        if (orden === "recientes") return String(b.subido).localeCompare(String(a.subido));
        const [x, y] =
          orden === "cpa" ? [num(a.cpa), num(b.cpa)] : orden === "ctr" ? [num(b.ctr_pct), num(a.ctr_pct)] : [num(b.gasto), num(a.gasto)];
        if (x === null) return 1;
        if (y === null) return -1;
        return x - y;
      });

      const suma = (k: "gasto" | "impresiones" | "clics" | "resultados") =>
        filas.reduce((acc, f) => acc + (num(f[k]) ?? 0), 0);
      const r2 = (n: number) => Math.round(n * 100) / 100;
      const gasto = r2(suma("gasto"));
      const impresiones = suma("impresiones");
      const resultados = suma("resultados");
      return {
        cliente: c.name,
        meta_conectado: Boolean(c.meta),
        totales: {
          creativos_lanzados: filas.length,
          sin_lanzar: sinLanzar,
          gasto,
          impresiones,
          clics: suma("clics"),
          resultados,
          // De los totales, una vez: nunca promedio de promedios. Mismas unidades
          // que cada creativo (CTR en porcentaje, como creative_stats).
          ctr_pct: impresiones ? r2((suma("clics") / impresiones) * 100) : null,
          cpa: resultados ? r2(gasto / resultados) : null,
        },
        creativos: filas.slice(0, args.limite ?? 15),
      };
    }),
  );

  server.registerTool(
    "pedidos_al_cliente",
    {
      title: "Pedidos al cliente",
      description: "Lo que se le pidió a los clientes que suban (videos, fotos…), con lo que ya llegó. Por defecto solo los abiertos.",
      inputSchema: { cliente: z.string().optional(), incluir_cerrados: z.boolean().optional() },
      annotations: readOnly,
    },
    run(async (args: { cliente?: string; incluir_cerrados?: boolean }) => {
      let q = db
        .from("client_requests")
        .select("id, title, instructions, due_date, client_id, created_by, created_at, delivered_at, closed_at, client_request_files(file_name, size_bytes, created_at)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (args.cliente) q = q.eq("client_id", (await resolveClient(args.cliente)).id);
      if (!args.incluir_cerrados) q = q.is("closed_at", null);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return Promise.all(
        (data ?? []).map(async (r) => ({
          id: r.id,
          que: r.title,
          instrucciones: r.instructions,
          cliente: await clientName(r.client_id as string),
          pidio: await nameOf(r.created_by as string),
          para_cuando: r.due_date,
          estado: r.closed_at ? "cerrado" : r.delivered_at ? "recibido" : "esperando",
          archivos: ((r.client_request_files ?? []) as Record<string, unknown>[]).map((f) => f.file_name),
          link: `${app}/client/${r.client_id}#pedidos`,
        })),
      );
    }),
  );

  // ---- Hacer ----

  server.registerTool(
    "pedir_copy",
    {
      title: "Pedir copy",
      description:
        "Crea una tarea nueva pidiendo copy: queda en la etapa de copy a cargo de quien se elija (por defecto, la primera persona de copy) y le llega el aviso. Copy después define canal, Doc, ángulo y responsables.",
      inputSchema: {
        cliente: z.string(),
        que_se_necesita: z.string().max(140).describe("Una línea: qué se necesita"),
        nota: z.string().max(2000).optional().describe("Contexto para copy"),
        para_cuando: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("AAAA-MM-DD"),
        a_quien: z.string().optional().describe("Quién escribe el copy"),
      },
      annotations: write,
    },
    run(async (args: { cliente: string; que_se_necesita: string; nota?: string; para_cuando?: string; a_quien?: string }) => {
      const c = await resolveClient(args.cliente);
      const writer = args.a_quien
        ? await resolvePerson(args.a_quien)
        : (await team()).find((p) => p.role === "copy");
      if (!writer) throw new UserError("No hay nadie con área Copy: dime a quién se le pide.");
      const id = (await rpc("request_copy", {
        p_client: c.id,
        p_title: args.que_se_necesita,
        p_note: args.nota ?? null,
        p_due: args.para_cuando ?? null,
        p_writer: writer.id,
      })) as string;
      slackSoon();
      return { listo: true, tarea_id: id, a_cargo: writer.name, link: `${app}/client/${c.id}?brief=${id}` };
    }),
  );

  server.registerTool(
    "mover_tarea",
    {
      title: "Mover tarea de etapa",
      description:
        "Pasa una tarea a otra etapa, con las mismas reglas que los botones de la app (avisa a quien sigue). Regresar trabajo pide 'motivo'. Entrar a una etapa sin responsable pide 'persona'. Un admin puede saltar etapas (queda registrado). Para aprobar en aprobación usa aprobar_tarea.",
      inputSchema: {
        tarea: z.string().describe("Id o parte del título"),
        a_etapa: z.enum(Object.keys(ETAPA) as [Etapa, ...Etapa[]]),
        persona: z.string().optional().describe("Quién se encarga de la etapa nueva, si no tiene"),
        motivo: z.string().max(2000).optional(),
      },
      annotations: write,
    },
    run(async (args: { tarea: string; a_etapa: Etapa; persona?: string; motivo?: string }) => {
      const t = await resolveTask(args.tarea);
      const persona = args.persona ? await resolvePerson(args.persona) : null;
      const llego = (await rpc("transition_brief", {
        p_brief: t.id,
        p_to: ETAPA[args.a_etapa],
        p_assigned: persona?.id ?? null,
        p_note: args.motivo ?? null,
      })) as BriefStatus;
      slackSoon();
      const nueva = await resolveTask(t.id);
      return { listo: true, quedo_en: ETAPA_DE[llego], tarea: await summary(nueva) };
    }),
  );

  server.registerTool(
    "aprobar_tarea",
    {
      title: "Dar visto bueno",
      description:
        "Da el visto bueno de quien conectó a una tarea en aprobación (copy o media). Con los dos, pasa sola a lanzamiento. Un admin que no aprueba puede aprobar por todos (queda registrado).",
      inputSchema: { tarea: z.string(), nota: z.string().max(2000).optional() },
      annotations: write,
    },
    run(async (args: { tarea: string; nota?: string }) => {
      const t = await resolveTask(args.tarea);
      const estado = (await rpc("approve_brief", { p_brief: t.id, p_note: args.nota ?? null })) as BriefStatus;
      slackSoon();
      return { listo: true, quedo_en: ETAPA_DE[estado], tarea: await summary(await resolveTask(t.id)) };
    }),
  );

  server.registerTool(
    "cambiar_responsable",
    {
      title: "Cambiar responsable",
      description: "Cambia quién se encarga de una etapa de la tarea. Si es la etapa en curso, le llega el aviso a la persona nueva.",
      inputSchema: {
        tarea: z.string(),
        etapa: z.enum(ETAPAS_CON_RESPONSABLE),
        persona: z.string().describe("Nombre, o 'nadie' para dejarla sin asignar (no vale en la etapa en curso)"),
      },
      annotations: write,
    },
    run(async (args: { tarea: string; etapa: (typeof ETAPAS_CON_RESPONSABLE)[number]; persona: string }) => {
      const t = await resolveTask(args.tarea);
      const p = norm(args.persona) === "nadie" ? null : await resolvePerson(args.persona);
      await rpc("set_brief_owner", { p_brief: t.id, p_stage: ETAPA[args.etapa], p_profile: p?.id ?? null });
      slackSoon();
      return { listo: true, etapa: args.etapa, ahora: p?.name ?? "sin asignar", tarea: await summary(await resolveTask(t.id)) };
    }),
  );

  server.registerTool(
    "comentar_tarea",
    {
      title: "Comentar en una tarea",
      description: "Deja un comentario en el hilo de la tarea; avisa a quienes están en ella.",
      inputSchema: { tarea: z.string(), comentario: z.string().min(1).max(4000) },
      annotations: write,
    },
    run(async (args: { tarea: string; comentario: string }) => {
      const t = await resolveTask(args.tarea);
      await rpc("add_brief_comment", { p_brief: t.id, p_body: args.comentario });
      slackSoon();
      return { listo: true, link: `${app}/client/${t.client_id}?brief=${t.id}` };
    }),
  );

  server.registerTool(
    "editar_tarea",
    {
      title: "Editar tarea",
      description:
        "Cambia datos de una tarea: título, ángulo, link del Doc, fecha de entrega, el pedido o el canal. Solo cambia lo que mandes. El canal solo se puede cambiar a uno que tenga la etapa en la que va.",
      inputSchema: {
        tarea: z.string(),
        titulo: z.string().max(140).optional(),
        angulo: z.string().max(80).optional().describe("Vacío para quitarlo"),
        link_doc: z.string().optional().describe("Vacío para quitarlo"),
        entrega: z.string().optional().describe("AAAA-MM-DD, o vacío para quitarla"),
        el_pedido: z.string().max(2000).optional(),
        canal: z.enum(CHANNELS as unknown as [Channel, ...Channel[]]).optional(),
      },
      annotations: write,
    },
    run(async (args: { tarea: string; titulo?: string; angulo?: string; link_doc?: string; entrega?: string; el_pedido?: string; canal?: Channel }) => {
      const t = await resolveTask(args.tarea);
      const patch: Record<string, unknown> = { updated_by: ctx.props.userId, updated_at: new Date().toISOString() };
      if (args.titulo !== undefined) {
        if (!args.titulo.trim()) throw new UserError("El título no puede quedar vacío.");
        patch.title = args.titulo.trim();
      }
      if (args.angulo !== undefined) patch.angle = args.angulo.trim() || null;
      if (args.link_doc !== undefined) {
        try {
          patch.doc_url = args.link_doc.trim() ? normalizeDocUrl(args.link_doc) : null;
        } catch (error) {
          throw new UserError((error as Error).message);
        }
      }
      if (args.entrega !== undefined) {
        if (args.entrega && !/^\d{4}-\d{2}-\d{2}$/.test(args.entrega)) throw new UserError("La entrega va como AAAA-MM-DD.");
        patch.due_date = args.entrega || null;
      }
      if (args.el_pedido !== undefined) patch.request_note = args.el_pedido.trim() || null;
      if (args.canal !== undefined) patch.channel = args.canal;
      if (Object.keys(patch).length === 2) throw new UserError("No mandaste nada que cambiar.");

      const { error, count } = await db.from("briefs").update(patch, { count: "exact" }).eq("id", t.id);
      if (error) throw new UserError(error.message);
      if (!count) throw new UserError("No se pudo guardar la tarea.");
      return { listo: true, tarea: await summary(await resolveTask(t.id)) };
    }),
  );

  server.registerTool(
    "pedir_al_cliente",
    {
      title: "Pedir archivos al cliente",
      description:
        "Crea un pedido para que el cliente suba archivos (grabar ads, fotos, logo…) desde su link, sin cuenta. Regresa el mensaje listo para mandarle por WhatsApp o correo; Relevo no se lo manda solo.",
      inputSchema: {
        cliente: z.string(),
        que_necesitas: z.string().max(140),
        instrucciones: z.string().max(4000).optional().describe("El cliente lo lee tal cual"),
        para_cuando: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      },
      annotations: write,
    },
    run(async (args: { cliente: string; que_necesitas: string; instrucciones?: string; para_cuando?: string }) => {
      const c = await resolveClient(args.cliente);
      const titulo = args.que_necesitas.trim();
      if (!titulo) throw new UserError("Escribe qué le pides al cliente.");
      const { data, error } = await db
        .from("client_requests")
        .insert({
          client_id: c.id,
          created_by: ctx.props.userId,
          title: titulo,
          instructions: args.instrucciones?.trim() ?? "",
          due_date: args.para_cuando ?? null,
        })
        .select("id")
        .single();
      if (error) throw new UserError(error.message);
      const token = (await rpc("client_portal_token", { p_client: c.id, p_renew: false })) as string;
      const url = `${app}${portalPath(token)}`;
      return {
        listo: true,
        pedido_id: data.id,
        link_del_cliente: url,
        mensaje_para_el_cliente: mensajeParaCliente({ titulo, fecha: args.para_cuando ?? null, url }),
      };
    }),
  );
}
