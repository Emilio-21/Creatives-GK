import { formatMoney, formatPercent } from "@/lib/metrics";
import type { Aggregate } from "@/lib/dashboard";

/** Las tres cifras que se leen de un vistazo, más las derivadas debajo. */
export function ClientKpis({
  stats,
  monthSpend,
}: {
  stats: Aggregate;
  monthSpend?: number;
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi label="Creativos" value={String(stats.total)} />
        <Kpi label="Lanzados" value={String(stats.launched)} />
        <Kpi label="Sin lanzar" value={String(stats.unlaunched)} highlight />
      </div>

      <div className="flex flex-wrap gap-x-8 gap-y-2 px-1 text-sm">
        <Inline label="Gasto" value={formatMoney(stats.totalSpend)} />
        {monthSpend !== undefined ? (
          <Inline label="Este mes" value={formatMoney(monthSpend || null)} />
        ) : null}
        <Inline label="CTR" value={formatPercent(stats.ctr)} />
        <Inline label="CPA" value={formatMoney(stats.cpa)} />
        {stats.staleCount > 0 ? (
          <Inline label="+30 días parados" value={String(stats.staleCount)} />
        ) : null}
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-muted/25 px-5 py-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-4xl font-semibold tabular-nums${
          highlight ? " text-highlight" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function Inline({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </span>
  );
}
