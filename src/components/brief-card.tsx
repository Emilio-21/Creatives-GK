"use client";

import type { BriefWithMeta } from "@/app/client/brief-actions";

export function BriefCard({
  brief,
  onOpen,
}: {
  brief: BriefWithMeta;
  onOpen: () => void;
}) {
  const completed = brief.batchCompletedAt !== null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex flex-col gap-2 rounded-xl border bg-card p-3 text-left transition-colors hover:border-primary/40"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm font-medium">{brief.title}</p>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${
            completed
              ? "border-primary/40 text-primary"
              : "border-highlight/40 text-highlight"
          }`}
        >
          {completed ? "Completado" : "Pendiente"}
        </span>
      </div>

      <p className="line-clamp-2 text-xs text-muted-foreground">
        {brief.body || "Sin instrucciones todavía."}
      </p>

      <div className="mt-auto flex items-baseline gap-2 font-mono text-[10px] text-muted-foreground">
        <span>{brief.brief_date}</span>
        {brief.batchName ? <span className="truncate">· {brief.batchName}</span> : null}
        {brief.creativeCount > 0 ? (
          <span className="ml-auto shrink-0">
            {brief.creativeCount} diseño{brief.creativeCount === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>
    </button>
  );
}
