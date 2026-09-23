"use client";

import { docLabel, STATUS_LABEL, type BriefStatus } from "@/lib/brief-flow";
import type { BriefWithMeta } from "@/app/(app)/client/brief-actions";

/**
 * "Listo" es el unico estado que le pide algo a alguien que no sea quien lo
 * tiene asignado, asi que es el unico que grita. Los demas informan.
 */
const STATUS_STYLE: Record<BriefStatus, string> = {
  borrador: "border-muted-foreground/30 text-muted-foreground",
  asignado: "border-highlight/40 text-highlight",
  en_diseno: "border-primary/40 text-primary",
  listo: "border-primary bg-primary/10 text-primary font-medium",
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
        <p className="line-clamp-2 min-w-0 flex-1 text-sm font-medium">{brief.title}</p>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${STATUS_STYLE[status]}`}
        >
          {STATUS_LABEL[status]}
        </span>
      </div>

      <p className="line-clamp-2 text-xs text-muted-foreground">
        {brief.doc_url
          ? `${docLabel(brief.doc_url)} ↗`
          : brief.body || "Sin Google Doc todavía."}
      </p>

      <div className="mt-auto space-y-1 text-[10px] text-muted-foreground">
        {/* Quien tiene la pelota, que es lo que uno busca al mirar el tablero. */}
        <p className="flex items-center gap-1.5">
          {brief.assigneeName ? (
            <>
              <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[8px] font-medium text-primary">
                {initials(brief.assigneeName)}
              </span>
              <span className="truncate">{brief.assigneeName}</span>
            </>
          ) : (
            <span className="italic">Sin responsable</span>
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

/** Solo lo que sigue pendiente puede ir tarde: un brief listo ya no debe nada. */
function isLate(dueDate: string | null, status: BriefStatus): boolean {
  if (!dueDate || status === "listo") return false;
  return dueDate < new Date().toISOString().slice(0, 10);
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
