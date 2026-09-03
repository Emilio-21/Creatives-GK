import Link from "next/link";
import { notFound } from "next/navigation";
import { CreativeDetails } from "@/components/creative-details";
import { LaunchesSection } from "@/components/launches-section";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getLaunches } from "@/lib/launches";
import { formatMoney, formatPercent, statusOf, STATUS_LABEL } from "@/lib/metrics";
import { getPreviewUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import type { CreativeRow, CreativeStats } from "@/lib/creatives";

export default async function CreativeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: row } = await supabase
    .from("creatives")
    .select("*, clients(id, name)")
    .eq("id", id)
    .maybeSingle();

  if (!row) notFound();
  const creative = row as CreativeRow & { clients: { id: string; name: string } | null };

  const [mediaUrl, posterUrl, launches, { data: statsRow }] = await Promise.all([
    getPreviewUrl(creative.storage_path),
    creative.poster_path ? getPreviewUrl(creative.poster_path) : Promise.resolve(null),
    getLaunches(creative.id),
    supabase.from("creative_stats").select("*").eq("id", creative.id).maybeSingle(),
  ]);

  const stats = (statsRow as CreativeStats) ?? null;
  const status = statusOf(stats);

  return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <Link
            href={creative.clients ? `/client/${creative.clients.id}` : "/"}
            className="text-sm text-muted-foreground hover:underline"
          >
            ← {creative.clients?.name ?? "Biblioteca"}
          </Link>
          <Badge variant={status === "en-circulacion" ? "default" : "secondary"}>
            {STATUS_LABEL[status]}
          </Badge>
        </div>

        <div className="overflow-hidden rounded-lg border bg-muted">
          {creative.media_type === "video" ? (
            <video
              src={mediaUrl}
              poster={posterUrl ?? undefined}
              controls
              preload="none"
              className="max-h-[70vh] w-full"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mediaUrl}
              alt={creative.display_name}
              className="max-h-[70vh] w-full object-contain"
            />
          )}
        </div>

        {stats && stats.launch_count > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="font-mono text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Acumulado · {stats.launch_count} lanzamiento
                {stats.launch_count === 1 ? "" : "s"}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4">
              <Metric label="Gasto" value={formatMoney(stats.total_spend)} />
              <Metric label="CPA" value={formatMoney(stats.cpa)} />
              <Metric label="CTR" value={formatPercent(stats.ctr)} />
              <Metric label="CPC" value={formatMoney(stats.cpc)} />
            </CardContent>
          </Card>
        ) : null}

        <CreativeDetails creative={creative} />

        <LaunchesSection creativeId={creative.id} launches={launches} />

      </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
