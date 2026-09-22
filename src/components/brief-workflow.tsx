"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  getBriefHistory,
  listTeam,
  moveBrief,
  setBriefDueDate,
  type BriefEvent,
  type TeamMember,
} from "@/app/(app)/client/assignment-actions";
import { NEXT_STEPS, STATUS_LABEL, type BriefStatus } from "@/lib/brief-flow";

const ROLE_LABEL: Record<string, string> = {
  admin: "admin",
  copy: "copy",
  design: "diseño",
  media: "media buying",
  member: "equipo",
};

/**
 * El relevo: quien tiene la pelota, hasta cuando, y que sigue.
 *
 * Las transiciones se ofrecen segun el estado actual y las valida la base. Si
 * la pantalla ofreciera una que la funcion rechaza, el error se ve aqui — es
 * preferible a repetir el criterio en dos lados y que se separen.
 */
export function BriefWorkflow({
  briefId,
  status,
  assigneeName,
  dueDate,
  onChanged,
}: {
  briefId: string;
  status: BriefStatus;
  assigneeName: string | null;
  dueDate: string | null;
  onChanged: () => Promise<void> | void;
}) {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [history, setHistory] = useState<BriefEvent[]>([]);
  const [pendiente, setPendiente] = useState<BriefStatus | null>(null);
  const [persona, setPersona] = useState("");
  const [motivo, setMotivo] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    listTeam().then(setTeam).catch(() => setTeam([]));
    getBriefHistory(briefId).then(setHistory).catch(() => setHistory([]));
  }, [briefId]);

  // Asignar pide persona; devolver trabajo terminado pide motivo.
  const pidePersona = pendiente === "asignado";
  const pideMotivo = pendiente !== null && status === "listo";

  function ejecutar(to: BriefStatus) {
    startTransition(async () => {
      try {
        await moveBrief(briefId, to, pidePersona ? persona || null : null, motivo || null);
        toast.success(`Brief en "${STATUS_LABEL[to]}"`);
        setPendiente(null);
        setPersona("");
        setMotivo("");
        setHistory(await getBriefHistory(briefId));
        await onChanged();
      } catch (error) {
        toast.error((error as Error).message);
      }
    });
  }

  return (
    <section className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            Estado
          </span>
          <span className="rounded-full border border-primary/40 px-2 py-0.5 text-xs text-primary">
            {STATUS_LABEL[status]}
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="text-xs">
            {assigneeName ?? <span className="italic text-muted-foreground">sin responsable</span>}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Entrega
          </label>
          <Input
            type="date"
            defaultValue={dueDate ?? ""}
            disabled={pending}
            onChange={(event) =>
              startTransition(async () => {
                try {
                  await setBriefDueDate(briefId, event.target.value || null);
                  await onChanged();
                } catch (error) {
                  toast.error((error as Error).message);
                }
              })
            }
            className="h-8 w-36 text-xs"
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {NEXT_STEPS[status].map((step) => (
          <Button
            key={step.to}
            size="sm"
            variant={step.to === "listo" || step.to === "asignado" ? "default" : "outline"}
            disabled={pending}
            onClick={() => {
              // Si no hace falta nada mas, se mueve de una: un paso extra para
              // confirmar lo que ya se decidio solo estorba.
              const necesitaDatos = step.to === "asignado" || status === "listo";
              if (necesitaDatos) setPendiente(step.to);
              else ejecutar(step.to);
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
              <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                ¿Quién lo toma?
              </label>
              <select
                value={persona}
                onChange={(event) => setPersona(event.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">Elige a alguien…</option>
                {team.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name} · {ROLE_LABEL[member.role] ?? member.role}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {pideMotivo ? (
            <div className="space-y-1">
              <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                ¿Por qué lo devuelves?
              </label>
              <Textarea
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
              onClick={() => ejecutar(pendiente)}
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
          <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
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
                {event.from_status ? (
                  <>
                    movió a{" "}
                    <span className="text-foreground">
                      {STATUS_LABEL[event.to_status as BriefStatus] ?? event.to_status}
                    </span>
                  </>
                ) : (
                  "creó el brief"
                )}
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
