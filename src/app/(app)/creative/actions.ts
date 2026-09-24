"use server";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getDownloadUrl } from "@/lib/storage";
import { attempt, type ActionResult } from "@/lib/action-result";

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
 * El zip se genera en el cliente a partir de estas URLs: armarlo en el Worker
 * seria cargar cientos de MB en sus 128 MB de memoria.
 */
async function requestDownloadsImpl(creativeIds: string[]): Promise<DownloadTarget[]> {
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

  // Un anuncio con variantes se descarga completo: para armarlo en Meta hacen
  // falta los dos archivos, y pedir la 9:16 aparte seria un paso de mas que se
  // olvida justo cuando hay prisa.
  const { data: variantRows } = await supabase
    .from("creatives")
    .select("id, storage_path, original_filename, display_name")
    .in("parent_id", ids)
    .is("archived_at", null);

  for (const variant of variantRows ?? []) {
    if (!rows.some((row) => row.id === variant.id)) rows.push(variant);
  }

  if (rows.length > MAX_BATCH) {
    throw new Error(
      `La selección son ${rows.length} archivos contando las variantes; el máximo es ${MAX_BATCH}.`,
    );
  }

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

// ---- Acciones expuestas al navegador ----
// Regresan el error en vez de lanzarlo: en produccion Next oculta el mensaje de
// lo que se lanza. Ver src/lib/action-result.ts.

export async function requestDownloads(
  ...args: Parameters<typeof requestDownloadsImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof requestDownloadsImpl>>>> {
  return attempt(() => requestDownloadsImpl(...args));
}
