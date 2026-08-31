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
  lastLaunchedAt: string | null;
  daysIdle: number;
};

export type MonthlyProduction = { month: string; label: string; count: number };

export type Aggregate = {
  total: number;
  launched: number;
  unlaunched: number;
  launchedPercent: number;
  staleCount: number;
  totalSpend: number | null;
  impressions: number;
  clicks: number;
  results: number;
  /** Derivadas de los totales, nunca promediando promedios. */
  ctr: number | null;
  cpm: number | null;
  cpc: number | null;
  cpa: number | null;
};

export type ClientBreakdown = Aggregate & { id: string; name: string };

type CreativeLite = {
  id: string;
  display_name: string;
  client_id: string | null;
  created_at: string;
};

type Row = { creative: CreativeLite; stats: CreativeStats | null };

async function loadRows(clientId?: string) {
  const supabase = await createClient();

  let query = supabase
    .from("creatives")
    .select("id, display_name, client_id, created_at")
    .is("archived_at", null);
  if (clientId) query = query.eq("client_id", clientId);

  const [{ data: creativeRows }, { data: clientRows }] = await Promise.all([
    query,
    supabase.from("clients").select("id, name"),
  ]);

  const creatives = (creativeRows ?? []) as CreativeLite[];
  const clientNames = new Map(
    (clientRows ?? []).map((row) => [row.id as string, row.name as string]),
  );

  const statsById = new Map<string, CreativeStats>();
  const ids = creatives.map((row) => row.id);
  if (ids.length > 0) {
    const { data: stats } = await supabase.from("creative_stats").select("*").in("id", ids);
    for (const row of (stats ?? []) as CreativeStats[]) statsById.set(row.id, row);
  }

  const rows: Row[] = creatives.map((creative) => ({
    creative,
    stats: statsById.get(creative.id) ?? null,
  }));

  return { rows, clientNames, supabase };
}

/**
 * CTR, CPM, CPC y CPA de un conjunto salen de sumar los numeros base y dividir
 * una sola vez. Promediar los CTR de cada creativo daria otro numero, y estaria
 * mal: un creativo con 100 impresiones pesaria igual que uno con un millon.
 */
function aggregate(rows: Row[]): Aggregate {
  const total = rows.length;
  const launched = rows.filter((row) => row.stats?.is_published).length;

  let spend = 0;
  let hasSpend = false;
  let impressions = 0;
  let clicks = 0;
  let results = 0;

  for (const { stats } of rows) {
    if (!stats) continue;
    if (stats.total_spend !== null) {
      spend += Number(stats.total_spend);
      hasSpend = true;
    }
    impressions += Number(stats.total_impressions ?? 0);
    clicks += Number(stats.total_clicks ?? 0);
    results += Number(stats.total_results ?? 0);
  }

  const now = Date.now();
  const staleCount = rows.filter((row) => {
    const reference = row.stats?.last_launched_at ?? row.creative.created_at;
    return Math.floor((now - new Date(reference).getTime()) / 86_400_000) > STALE_DAYS;
  }).length;

  return {
    total,
    launched,
    unlaunched: total - launched,
    launchedPercent: total > 0 ? Math.round((launched / total) * 100) : 0,
    staleCount,
    totalSpend: hasSpend ? spend : null,
    impressions,
    clicks,
    results,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
    cpm: impressions > 0 && hasSpend ? (spend / impressions) * 1000 : null,
    cpc: clicks > 0 && hasSpend ? spend / clicks : null,
    cpa: results > 0 && hasSpend ? spend / results : null,
  };
}

function topsFrom(rows: Row[], clientNames: Map<string, string>) {
  const describe = (row: Row) => ({
    id: row.creative.id,
    displayName: row.creative.display_name,
    clientName: row.creative.client_id
      ? (clientNames.get(row.creative.client_id) ?? null)
      : null,
  });

  const published = rows.filter((row) => row.stats?.is_published);

  const build = (
    pick: (row: Row) => number | null,
    direction: "asc" | "desc",
  ): TopEntry[] =>
    published
      .map((row) => ({ row, value: pick(row) }))
      .filter((entry): entry is { row: Row; value: number } => entry.value !== null)
      .sort((a, b) => (direction === "asc" ? a.value - b.value : b.value - a.value))
      .slice(0, 10)
      .map((entry) => ({
        ...describe(entry.row),
        value: entry.value,
        spend:
          entry.row.stats?.total_spend === null || entry.row.stats?.total_spend === undefined
            ? null
            : Number(entry.row.stats.total_spend),
      }));

  return {
    // Menor CPA es mejor.
    topByCpa: build((row) => (row.stats?.cpa === null ? null : Number(row.stats?.cpa)), "asc"),
    topByCtr: build((row) => (row.stats?.ctr === null ? null : Number(row.stats?.ctr)), "desc"),
  };
}

function staleFrom(rows: Row[], clientNames: Map<string, string>, limit: number): StaleEntry[] {
  const now = Date.now();
  return rows
    .map((row) => {
      const reference = row.stats?.last_launched_at ?? row.creative.created_at;
      return {
        id: row.creative.id,
        displayName: row.creative.display_name,
        clientName: row.creative.client_id
          ? (clientNames.get(row.creative.client_id) ?? null)
          : null,
        lastLaunchedAt: row.stats?.last_launched_at ?? null,
        daysIdle: Math.floor((now - new Date(reference).getTime()) / 86_400_000),
      };
    })
    .filter((entry) => entry.daysIdle > STALE_DAYS)
    .sort((a, b) => b.daysIdle - a.daysIdle)
    .slice(0, limit);
}

/** Gasto de los lanzamientos que arrancaron este mes. */
async function monthSpendFor(creativeIds: string[] | null): Promise<number> {
  const supabase = await createClient();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  let query = supabase
    .from("launches")
    .select("spend, creative_id")
    .gte("launched_at", monthStart.toISOString().slice(0, 10));

  // null = todos los creativos; una lista = solo los de ese cliente.
  if (creativeIds) {
    if (creativeIds.length === 0) return 0;
    query = query.in("creative_id", creativeIds);
  }

  const { data } = await query;
  return (data ?? []).reduce((sum, row) => sum + Number(row.spend ?? 0), 0);
}

export async function getDashboard() {
  const [{ rows, clientNames }, usage] = await Promise.all([
    loadRows(),
    getStorageUsage().catch(() => null),
  ]);

  const byClient: ClientBreakdown[] = [...clientNames.entries()]
    .map(([id, name]) => ({
      id,
      name,
      ...aggregate(rows.filter((row) => row.creative.client_id === id)),
    }))
    .filter((entry) => entry.total > 0)
    .sort((a, b) => b.total - a.total);

  return {
    kpis: { ...aggregate(rows), monthSpend: await monthSpendFor(null) },
    ...topsFrom(rows, clientNames),
    stale: staleFrom(rows, clientNames, 20),
    monthly: monthlyProduction(rows.map((row) => row.creative.created_at)),
    byClient,
    storage: usage,
  };
}

/** Los mismos numeros, acotados a un cliente. */
export async function getClientOverview(clientId: string) {
  const { rows, clientNames } = await loadRows(clientId);

  return {
    kpis: {
      ...aggregate(rows),
      monthSpend: await monthSpendFor(rows.map((row) => row.creative.id)),
    },
    ...topsFrom(rows, clientNames),
    stale: staleFrom(rows, clientNames, 10),
    monthly: monthlyProduction(rows.map((row) => row.creative.created_at)),
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
