import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { statusOf, STATUS_LABEL } from "@/lib/metrics";
import type { CreativeCard as Card } from "@/lib/creatives";

export function CreativeCard({ creative }: { creative: Card }) {
  const status = statusOf(creative.stats);

  return (
    <Link
      href={`/creative/${creative.id}`}
      className="group overflow-hidden rounded-lg border transition-colors hover:border-foreground/30"
    >
      <div className="relative aspect-square bg-muted">
        {creative.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={creative.previewUrl}
            alt={creative.display_name}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            {creative.media_type === "video" ? "sin poster" : "sin preview"}
          </div>
        )}

        {creative.media_type === "video" ? (
          <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
            {creative.duration_seconds ? `${Math.round(creative.duration_seconds)}s` : "video"}
          </span>
        ) : null}
      </div>

      <div className="space-y-1.5 p-3">
        <p className="truncate text-sm font-medium" title={creative.display_name}>
          {creative.display_name}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={status === "en-circulacion" ? "default" : "secondary"}>
            {STATUS_LABEL[status]}
          </Badge>
          {creative.format ? <Badge variant="outline">{creative.format}</Badge> : null}
          {creative.archived_at ? <Badge variant="outline">Archivado</Badge> : null}
        </div>
      </div>
    </Link>
  );
}
