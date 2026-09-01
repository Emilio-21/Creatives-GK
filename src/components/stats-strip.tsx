import { Card, CardContent } from "@/components/ui/card";
import { formatMoney, formatPercent } from "@/lib/metrics";
import type { Aggregate } from "@/lib/dashboard";

/** KPIs de un conjunto de creativos: sirve para un cliente o para todo. */
export function StatsStrip({
  stats,
  monthSpend,
}: {
  stats: Aggregate;
  monthSpend?: number;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <Stat label="Creativos" value={String(stats.total)} />
      <Stat
        label="Lanzados"
        value={String(stats.launched)}
        hint={`${stats.launchedPercent}% del total`}
      />
      <Stat
        label="Sin lanzar"
        value={String(stats.unlaunched)}
        hint={stats.staleCount > 0 ? `${stats.staleCount} con +30 días` : undefined}
        emphasis
      />
      <Stat
        label="Gasto"
        value={formatMoney(stats.totalSpend)}
        hint={monthSpend !== undefined ? `${formatMoney(monthSpend)} este mes` : undefined}
      />
      <Stat label="CTR" value={formatPercent(stats.ctr)} />
      <Stat label="CPA" value={formatMoney(stats.cpa)} />
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  emphasis,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
}) {
  return (
    <Card className={emphasis ? "border-highlight/40" : undefined}>
      <CardContent className="px-4 py-3">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`mt-0.5 text-xl font-semibold tabular-nums${emphasis ? " text-highlight" : ""}`}>
          {value}
        </p>
        <p className="mt-0.5 h-4 text-[11px] text-muted-foreground">{hint ?? ""}</p>
      </CardContent>
    </Card>
  );
}
