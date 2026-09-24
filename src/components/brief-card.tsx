"use client";

import { CHANNEL_LABEL, docLabel, STATUS_LABEL, type BriefStatus } from "@/lib/brief-flow";
import type { BriefWithMeta } from "@/app/(app)/client/brief-actions";
import { UserAvatar } from "@/components/user-avatar";
import { today } from "@/lib/dates";

/**
 * Neutro: el estado se lee en la palabra, no en el color. El color de alerta
 * queda para lo que pide accion (vencido); si todo tiene color, nada resalta.
 * Lo que esta en curso se ve mas firme que lo que espera o ya termino.
 */
const STATUS_STYLE: Record<BriefStatus, string> = {
  borrador: "border-muted-foreground/30 text-muted-foreground",
  en_revision: "border-foreground/30 text-foreground",
  en_produccion: "border-foreground/30 text-foreground",
  en_lanzamiento: "border-foreground/50 text-foreground font-medium",
  lanzado: "border-muted-foreground/30 text-muted-foreground",
};

export function BriefCard({
  brief,
  onOpen,
}: {
  brief: BriefWithMeta;
  onOpen: () => void;
}) {
  const status = brief.status;
  const atrasado = isLate(brief.due_date, status);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="surface flex h-40 w-full flex-col gap-2 rounded-xl border p-4 text-left transition-colors hover:border-primary/40"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 min-w-0 flex-1 text-sm font-medium">
          <span className="mr-1.5 rounded border px-1 py-px align-middle font-mono text-xs text-muted-foreground">
            {CHANNEL_LABEL[brief.channel]}
          </span>
          {brief.title}
        </p>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${STATUS_STYLE[status]}`}
        >
          {STATUS_LABEL[status]}
        </span>
      </div>

      <p className="line-clamp-2 text-xs text-muted-foreground">
        {brief.doc_url
          ? `${docLabel(brief.doc_url)} ↗`
          : brief.body || "Sin Google Doc todavía."}
      </p>

      <div className="mt-auto space-y-1 text-[11px] text-muted-foreground">
        {/* Quien tiene la pelota, que es lo que uno busca al mirar el tablero. */}
        <p className="flex items-center gap-1.5">
          {brief.assigneeName ? (
            <>
              <UserAvatar
                name={brief.assigneeName}
                url={brief.assigneeAvatarUrl}
                className="size-5 text-[10px]"
              />
              <span className="truncate">{brief.assigneeName}</span>
              {/* Tomado o solo recibido: lo que distingue "ya va" de "nadie lo ha abierto". */}
              <span
                className={`ml-auto shrink-0 ${brief.stage_started_at ? "text-foreground" : ""}`}
              >
                {brief.stage_started_at ? "● en progreso" : "○ pendiente"}
              </span>
            </>
          ) : (
            <span className="italic">
              {brief.status === "lanzado" ? "Terminado" : "Sin responsable"}
            </span>
          )}
        </p>

        <p className="flex items-baseline justify-between gap-2 font-mono">
          <span className={atrasado ? "text-destructive" : undefined}>
            {brief.due_date ? `entrega ${brief.due_date}` : brief.brief_date}
          </span>
          {brief.creativeCount > 0 ? (
            <span className="shrink-0">
              {brief.creativeCount} diseño{brief.creativeCount === 1 ? "" : "s"}
            </span>
          ) : null}
        </p>
      </div>
    </button>
  );
}

/** Solo lo que sigue pendiente puede ir tarde: un brief lanzado ya no debe nada. */
function isLate(dueDate: string | null, status: BriefStatus): boolean {
  if (!dueDate || status === "lanzado") return false;
  return dueDate < today();
}
