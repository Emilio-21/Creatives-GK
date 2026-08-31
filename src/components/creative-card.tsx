import Link from "next/link";
import { statusOf, STATUS_LABEL } from "@/lib/metrics";
import type { CreativeCard as Card } from "@/lib/creatives";

const STATUS_DOT: Record<ReturnType<typeof statusOf>, string> = {
  "sin-lanzar": "bg-primary",
  "en-circulacion": "bg-primary/60",
  finalizado: "bg-muted-foreground/60",
};

export function CreativeCard({ creative }: { creative: Card }) {
  const status = statusOf(creative.stats);

  return (
    <Link
      href={`/creative/${creative.id}`}
      className="group overflow-hidden rounded-xl border bg-card transition-colors hover:border-primary/40"
    >
      <div className="relative aspect-[4/5] bg-muted">
        {creative.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={creative.previewUrl}
            alt={creative.display_name}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          // Sin poster no es un error: hay codecs que el navegador no puede
          // pintar en canvas. El placeholder tiene que verse intencional.
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <span className="flex size-10 items-center justify-center rounded-full border">
              <PlayIcon />
            </span>
            <span className="font-mono text-[10px] uppercase tracking-widest">
              sin póster
              {creative.mime_type === "video/quicktime" ? " · mov" : ""}
            </span>
          </div>
        )}

        {creative.media_type === "video" && creative.duration_seconds ? (
          <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-white">
            {formatDuration(creative.duration_seconds)}
          </span>
        ) : null}
      </div>

      <div className="space-y-2 p-3">
        <p className="truncate text-sm font-medium" title={creative.display_name}>
          {creative.display_name}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] text-muted-foreground">
            <span className={`size-1.5 rounded-full ${STATUS_DOT[status]}`} />
            {STATUS_LABEL[status]}
          </span>
          {creative.format ? (
            <span className="rounded-md border px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
              {creative.format}
            </span>
          ) : null}
          {creative.archived_at ? (
            <span className="rounded-md border px-2 py-0.5 text-[11px] text-muted-foreground">
              Archivado
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
    </svg>
  );
}

function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
