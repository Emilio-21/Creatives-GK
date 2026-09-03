"use server";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getDownloadUrl } from "@/lib/storage";

export type DownloadTarget = {
  id: string;
  url: string;
  filename: string;
};

/** Tope por lote: el zip se arma en memoria del navegador. */
const MAX_BATCH = 25;

/**
 * Firma las descargas y las registra en `downloads`.
 *
 * El zip se genera en el cliente a partir de estas URLs: en el servidor no cabe,
 * Vercel Hobby corta a los 10 s (§8).
 */
export async function requestDownloads(creativeIds: string[]): Promise<DownloadTarget[]> {
  const user = await requireUser();

  const ids = [...new Set(creativeIds)].filter(Boolean);
  if (ids.length === 0) return [];
  if (ids.length > MAX_BATCH) {
    throw new Error(`Máximo ${MAX_BATCH} archivos por descarga. Selecciona menos.`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("creatives")
    .select("id, storage_path, original_filename, display_name")
    .in("id", ids);

  if (error) throw new Error(error.message);
  const rows = data ?? [];
  if (rows.length === 0) throw new Error("No se encontraron los creativos.");

  const targets = await Promise.all(
    rows.map(async (row) => ({
      id: row.id as string,
      filename: (row.original_filename as string) || (row.display_name as string),
      url: await getDownloadUrl(
        row.storage_path as string,
        (row.original_filename as string) || (row.display_name as string),
      ),
    })),
  );

  // El historial es parte del valor de la app: saber quien se llevo que.
  const { error: logError } = await supabase
    .from("downloads")
    .insert(rows.map((row) => ({ creative_id: row.id as string, user_id: user.id })));
  if (logError) {
    // Registrar es secundario; no vale tumbar la descarga por esto.
    console.error("No se pudo registrar la descarga:", logError.message);
  }

  return targets;
}

export type DownloadLogEntry = {
  id: string;
  downloaded_at: string;
  userName: string;
};

export async function getDownloadHistory(creativeId: string): Promise<DownloadLogEntry[]> {
  await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("downloads")
    .select("id, downloaded_at, user_id")
    .eq("creative_id", creativeId)
    .order("downloaded_at", { ascending: false })
    .limit(50);

  const rows = data ?? [];
  const userIds = [...new Set(rows.map((row) => row.user_id as string))];

  const names = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds);
    for (const profile of profiles ?? []) {
      names.set(profile.id as string, (profile.full_name as string | null) ?? "sin nombre");
    }
  }

  return rows.map((row) => ({
    id: row.id as string,
    downloaded_at: row.downloaded_at as string,
    userName: names.get(row.user_id as string) ?? "sin nombre",
  }));
}
