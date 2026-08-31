import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getStorageUsage } from "@/lib/storage";
import type { CreativeStats } from "@/lib/creatives";

/** Limite del free tier de R2. Total acumulado, no mensual. */
export const R2_LIMIT_BYTES = 10 * 1024 * 1024 * 1024;
/** A partir de aqui hay que archivar o pagar (§8). */
export const R2_WARN_BYTES = 8 * 1024 * 1024 * 1024;

const STALE_DAYS = 30;

export type TopEntry = {
  id: string;
  displayName: string;
  clientName: string | null;
  value: number;
  spend: number | null;
};

export type StaleEntry = {
  id: string;
  displayName: string;
  clientName: string | null;
  /** Fecha del ultimo lanzamiento, o null si nunca se lanzo. */
  lastLaunchedAt: string | null;
  daysIdle: number;
};

export type MonthlyProduction = { month: string; label: string; count: number };

export async function getDashboard() {
  const supabase = await createClient();

  const [{ data: creativeRows }, { data: clientRows }, usage] = await Promise.all([
    supabase
      .from("creatives")
      .select("id, display_name, client_id, created_at")
      .is("archived_at", null),
    supabase.from("clients").select("id, name"),
    getStorageUsage().catch(() => null),
  ]);

  const creatives = creativeRows ?? [];
  const clientNames = new Map((clientRows ?? []).map((row) => [row.id as string, row.name as string]));

  const statsById = new Map<string, CreativeStats>();
  const ids = creatives.map((row) => row.id as string);
  if (ids.length > 0) {
    const { data: stats } = await supabase.from("creative_stats").select("*").in("id", ids);
    for (const row of (stats ?? []) as CreativeStats[]) statsById.set(row.id, row);
  }

  const total = creatives.length;
  const launched = creatives.filter((row) => statsById.get(row.id as string)?.is_published).length;
  const unlaunched = total - launched;

  // Gasto de los lanzamientos que arrancaron este mes.
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const { data: monthLaunches } = await supabase
    .from("launches")
    .select("spend")
    .gte("launched_at", monthStart.toISOString().slice(0, 10));
  const monthSpend = (monthLaunches ?? []).reduce(
    (sum, row) => sum + Number(row.spend ?? 0),
    0,
  );

  const describe = (row: (typeof creatives)[number]) => ({
    id: row.id as string,
    displayName: row.display_name as string,
    clientName: clientNames.get(row.client_id as string) ?? null,
  });

  // Top 10: solo creativos con la metrica disponible.
  const withStats = creatives
    .map((row) => ({ row, stats: statsById.get(row.id as string) }))
    .filter((entry) => entry.stats?.is_published);

  const topByCpa: TopEntry[] = withStats
    .filter((entry) => entry.stats?.cpa !== null && entry.stats?.cpa !== undefined)
    .sort((a, b) => Number(a.stats!.cpa) - Number(b.stats!.cpa))
    .slice(0, 10)
    .map((entry) => ({
      ...describe(entry.row),
      value: Number(entry.stats!.cpa),
      spend: entry.stats!.total_spend === null ? null : Number(entry.stats!.total_spend),
    }));

  const topByCtr: TopEntry[] = withStats
    .filter((entry) => entry.stats?.ctr !== null && entry.stats?.ctr !== undefined)
    .sort((a, b) => Number(b.stats!.ctr) - Number(a.stats!.ctr))
    .slice(0, 10)
    .map((entry) => ({
      ...describe(entry.row),
      value: Number(entry.stats!.ctr),
      spend: entry.stats!.total_spend === null ? null : Number(entry.stats!.total_spend),
    }));

  // Inventario olvidado: nunca lanzado o sin lanzarse hace mas de 30 dias.
  const now = Date.now();
  const daysSince = (iso: string) => Math.floor((now - new Date(iso).getTime()) / 86_400_000);

  const stale: StaleEntry[] = creatives
    .map((row) => {
      const stats = statsById.get(row.id as string);
      const reference = stats?.last_launched_at ?? (row.created_at as string);
      return {
        ...describe(row),
        lastLaunchedAt: stats?.last_launched_at ?? null,
        daysIdle: daysSince(reference),
      };
    })
    .filter((entry) => entry.daysIdle > STALE_DAYS)
    .sort((a, b) => b.daysIdle - a.daysIdle)
    .slice(0, 20);

  return {
    kpis: {
      total,
      launched,
      unlaunched,
      launchedPercent: total > 0 ? Math.round((launched / total) * 100) : 0,
      monthSpend,
    },
    topByCpa,
    topByCtr,
    stale,
    monthly: monthlyProduction(creatives.map((row) => row.created_at as string)),
    storage: usage,
  };
}

/** Ultimos 12 meses, incluyendo los que salieron en cero. */
function monthlyProduction(createdAt: string[]): MonthlyProduction[] {
  const counts = new Map<string, number>();
  for (const iso of createdAt) {
    const key = iso.slice(0, 7);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const months: MonthlyProduction[] = [];
  const cursor = new Date();
  cursor.setDate(1);

  for (let index = 11; index >= 0; index -= 1) {
    const date = new Date(cursor);
    date.setMonth(cursor.getMonth() - index);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    months.push({
      month: key,
      label: date.toLocaleDateString("es-MX", { month: "short" }).replace(".", ""),
      count: counts.get(key) ?? 0,
    });
  }

  return months;
}
