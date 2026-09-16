"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { aspectLabel } from "@/lib/aspect";
import { selectAutoPairs } from "@/lib/pairing";

/**
 * Junta varios archivos bajo un solo anuncio.
 *
 * El principal se queda con el codigo [GK-xxxx], con los lanzamientos y con su
 * lugar en el tablero; los demas pasan a ser formatos suyos.
 */
export async function groupAsAd(parentId: string, variantIds: string[]): Promise<number> {
  await requireUser();
  const otros = variantIds.filter((id) => id !== parentId);
  if (otros.length === 0) return 0;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("group_creatives_as_ad", {
    p_parent: parentId,
    p_variantes: otros,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/", "layout");
  return (data as number) ?? 0;
}

/** Devuelve variantes a ser anuncios por su cuenta. */
export async function ungroup(variantIds: string[]): Promise<number> {
  await requireUser();
  if (variantIds.length === 0) return 0;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ungroup_creatives", { p_ids: variantIds });

  if (error) throw new Error(error.message);

  revalidatePath("/", "layout");
  return (data as number) ?? 0;
}

export type AutoPair = { principal: string; variantes: string[] };

/**
 * Agrupa solos los pares que acaban de subir.
 *
 * El diseñador suelta la tanda completa y la app acomoda: "10.jpg" y "10.2.jpg"
 * quedan como un anuncio sin que nadie lo pida. Solo se agrupa lo que no deja
 * duda, con las mismas reglas del script de biblioteca — un archivo agrupado de
 * mas hay que ir a separarlo a mano, y eso cuesta mas que agrupar de menos.
 *
 * Se aplica UNICAMENTE a los ids recien subidos: no toca nada que ya estuviera
 * en la biblioteca, aunque el nombre empate.
 */
export async function autoPairUploaded(creativeIds: string[]): Promise<AutoPair[]> {
  await requireUser();
  if (creativeIds.length < 2) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("creatives")
    .select("id, original_filename, media_type, width, height, client_id, parent_id")
    .in("id", creativeIds)
    .is("parent_id", null);

  const filas = (data ?? []) as {
    id: string;
    original_filename: string;
    media_type: "image" | "video";
    width: number | null;
    height: number | null;
    client_id: string | null;
  }[];

  const { elegidos } = selectAutoPairs(filas, {
    aspectoDe: (fila) => aspectLabel(fila.width, fila.height),
  });

  const hechos: AutoPair[] = [];
  for (const par of elegidos) {
    const { error } = await supabase.rpc("group_creatives_as_ad", {
      p_parent: par.principal.id,
      p_variantes: par.variantes.map((fila) => fila.id),
    });

    // Que falle un par no debe tumbar la subida: los archivos ya estan en la
    // biblioteca y se pueden agrupar a mano.
    if (error) continue;

    hechos.push({
      principal: par.principal.original_filename,
      variantes: par.variantes.map((fila) => fila.original_filename),
    });
  }

  if (hechos.length > 0) revalidatePath("/", "layout");
  return hechos;
}
