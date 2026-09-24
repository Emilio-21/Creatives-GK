"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  getBriefHistory as getBriefHistoryAction,
  listTeam as listTeamAction,
  moveBrief as moveBriefAction,
  setBriefDueDate as setBriefDueDateAction,
  setBriefOwner as setBriefOwnerAction,
  startBriefStage as startBriefStageAction,
  type BriefEvent,
  type TeamMember,
} from "@/app/(app)/client/assignment-actions";
import type { BriefWithMeta } from "@/app/(app)/client/brief-actions";
import {
  BRIEF_STATUSES,
  CHANNEL_LABEL,
  elapsed,
  NEXT_STEPS,
  STAGES,
  STATUS_LABEL,
  type BriefStatus,
} from "@/lib/brief-flow";
import { roleLabel } from "@/lib/roles";
import { unwrapped } from "@/lib/action-result";

// Las acciones regresan el error como dato; esto lo vuelve a lanzar con su mensaje real.
const getBriefHistory = unwrapped(getBriefHistoryAction);
const listTeam = unwrapped(listTeamAction);
const moveBrief = unwrapped(moveBriefAction);
const setBriefDueDate = unwrapped(setBriefDueDateAction);
const setBriefOwner = unwrapped(setBriefOwnerAction);
const startBriefStage = unwrapped(startBriefStageAction);

/**
 * El relevo: las tres etapas con su responsable, en que etapa va y que sigue.
 *
 * Las transiciones se ofrecen segun el estado actual y las valida la base. Si
 * la pantalla ofreciera una que la funcion rechaza, el error se ve aqui — es
 * preferible a repetir el criterio en dos lados y que se separen.
 */
