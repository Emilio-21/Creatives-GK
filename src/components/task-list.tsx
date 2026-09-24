"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  moveBrief as moveBriefAction,
  startBriefStage as startBriefStageAction,
  type MyTask,
  type TeamMember,
} from "@/app/(app)/client/assignment-actions";
import {
  CHANNEL_LABEL,
  elapsed,
  FINISH_LABEL,
  STAGES,
  STATUS_LABEL,
  type BriefStatus,
  type StageStatus,
} from "@/lib/brief-flow";
import { roleLabel } from "@/lib/roles";
import { unwrapped } from "@/lib/action-result";
import { today } from "@/lib/dates";

// Las acciones regresan el error como dato; esto lo vuelve a lanzar con su mensaje real.
const moveBrief = unwrapped(moveBriefAction);
const startBriefStage = unwrapped(startBriefStageAction);

/**
 * A donde pasa cada etapa al terminarla, y quien la recibe (si hay que elegirlo).
 * Email y mensaje van de revisión directo a lanzamiento. Aprobación no se
 * termina desde aqui: se aprueba dentro de la tarea, viendo los diseños.
 */
function nextFor(task: MyTask): { to: BriefStatus; owner: "producerId" | "launcherId" | null } | null {
  switch (task.status) {
    case "en_revision":
      return task.channel === "ads"
        ? { to: "en_produccion", owner: "producerId" }
        : { to: "en_lanzamiento", owner: "launcherId" };
    case "en_produccion":
      return { to: "en_aprobacion", owner: null };
    case "en_lanzamiento":
      return { to: "lanzado", owner: null };
    default:
      return null;
  }
}

export function TaskList({ tasks, team }: { tasks: MyTask[]; team: TeamMember[] }) {
  if (tasks.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        No tienes nada pendiente. Cuando te toque una etapa de una tarea, aparece aquí.
      </p>
    );
  }

  // Agrupado por cliente, respetando el orden de urgencia que ya trae la lista.
  const groups = new Map<string, { name: string; tasks: MyTask[] }>();
  for (const task of tasks) {
    const group = groups.get(task.clientId) ?? { name: task.clientName, tasks: [] };
    group.tasks.push(task);
    groups.set(task.clientId, group);
  }

  return (
    <div className="space-y-6">
      {[...groups.entries()].map(([clientId, group]) => (
        <section key={clientId} className="space-y-2">
          <h3 className="flex items-baseline gap-2 text-sm font-semibold">
            <Link href={`/client/${clientId}`} className="hover:underline">
              {group.name}
            </Link>
            <span className="font-mono text-[11px] font-normal text-muted-foreground">
              {group.tasks.length}
            </span>
          </h3>
          <ul className="space-y-2">
            {group.tasks.map((task) => (
              <TaskRow key={task.id} task={task} team={team} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function TaskRow({ task, team }: { task: MyTask; team: TeamMember[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [eligiendo, setEligiendo] = useState(false);
  const [persona, setPersona] = useState("");

  const stage = task.status as StageStatus;
  const next = nextFor(task);
  const nextStage = STAGES.find((s) => s.status === next?.to);
  const faltaSiguiente = next?.owner != null && !task[next.owner];
  const href = `/client/${task.clientId}?brief=${task.id}`;
  const atrasado = task.dueDate !== null && task.dueDate < today();

  // Producir un ad es subir los diseños y publicarlos: eso cierra el batch, y
  // se hace dentro del brief. Terminar desde aqui lo dejaria sin cerrar.
  const terminaDentro = stage === "en_produccion" && task.channel === "ads";
  const aprobando = stage === "en_aprobacion";

  function run(action: () => Promise<unknown>, done: string) {
    startTransition(async () => {
      try {
        await action();
        toast.success(done);
        setEligiendo(false);
        router.refresh();
      } catch (error) {
        toast.error((error as Error).message);
      }
    });
  }

  const terminar = () => {
    if (!next) return;
    run(
      () => moveBrief(task.id, next.to, faltaSiguiente ? persona || null : null),
      next.to === "lanzado" ? "Marcada como lanzada" : `Pasó a ${STATUS_LABEL[next.to]}`,
    );
  };

  return (
    <li className="surface rounded-xl border p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-medium">
            <span className="shrink-0 rounded border px-1 py-px font-mono text-xs text-muted-foreground">
              {CHANNEL_LABEL[task.channel]}
            </span>
            <Link href={href} className="truncate hover:underline">
              {task.title}
            </Link>
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{STAGES.find((s) => s.status === stage)?.label}</span>
            {aprobando ? (
              <span>
                ○ Falta tu visto bueno{task.enteredAt ? ` · esperando ${elapsed(task.enteredAt)}` : ""}
              </span>
            ) : task.startedAt ? (
              <span className="text-foreground">● En progreso · {elapsed(task.startedAt)}</span>
            ) : (
              <span>
                ○ Pendiente{task.enteredAt ? ` · esperando ${elapsed(task.enteredAt)}` : ""}
              </span>
            )}
            {task.dueDate ? (
              <span className={`font-mono ${atrasado ? "text-destructive" : ""}`}>
                entrega {task.dueDate}
              </span>
            ) : null}
            {task.docUrl ? (
              <a
                href={task.docUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground hover:underline"
              >
                Doc ↗
              </a>
            ) : null}
          </p>
        </div>

        {/* Un solo boton: la accion siguiente. Con diez tareas, dos botones por
            renglon eran veinte. Terminar sin haber empezado sigue dentro de la tarea. */}
        <div className="flex shrink-0 gap-2">
          {aprobando ? (
            <Link href={href} className={buttonVariants({ size: "sm" })}>
              Revisar y aprobar
            </Link>
          ) : !task.startedAt ? (
            <Button
              size="sm"
              disabled={pending}
              onClick={() => run(() => startBriefStage(task.id), "En progreso")}
            >
              Empezar
            </Button>
          ) : terminaDentro ? (
            <Link href={href} className={buttonVariants({ size: "sm" })}>
              Subir y publicar
            </Link>
          ) : (
            <Button
              size="sm"
              disabled={pending}
              onClick={() => (faltaSiguiente ? setEligiendo(true) : terminar())}
            >
              {FINISH_LABEL[stage]}
            </Button>
          )}
        </div>
      </div>

      {eligiendo ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-2">
          <label htmlFor={`siguiente-${task.id}`} className="text-xs text-muted-foreground">
            ¿Quién sigue en {nextStage?.label.toLowerCase()}?
          </label>
          <select
            id={`siguiente-${task.id}`}
            value={persona}
            onChange={(event) => setPersona(event.target.value)}
            className="h-8 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-xs"
          >
            <option value="">Elige a alguien…</option>
            {team.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name} · {roleLabel(member.role)}
              </option>
            ))}
          </select>
          <Button size="sm" disabled={pending || !persona} onClick={terminar}>
            Confirmar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEligiendo(false)}>
            Cancelar
          </Button>
        </div>
      ) : null}
    </li>
  );
}
