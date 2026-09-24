"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getPreviewUrl } from "@/lib/storage";
import { aspectLabel } from "@/lib/aspect";
import type { CreativeRow, CreativeStats, CreativeVariant } from "@/lib/creatives";
import type { LaunchRow } from "@/lib/launches";
import { attempt, type ActionResult } from "@/lib/action-result";
import { today } from "@/lib/dates";

export type CreativeDetail = {
  creative: CreativeRow;
  clientName: string | null;
  mediaUrl: string;
  posterUrl: string | null;
  launches: LaunchRow[];
  stats: CreativeStats | null;
  /** Los otros formatos del mismo anuncio. */
  variants: CreativeVariant[];
  aspect: string | null;
};

/** Todo lo que necesita el modal, en una sola llamada. */
async function getCreativeDetailImpl(id: string): Promise<CreativeDetail> {
  await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("creatives")
    .select("*, clients(id, name)")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("No se encontró el creativo.");

  const creative = data as CreativeRow & { clients: { id: string; name: string } | null };

  const [mediaUrl, posterUrl, { data: launches }, { data: stats }, { data: variantRows }] =
    await Promise.all([
    getPreviewUrl(creative.storage_path),
    creative.poster_path ? getPreviewUrl(creative.poster_path) : Promise.resolve(null),
    supabase
      .from("launches")
      .select("*")
      .eq("creative_id", id)
      .order("launched_at", { ascending: false }),
    supabase.from("creative_stats").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("creatives")
      .select("id, display_name, original_filename, storage_path, poster_path, media_type, width, height")
      .eq("parent_id", id)
      .is("archived_at", null)
      .order("created_at", { ascending: true }),
  ]);

  const variants: CreativeVariant[] = await Promise.all(
    (variantRows ?? []).map(async (row) => {
      const path =
        row.media_type === "video"
          ? (row.poster_path as string | null)
          : (row.storage_path as string);
      return {
        id: row.id as string,
        display_name: row.display_name as string,
        original_filename: row.original_filename as string,
        aspect: aspectLabel(row.width as number | null, row.height as number | null),
        previewUrl: path ? await getPreviewUrl(path) : null,
      };
    }),
  );

  return {
    creative,
    clientName: creative.clients?.name ?? null,
    mediaUrl,
    posterUrl,
    launches: (launches ?? []) as LaunchRow[],
    stats: (stats as CreativeStats) ?? null,
    variants,
    aspect: aspectLabel(creative.width, creative.height),
  };
}

/**
 * Marcar como lanzado desde el tablero.
 *
 * `publicado` es derivado (§3.3): no hay un campo que prender. Esto crea un
 * lanzamiento con la fecha de hoy y sin metricas, para capturarlas despues.
 */
async function quickLaunchImpl(creativeId: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();

  const { error } = await supabase.from("launches").insert({
    creative_id: creativeId,
    launched_at: today(),
    platform: "meta",
    metrics_source: "manual",
    created_by: user.id,
  });

  if (error) throw new Error(`No se pudo marcar como lanzado: ${error.message}`);

  revalidatePath("/", "layout");
}

// ---- Acciones expuestas al navegador ----
// Regresan el error en vez de lanzarlo: en produccion Next oculta el mensaje de
// lo que se lanza. Ver src/lib/action-result.ts.

export async function getCreativeDetail(
  ...args: Parameters<typeof getCreativeDetailImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof getCreativeDetailImpl>>>> {
  return attempt(() => getCreativeDetailImpl(...args));
}

export async function quickLaunch(
  ...args: Parameters<typeof quickLaunchImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof quickLaunchImpl>>>> {
  return attempt(() => quickLaunchImpl(...args));
}
