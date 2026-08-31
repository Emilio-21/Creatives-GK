import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getPreviewUrl } from "@/lib/storage";

export const PAGE_SIZE = 48;

export type CreativeRow = {
  id: string;
  original_filename: string;
  display_name: string;
  storage_path: string;
  poster_path: string | null;
  mime_type: string;
  file_size: number;
  media_type: "image" | "video";
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  client: string | null;
  concept: string | null;
  format: string | null;
  tags: string[];
  notes: string | null;
  uploaded_by: string;
  created_at: string;
  archived_at: string | null;
};

export type CreativeStats = {
  id: string;
  launch_count: number;
  is_published: boolean;
  first_launched_at: string | null;
  last_launched_at: string | null;
  total_spend: number | null;
  ctr: number | null;
  cpa: number | null;
};

export type CreativeCard = CreativeRow & {
  /** Poster para video, el archivo para imagen. Firmada 1 h. */
  previewUrl: string | null;
  stats: CreativeStats | null;
  uploaderName: string | null;
};

export type LibraryFilters = {
  q?: string;
  client?: string;
  format?: string;
  tag?: string;
  uploadedBy?: string;
  status?: "sin-lanzar" | "lanzados";
  sort?: "recientes" | "antiguos" | "nombre";
  page?: number;
};

export async function getLibrary(filters: LibraryFilters) {
  const supabase = await createClient();
  const page = Math.max(1, filters.page ?? 1);

  let query = supabase
    .from("creatives")
    .select("*", { count: "exact" })
    .is("archived_at", null);

  if (filters.q) query = query.ilike("display_name", `%${filters.q}%`);
  if (filters.client) query = query.eq("client", filters.client);
  if (filters.format) query = query.eq("format", filters.format);
  if (filters.tag) query = query.contains("tags", [filters.tag]);
  if (filters.uploadedBy) query = query.eq("uploaded_by", filters.uploadedBy);

  query =
    filters.sort === "antiguos"
      ? query.order("created_at", { ascending: true })
      : filters.sort === "nombre"
        ? query.order("display_name", { ascending: true })
        : query.order("created_at", { ascending: false });

  const from = (page - 1) * PAGE_SIZE;
  const { data, count, error } = await query.range(from, from + PAGE_SIZE - 1);
  if (error) throw new Error(error.message);

  const creatives = (data ?? []) as CreativeRow[];
  const ids = creatives.map((creative) => creative.id);

  // creative_stats es una vista sin FK declarada: se trae aparte y se junta aqui.
  const statsById = new Map<string, CreativeStats>();
  if (ids.length > 0) {
    const { data: stats } = await supabase
      .from("creative_stats")
      .select("id, launch_count, is_published, first_launched_at, last_launched_at, total_spend, ctr, cpa")
      .in("id", ids);
    for (const row of (stats ?? []) as CreativeStats[]) statsById.set(row.id, row);
  }

  const namesById = new Map<string, string | null>();
  const uploaderIds = [...new Set(creatives.map((creative) => creative.uploaded_by))];
  if (uploaderIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", uploaderIds);
    for (const row of profiles ?? []) {
      namesById.set(row.id as string, (row.full_name as string | null) ?? null);
    }
  }

  const cards: CreativeCard[] = await Promise.all(
    creatives.map(async (creative) => {
      // El grid solo carga posters, nunca el video (§3.6).
      const path = creative.media_type === "video" ? creative.poster_path : creative.storage_path;
      return {
        ...creative,
        previewUrl: path ? await getPreviewUrl(path) : null,
        stats: statsById.get(creative.id) ?? null,
        uploaderName: namesById.get(creative.uploaded_by) ?? null,
      };
    }),
  );

  const filtered =
    filters.status === "sin-lanzar"
      ? cards.filter((card) => !card.stats?.is_published)
      : filters.status === "lanzados"
        ? cards.filter((card) => card.stats?.is_published)
        : cards;

  return {
    cards: filtered,
    total: count ?? 0,
    page,
    pageCount: Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)),
  };
}

/** Valores existentes para poblar los filtros. */
export async function getFilterOptions() {
  const supabase = await createClient();

  const [{ data: rows }, { data: profiles }] = await Promise.all([
    supabase.from("creatives").select("client, format, tags").is("archived_at", null),
    supabase.from("profiles").select("id, full_name"),
  ]);

  const clients = new Set<string>();
  const formats = new Set<string>();
  const tags = new Set<string>();

  for (const row of rows ?? []) {
    if (row.client) clients.add(row.client as string);
    if (row.format) formats.add(row.format as string);
    for (const tag of (row.tags as string[] | null) ?? []) tags.add(tag);
  }

  return {
    clients: [...clients].sort(),
    formats: [...formats].sort(),
    tags: [...tags].sort(),
    uploaders: (profiles ?? []).map((row) => ({
      id: row.id as string,
      name: (row.full_name as string | null) ?? "sin nombre",
    })),
  };
}
