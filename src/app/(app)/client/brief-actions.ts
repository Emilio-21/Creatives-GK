"use server";

import { revalidatePath } from "next/cache";
import { deliverSlackSoon } from "@/lib/slack-after";
import { requireUser } from "@/lib/auth";
import { normalizeDocUrl, type BriefStatus, type Channel } from "@/lib/brief-flow";
import { getPreviewUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import { attempt, type ActionResult } from "@/lib/action-result";

export type BriefRow = {
  id: string;
  client_id: string;
  batch_id: string | null;
  title: string;
  /** Texto de briefs viejos. Los nuevos viven en `doc_url`. */
  body: string;
  doc_url: string | null;
  brief_date: string;
  status: BriefStatus;
  channel: Channel;
  /** Quien tiene la pelota ahora: el responsable de la etapa en curso. */
  assigned_to: string | null;
  reviewer_id: string | null;
  producer_id: string | null;
  launcher_id: string | null;
  /** Cuando llego la etapa a quien la tiene, y cuando la tomo (null = pendiente). */
  stage_entered_at: string | null;
  stage_started_at: string | null;
  due_date: string | null;
  /** Vistos buenos de aprobación. Se borran al salir de la etapa. */
  copy_ok_by: string | null;
  copy_ok_at: string | null;
  media_ok_by: string | null;
  media_ok_at: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

export type BriefWithMeta = BriefRow & {
  batchName: string | null;
  batchCompletedAt: string | null;
  creativeCount: number;
  authorName: string | null;
  assigneeName: string | null;
  /** Foto firmada de quien la tiene, o null (se pintan sus iniciales). */
  assigneeAvatarUrl: string | null;
};

/** Encargos de copy para diseño. Las instrucciones viven en el Google Doc enlazado. */
async function listBriefsImpl(clientId: string): Promise<BriefWithMeta[]> {
  await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("briefs")
    .select("*")
    .eq("client_id", clientId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false });

  const briefs = (data ?? []) as (BriefRow & { created_by: string })[];
  if (briefs.length === 0) return [];

  const batchIds = [...new Set(briefs.map((b) => b.batch_id).filter(Boolean))] as string[];
  const authorIds = [
    ...new Set(
      briefs
        .flatMap((b) => [
          b.updated_by ?? b.created_by,
          b.assigned_to,
          b.reviewer_id,
          b.producer_id,
          b.launcher_id,
        ])
        .filter(Boolean),
    ),
  ] as string[];

  const [{ data: batches }, { data: profiles }] = await Promise.all([
    batchIds.length
      ? supabase.from("batches").select("id, name, completed_at").in("id", batchIds)
      : Promise.resolve({ data: [] }),
    supabase.from("profiles").select("id, full_name, avatar_path").in("id", authorIds),
  ]);

  const batchInfo = new Map(
    (batches ?? []).map((b) => [
      b.id as string,
      { name: b.name as string, completedAt: (b.completed_at as string | null) ?? null },
    ]),
  );

  // Cuantos diseños entrego cada brief.
  const counts = new Map<string, number>();
  if (batchIds.length > 0) {
    const { data: creatives } = await supabase
      .from("creatives")
      .select("batch_id")
      .in("batch_id", batchIds)
      // Anuncios, no archivos: un par 1:1 + 9:16 es un diseño, no dos.
      .is("parent_id", null)
      .is("archived_at", null);
    for (const row of creatives ?? []) {
      const key = row.batch_id as string;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const authors = new Map(
    (profiles ?? []).map((p) => [p.id as string, (p.full_name as string | null) ?? null]),
  );
  // Una firma por persona, no por brief: la misma cara sale en varias tarjetas.
  const avatars = new Map(
    await Promise.all(
      (profiles ?? [])
        .filter((p) => p.avatar_path)
        .map(async (p) => [p.id as string, await getPreviewUrl(p.avatar_path as string)] as const),
    ),
  );

  return briefs.map((brief) => ({
    ...brief,
    batchName: brief.batch_id ? (batchInfo.get(brief.batch_id)?.name ?? null) : null,
    batchCompletedAt: brief.batch_id
      ? (batchInfo.get(brief.batch_id)?.completedAt ?? null)
      : null,
    creativeCount: brief.batch_id ? (counts.get(brief.batch_id) ?? 0) : 0,
    authorName: authors.get(brief.updated_by ?? brief.created_by) ?? null,
    assigneeName: brief.assigned_to ? (authors.get(brief.assigned_to) ?? null) : null,
    assigneeAvatarUrl: brief.assigned_to ? (avatars.get(brief.assigned_to) ?? null) : null,
  }));
}

async function saveBriefImpl(input: {
  id?: string;
  clientId: string;
  batchId?: string | null;
  title: string;
  docUrl: string | null;
  briefDate: string;
  channel?: Channel;
  /** Solo al crear. Despues se cambian con setBriefOwner, que avisa y deja historial. */
  owners?: { reviewer_id: string | null; producer_id: string | null; launcher_id: string | null };
}): Promise<string> {
  const user = await requireUser();

  const title = input.title.trim();
  if (!title) throw new Error("Ponle título a la tarea.");
  const docUrl = input.docUrl ? normalizeDocUrl(input.docUrl) : null;

  const supabase = await createClient();

  if (input.id) {
    const { error, count } = await supabase
      .from("briefs")
      .update(
        {
          title,
          doc_url: docUrl,
          brief_date: input.briefDate,
          ...(input.channel ? { channel: input.channel } : {}),
          ...(input.batchId !== undefined ? { batch_id: input.batchId } : {}),
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        },
        { count: "exact" },
      )
      .eq("id", input.id);

    if (error) throw new Error(error.message);
    if (!count) throw new Error("No se pudo guardar la tarea.");

    revalidatePath("/", "layout");
    return input.id;
  }

  const { data, error } = await supabase
    .from("briefs")
    .insert({
      client_id: input.clientId,
      batch_id: input.batchId ?? null,
      title,
      doc_url: docUrl,
      brief_date: input.briefDate,
      channel: input.channel ?? "ads",
      ...(input.owners ?? {}),
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  revalidatePath("/", "layout");
  return data.id as string;
}

/**
 * Diseño publica: los creativos ya subidos quedan en "sin lanzar" con su batch,
 * la tarea queda ligada a ese batch y el batch se marca como completado.
 *
 * Publicar no mueve archivos: los creativos ya se subieron con ese batch_id.
 * Lo que hace es mandar los diseños a aprobación. Si pidieron cambios, se
 * vuelve a publicar igual: la tarea regresa a aprobación.
 */
async function publishBriefImpl(
  briefId: string,
  batchId: string,
): Promise<{ handedOff: boolean; reason: string | null }> {
  await requireUser();
  const supabase = await createClient();

  const { count } = await supabase
    .from("creatives")
    .select("id", { count: "exact", head: true })
    .eq("batch_id", batchId)
    .is("archived_at", null);

  if (!count) {
    throw new Error("Sube al menos un diseño antes de publicar.");
  }

  const { error: batchError } = await supabase
    .from("batches")
    .update({ completed_at: new Date().toISOString() })
    .eq("id", batchId);
  if (batchError) throw new Error(batchError.message);

  const { error } = await supabase
    .from("briefs")
    .update({ batch_id: batchId, updated_at: new Date().toISOString() })
    .eq("id", briefId);
  if (error) throw new Error(error.message);

  // Publicar ES producción diciendo "ya está": pasa a aprobación por la misma
  // funcion que el resto, para que quede en el historial y avise a copy y media.
  //
  // Si no se puede (la tarea no estaba en producción, o falta copy o media)
  // los diseños ya estan arriba: no se deshace, se dice por que.
  const { error: pasoError } = await supabase.rpc("transition_brief", {
    p_brief: briefId,
    p_to: "en_aprobacion",
    p_assigned: null,
    p_note: null,
  });

  revalidatePath("/", "layout");
  if (!pasoError) deliverSlackSoon();
  return { handedOff: !pasoError, reason: pasoError?.message ?? null };
}

// ---- Acciones expuestas al navegador ----
// Regresan el error en vez de lanzarlo: en produccion Next oculta el mensaje de
// lo que se lanza. Ver src/lib/action-result.ts.

export async function listBriefs(
  ...args: Parameters<typeof listBriefsImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof listBriefsImpl>>>> {
  return attempt(() => listBriefsImpl(...args));
}

export async function publishBrief(
  ...args: Parameters<typeof publishBriefImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof publishBriefImpl>>>> {
  return attempt(() => publishBriefImpl(...args));
}

export async function saveBrief(
  ...args: Parameters<typeof saveBriefImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof saveBriefImpl>>>> {
  return attempt(() => saveBriefImpl(...args));
}
