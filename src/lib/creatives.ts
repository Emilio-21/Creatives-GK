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
  client_id: string | null;
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
  active_launch_count: number;
  first_launched_at: string | null;
  last_launched_at: string | null;
  total_spend: number | null;
  total_impressions: number | null;
  total_clicks: number | null;
  total_results: number | null;
  ctr: number | null;
  cpm: number | null;
  cpc: number | null;
  cpa: number | null;
};

export type CreativeCard = CreativeRow & {
  /** Poster para video, el archivo para imagen. Firmada 1 h. */
  previewUrl: string | null;
  stats: CreativeStats | null;
  uploaderName: string | null;
};

export type LibrarySort =
  | "recientes"
  | "antiguos"
  | "nombre"
  | "gasto"
  | "ctr"
  | "cpa";

export type LibraryFilters = {
  /** null = todos los clientes. */
  clientId?: string;
  q?: string;
  onlyUnlaunched?: boolean;
  /** Por defecto se ocultan; con true se muestran SOLO los archivados. */
  onlyArchived?: boolean;
  sort?: LibrarySort;
  page?: number;
};

export async function getLibrary(filters: LibraryFilters) {
  const supabase = await createClient();
  const page = Math.max(1, filters.page ?? 1);

  // El universo es de unos cientos de archivos, no millones: se traen todos los
  // que pasan el filtro y se ordena/pagina aqui. Asi se puede ordenar por
  // metricas, que viven en la vista y no en la tabla.
  let query = supabase.from("creatives").select("*").limit(2000);
  query = filters.onlyArchived
    ? query.not("archived_at", "is", null)
    : query.is("archived_at", null);

  if (filters.clientId) query = query.eq("client_id", filters.clientId);
  if (filters.q) query = query.ilike("display_name", `%${filters.q}%`);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const creatives = (data ?? []) as CreativeRow[];
  const ids = creatives.map((creative) => creative.id);

  // creative_stats es una vista sin FK declarada: se trae aparte y se junta aqui.
  const statsById = new Map<string, CreativeStats>();
  if (ids.length > 0) {
    const { data: stats } = await supabase.from("creative_stats").select("*").in("id", ids);
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

  const merged = creatives.map((creative) => ({
    creative,
    stats: statsById.get(creative.id) ?? null,
  }));

  const visible = filters.onlyUnlaunched
    ? merged.filter((row) => !row.stats?.is_published)
    : merged;

  const sorted = sortRows(visible, filters.sort ?? "recientes");

  const total = sorted.length;
  const from = (page - 1) * PAGE_SIZE;
  const slice = sorted.slice(from, from + PAGE_SIZE);

  // Solo se firman las URLs de la pagina visible.
  const cards: CreativeCard[] = await Promise.all(
    slice.map(async ({ creative, stats }) => {
      // El grid solo carga posters, nunca el video (§3.6).
      const path = creative.media_type === "video" ? creative.poster_path : creative.storage_path;
      return {
        ...creative,
        previewUrl: path ? await getPreviewUrl(path) : null,
        stats,
        uploaderName: namesById.get(creative.uploaded_by) ?? null,
      };
    }),
  );

  return {
    cards,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

type MergedRow = { creative: CreativeRow; stats: CreativeStats | null };

/** Los nulos siempre al final: un creativo sin metricas no es "el mejor CPA". */
function sortRows(rows: MergedRow[], sort: LibrarySort): MergedRow[] {
  const byMetric = (
    pick: (row: MergedRow) => number | null,
    direction: "asc" | "desc",
  ) =>
    [...rows].sort((a, b) => {
      const left = pick(a);
      const right = pick(b);
      if (left === null && right === null) return 0;
      if (left === null) return 1;
      if (right === null) return -1;
      return direction === "asc" ? left - right : right - left;
    });

  switch (sort) {
    case "antiguos":
      return [...rows].sort((a, b) =>
        a.creative.created_at.localeCompare(b.creative.created_at),
      );
    case "nombre":
      return [...rows].sort((a, b) =>
        a.creative.display_name.localeCompare(b.creative.display_name, "es"),
      );
    case "gasto":
      return byMetric((row) => row.stats?.total_spend ?? null, "desc");
    case "ctr":
      return byMetric((row) => row.stats?.ctr ?? null, "desc");
    case "cpa":
      // Menor CPA es mejor.
      return byMetric((row) => row.stats?.cpa ?? null, "asc");
    default:
      return [...rows].sort((a, b) =>
        b.creative.created_at.localeCompare(a.creative.created_at),
      );
  }
}
