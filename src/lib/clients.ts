import "server-only";
import { createClient } from "@/lib/supabase/server";

export type ClientRecord = {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  archived_at: string | null;
};

export type ClientWithCount = ClientRecord & {
  creativeCount: number;
  unlaunchedCount: number;
};

/** Clientes del sidebar, con cuantos creativos tiene cada uno. */
export async function getClientsWithCounts(): Promise<ClientWithCount[]> {
  const supabase = await createClient();

  const [{ data: clients }, { data: creatives }] = await Promise.all([
    supabase.from("clients").select("*").is("archived_at", null).order("name"),
    supabase.from("creatives").select("id, client_id").is("archived_at", null),
  ]);

  const ids = (creatives ?? []).map((row) => row.id as string);
  const publishedIds = new Set<string>();
  if (ids.length > 0) {
    const { data: stats } = await supabase
      .from("creative_stats")
      .select("id, is_published")
      .in("id", ids);
    for (const row of stats ?? []) {
      if (row.is_published) publishedIds.add(row.id as string);
    }
  }

  const totals = new Map<string, { total: number; unlaunched: number }>();
  for (const row of creatives ?? []) {
    const key = row.client_id as string | null;
    if (!key) continue;
    const entry = totals.get(key) ?? { total: 0, unlaunched: 0 };
    entry.total += 1;
    if (!publishedIds.has(row.id as string)) entry.unlaunched += 1;
    totals.set(key, entry);
  }

  return ((clients ?? []) as ClientRecord[]).map((client) => ({
    ...client,
    creativeCount: totals.get(client.id)?.total ?? 0,
    unlaunchedCount: totals.get(client.id)?.unlaunched ?? 0,
  }));
}

export async function getClient(id: string): Promise<ClientRecord | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("clients").select("*").eq("id", id).maybeSingle();
  return (data as ClientRecord) ?? null;
}
