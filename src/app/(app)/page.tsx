import Link from "next/link";
import { redirect } from "next/navigation";
import { TaskList } from "@/components/task-list";
import { listMyTasks, listTeam } from "@/app/(app)/client/assignment-actions";
import { unwrap } from "@/lib/action-result";
import { CHANNEL_LABEL, elapsed, STATUS_LABEL, type BriefStatus } from "@/lib/brief-flow";
import { DIAS_ATORADO, getHomeData, type HomeBrief } from "@/lib/home";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Mi trabajo · Relevo" };

/**
 * "Mi trabajo": lo que alguien se pregunta al abrir la app, que hago ahora y
 * que esta atorado. Arriba lo que se hace, abajo lo que se sabe. El inventario
 * de creativos vive en cada cliente.
 */
export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, tasks, team, home] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    listMyTasks(),
    unwrap(listTeam()),
    getHomeData(user.id),
  ]);

  const nombre =
    ((profile?.full_name as string | null) ?? user.email?.split("@")[0] ?? "").split(" ")[0];

  return (
    <div className="space-y-12">
      <div>
        <h1 className="font-heading font-extralight tracking-tight text-4xl">Hola, {nombre}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {resumen(tasks.length, home.stuck.length)}
        </p>
      </div>

      <Block
        title="Lo tuyo, ahora"
        primary
        count={tasks.length}
      >
        {tasks.length === 0 ? (
          <Empty>Nada en tus manos.</Empty>
        ) : (
          <TaskList tasks={tasks} team={team} />
        )}
      </Block>

      {/* Lo de abajo se consulta, no se hace: va junto y con menos peso. */}
      <div className="space-y-8">
        <Block title="Lo que mandaste" count={home.sent.length}>
          {home.sent.length === 0 ? (
            <Empty>No tienes briefs en manos de alguien más.</Empty>
          ) : (
            <ul className="divide-y rounded-xl border">
              {home.sent.map((brief) => (
                <BriefLine key={brief.id} brief={brief} />
              ))}
            </ul>
          )}
        </Block>

        <Block
          title="El equipo"
          action={
            // En movil el Resumen no tiene pestaña propia: se llega desde aqui.
            <Link href="/dashboard" className="text-xs text-primary hover:underline">
              Ver resumen
            </Link>
          }
        >
          <Pipeline counts={home.pipeline} />

          <div className="mt-4">
            <h3 className="mb-2 text-sm font-medium">
              Atorado{" "}
              <span className="font-mono text-xs font-normal text-muted-foreground">
                {home.stuck.length}
              </span>
            </h3>
            {home.stuck.length === 0 ? (
              <Empty>Nada atorado. Todo lo abierto se movió en los últimos {DIAS_ATORADO} días.</Empty>
            ) : (
              <ul className="divide-y rounded-xl border">
                {home.stuck.map((brief) => (
                  <BriefLine key={brief.id} brief={brief} reason={brief.reason} />
                ))}
              </ul>
            )}
          </div>
        </Block>
      </div>
    </div>
  );
}

function resumen(pendientes: number, atorados: number): string {
  const partes = [
    pendientes === 0
      ? "No tienes pendientes"
      : `Tienes ${pendientes} pendiente${pendientes === 1 ? "" : "s"}`,
  ];
  if (atorados > 0) partes.push(`${atorados} atorado${atorados === 1 ? "" : "s"} en el equipo`);
  return partes.join(" · ") + ".";
}

function Block({
  title,
  count,
  action,
  primary = false,
  children,
}: {
  title: string;
  count?: number;
  action?: React.ReactNode;
  /** El bloque de lo que se hace: manda sobre los que solo informan. */
  primary?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className={`flex items-baseline justify-between gap-2 ${primary ? "mb-4" : "mb-2"}`}>
        <h2
          className={`font-heading font-extralight tracking-tight ${
            primary ? "text-3xl" : "text-xl text-muted-foreground"
          }`}
        >
          {title}
          {count !== undefined && count > 0 ? (
            <span className="ml-2 font-mono text-sm font-normal text-muted-foreground">
              {count}
            </span>
          ) : null}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">{children}</p>
  );
}

/** Un brief en una linea: donde va, con quien y desde cuando. */
function BriefLine({ brief, reason }: { brief: HomeBrief; reason?: string }) {
  return (
    <li>
      <Link
        href={`/client/${brief.clientId}?brief=${brief.id}`}
        className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2.5 text-sm transition-colors hover:bg-muted/50"
      >
        <span className="shrink-0 rounded border px-1 py-px font-mono text-xs text-muted-foreground">
          {CHANNEL_LABEL[brief.channel]}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">{brief.title}</span>
        <span className="text-xs text-muted-foreground">
          {brief.clientName} · {STATUS_LABEL[brief.status]}
          {brief.assigneeName ? ` con ${brief.assigneeName}` : ""}
          {brief.enteredAt ? ` · ${elapsed(brief.enteredAt)}` : ""}
        </span>
        {reason ? (
          <span className="text-xs text-destructive">{reason}</span>
        ) : !brief.assigneeName ? (
          <span className="text-xs text-destructive">sin responsable</span>
        ) : (
          <span className={`text-xs ${brief.startedAt ? "text-foreground" : "text-muted-foreground"}`}>
            {brief.startedAt ? "● en progreso" : "○ sin empezar"}
          </span>
        )}
      </Link>
    </li>
  );
}

const PIPELINE: { status: BriefStatus; label: string }[] = [
  { status: "borrador", label: STATUS_LABEL.borrador },
  { status: "en_revision", label: STATUS_LABEL.en_revision },
  { status: "en_produccion", label: STATUS_LABEL.en_produccion },
  { status: "en_lanzamiento", label: STATUS_LABEL.en_lanzamiento },
  { status: "lanzado", label: "Lanzados esta semana" },
];

/**
 * La linea completa en una franja: cuantos briefs hay en cada etapa. Es
 * contexto, no tarea, asi que no lleva cajas ni numeros grandes que compitan
 * con los pendientes. Los ceros se apagan.
 */
function Pipeline({ counts }: { counts: Record<BriefStatus, number> }) {
  return (
    <ol className="flex flex-wrap items-baseline gap-x-5 gap-y-1.5 rounded-xl border px-4 py-2.5 text-sm">
      {PIPELINE.map((step, index) => (
        <li
          key={step.status}
          className={`flex items-baseline gap-1.5 ${
            counts[step.status] === 0 ? "text-muted-foreground/70" : ""
          }`}
        >
          {index > 0 ? (
            // En angosto la franja se parte y una flecha al inicio del renglon
            // no apunta a nada: ahi basta el espacio.
            <span aria-hidden className="mr-3.5 hidden text-muted-foreground/50 sm:inline">
              →
            </span>
          ) : null}
          <span className={counts[step.status] === 0 ? "" : "text-muted-foreground"}>
            {step.label}
          </span>
          <span className="font-medium tabular-nums">{counts[step.status]}</span>
        </li>
      ))}
    </ol>
  );
}
