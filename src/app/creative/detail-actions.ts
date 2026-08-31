"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getPreviewUrl } from "@/lib/storage";
import type { CreativeRow, CreativeStats } from "@/lib/creatives";
import type { LaunchRow } from "@/lib/launches";

export type CreativeDetail = {
  creative: CreativeRow;
  clientName: string | null;
  mediaUrl: string;
  posterUrl: string | null;
  launches: LaunchRow[];
  stats: CreativeStats | null;
};

/** Todo lo que necesita el modal, en una sola llamada. */
export async function getCreativeDetail(id: string): Promise<CreativeDetail> {
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

  const [mediaUrl, posterUrl, { data: launches }, { data: stats }] = await Promise.all([
    getPreviewUrl(creative.storage_path),
    creative.poster_path ? getPreviewUrl(creative.poster_path) : Promise.resolve(null),
    supabase
      .from("launches")
      .select("*")
      .eq("creative_id", id)
      .order("launched_at", { ascending: false }),
    supabase.from("creative_stats").select("*").eq("id", id).maybeSingle(),
  ]);

  return {
    creative,
    clientName: creative.clients?.name ?? null,
    mediaUrl,
    posterUrl,
    launches: (launches ?? []) as LaunchRow[],
    stats: (stats as CreativeStats) ?? null,
  };
}

/**
 * Marcar como lanzado desde el tablero.
 *
 * `publicado` es derivado (§3.3): no hay un campo que prender. Esto crea un
 * lanzamiento con la fecha de hoy y sin metricas, para capturarlas despues.
 */
export async function quickLaunch(creativeId: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();

  const { error } = await supabase.from("launches").insert({
    creative_id: creativeId,
    launched_at: new Date().toISOString().slice(0, 10),
    platform: "meta",
    metrics_source: "manual",
    created_by: user.id,
  });

  if (error) throw new Error(`No se pudo marcar como lanzado: ${error.message}`);

  revalidatePath("/", "layout");
}