export function BriefWorkflow({
  brief,
  onChanged,
}: {
  brief: BriefWithMeta;
  onChanged: () => Promise<void> | void;
}) {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [history, setHistory] = useState<BriefEvent[]>([]);
  const [pendiente, setPendiente] = useState<{ to: BriefStatus; back: boolean } | null>(null);
  const [persona, setPersona] = useState("");
  const [motivo, setMotivo] = useState("");
  const [pending, startTransition] = useTransition();

  const status = brief.status;

  useEffect(() => {
    listTeam().then(setTeam).catch(() => setTeam([]));
    getBriefHistory(brief.id).then(setHistory).catch(() => setHistory([]));
  }, [brief.id]);

  /** Entrar a una etapa que no tiene responsable. */
  const faltaResponsable = (to: BriefStatus) => {
    const stage = STAGES.find((s) => s.status === to);
    return stage !== undefined && !brief[stage.field];
  };

  // Entrar a una etapa sin responsable pide persona; regresar pide motivo.
  const pidePersona = pendiente !== null && !pendiente.back && faltaResponsable(pendiente.to);
  const pideMotivo = pendiente?.back ?? false;

  function run(action: () => Promise<unknown>, done?: string) {
    startTransition(async () => {
      try {
        await action();
        if (done) toast.success(done);
        setPendiente(null);
        setPersona("");
        setMotivo("");
        setHistory(await getBriefHistory(brief.id));
        await onChanged();
      } catch (error) {
        toast.error((error as Error).message);
      }
    });
  }

  const mover = (to: BriefStatus) =>
    run(
      () => moveBrief(brief.id, to, pidePersona ? persona || null : null, motivo || null),
      `Tarea en "${STATUS_LABEL[to]}"`,
    );

  const posicion = BRIEF_STATUSES.indexOf(status);
  const soyResponsable = team.some((m) => m.isMe && m.id === brief.assigned_to);

  return (
    <section className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="rounded-full border px-2 py-0.5 font-mono text-xs text-muted-foreground">
            {CHANNEL_LABEL[brief.channel]}
          </span>
          <span className="rounded-full border border-foreground/30 px-2 py-0.5 text-xs">
            {STATUS_LABEL[status]}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <label htmlFor="brief-entrega" className="font-mono text-xs text-muted-foreground">
            Entrega
          </label>
          <Input
            id="brief-entrega"
            type="date"
            defaultValue={brief.due_date ?? ""}
            disabled={pending}
            onChange={(event) => {
              const value = event.target.value || null;
              run(() => setBriefDueDate(brief.id, value));
            }}
            className="h-8 w-36 text-xs"
          />
        </div>
      </div>

      {/* Las tres manos, de entrada: quien sigue ya esta dicho antes de que le toque. */}
      <ol className="mt-3 grid gap-2 sm:grid-cols-3">
        {STAGES.map((stage, index) => {
          const actual = stage.status === status;
          const pasada = posicion > BRIEF_STATUSES.indexOf(stage.status);
          return (
            <li
              key={stage.status}
              className={`rounded-md border p-2 ${
                actual ? "border-foreground/40 bg-foreground/5" : pasada ? "opacity-70" : ""
              }`}
            >
              <p className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium">
                  <span className="mr-1 font-mono text-muted-foreground">{index + 1}</span>
                  {stage.label}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {actual ? "ahora" : pasada ? "✓" : ""}
                </span>
              </p>
              <select
                aria-label={`Responsable de ${stage.label}`}
                value={brief[stage.field] ?? ""}
                disabled={pending}
                onChange={(event) => {
                  const value = event.target.value || null;
                  run(() => setBriefOwner(brief.id, stage.status, value), "Responsable cambiado");
                }}
                className="mt-1.5 h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs"
              >
                <option value="">Sin asignar</option>
                {team.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name} · {roleLabel(member.role)}
                  </option>
                ))}
              </select>
              {actual ? (
                <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px]">
                  {brief.stage_started_at ? (
                    <span className="text-foreground">
                      ● En progreso · {elapsed(brief.stage_started_at)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      ○ Pendiente
                      {brief.stage_entered_at ? ` · ${elapsed(brief.stage_entered_at)}` : ""}
                    </span>
                  )}
                  {!brief.stage_started_at && soyResponsable ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => startBriefStage(brief.id), "En progreso")}
                      className="rounded border border-primary/40 px-1.5 py-0.5 text-primary hover:bg-primary/10"
                    >
                      Empezar
                    </button>
                  ) : null}
                </div>
              ) : (
                <p className="mt-1 text-[11px] text-muted-foreground">{stage.hint}</p>
              )}
            </li>
          );
        })}
      </ol>

      <div className="mt-3 flex flex-wrap gap-2">
        {NEXT_STEPS[status].map((step) => (
          <Button
            key={step.to}
            size="sm"
            variant={step.back ? "outline" : "default"}
            disabled={pending}
            onClick={() => {
              // Si no hace falta nada mas, se mueve de una: un paso extra para
              // confirmar lo que ya se decidio solo estorba.
              if (step.back || faltaResponsable(step.to)) setPendiente({ to: step.to, back: !!step.back });
              else mover(step.to);
            }}
          >
            {step.label}
          </Button>
        ))}
      </div>

      {pendiente ? (
        <div className="mt-3 space-y-2 rounded-md border bg-muted/30 p-3">
          {pidePersona ? (
            <div className="space-y-1">
              <label htmlFor="brief-siguiente" className="font-mono text-xs text-muted-foreground">
                Responsable de {STAGES.find((s) => s.status === pendiente.to)?.label}
              </label>
              <select
                id="brief-siguiente"
                value={persona}
                onChange={(event) => setPersona(event.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">Elige a alguien…</option>
                {team.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name} · {roleLabel(member.role)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {pideMotivo ? (
            <div className="space-y-1">
              <label htmlFor="brief-motivo" className="font-mono text-xs text-muted-foreground">
                ¿Por qué la regresas?
              </label>
              <Textarea
                id="brief-motivo"
                rows={2}
                value={motivo}
                onChange={(event) => setMotivo(event.target.value)}
                placeholder="Qué hay que corregir"
                className="text-sm"
              />
            </div>
          ) : null}

          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={pending || (pidePersona && !persona) || (pideMotivo && !motivo.trim())}
              onClick={() => mover(pendiente.to)}
            >
              {pending ? "Moviendo…" : "Confirmar"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPendiente(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}

      {history.length > 0 ? (
        <details className="mt-3">
          <summary className="cursor-pointer font-mono text-xs text-muted-foreground">
            Historial · {history.length}
          </summary>
          <ul className="mt-2 space-y-1.5 border-l pl-3">
            {history.map((event) => (
              <li key={event.id} className="text-[11px]">
                <span className="text-muted-foreground">
                  {new Date(event.created_at).toLocaleString("es-MX", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>{" "}
                <span className="font-medium">{event.actorName}</span>{" "}
                {describe(event)}
                {event.note ? (
                  <span className="mt-0.5 block italic text-muted-foreground">
                    “{event.note}”
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

/** Estados de antes de las etapas, que siguen en el historial. */
const LEGACY_LABEL: Record<string, string> = {
  asignado: "Asignada",
  en_diseno: "En diseño",
  listo: "Lista para lanzar",
};

function describe(event: BriefEvent): React.ReactNode {
  const label =
    STATUS_LABEL[event.to_status as BriefStatus] ?? LEGACY_LABEL[event.to_status] ?? event.to_status;
  if (!event.from_status) return "creó la tarea";
  if (event.kind === "empezo") {
    return (
      <>
        empezó <span className="text-foreground">{label.toLowerCase()}</span>
      </>
    );
  }
  // Misma etapa: cambio de manos, no de estado.
  if (event.from_status === event.to_status) {
    return (
      <>
        pasó la etapa a <span className="text-foreground">{event.assigneeName ?? "nadie"}</span>
      </>
    );
  }
  return (
    <>
      movió a <span className="text-foreground">{label}</span>
      {event.assigneeName ? <> · a cargo de {event.assigneeName}</> : null}
    </>
  );
}
