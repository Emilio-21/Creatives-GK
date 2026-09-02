"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type BriefRow = {
  id: string;
  client_id: string;
  batch_id: string | null;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

export type BriefWithMeta = BriefRow & {
  batchName: string | null;
  authorName: string | null;
};

/** Instrucciones de copy para diseño. Reemplaza el Google Doc suelto. */
export async function listBriefs(clientId: string): Promise<BriefWithMeta[]> {
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
    ...new Set(briefs.map((b) => b.updated_by ?? b.created_by).filter(Boolean)),
  ] as string[];

  const [{ data: batches }, { data: profiles }] = await Promise.all([
    batchIds.length
      ? supabase.from("batches").select("id, name").in("id", batchIds)
      : Promise.resolve({ data: [] }),
    supabase.from("profiles").select("id, full_name").in("id", authorIds),
  ]);

  const batchNames = new Map((batches ?? []).map((b) => [b.id as string, b.name as string]));
  const authors = new Map(
    (profiles ?? []).map((p) => [p.id as string, (p.full_name as string | null) ?? null]),
  );

  return briefs.map((brief) => ({
    ...brief,
    batchName: brief.batch_id ? (batchNames.get(brief.batch_id) ?? null) : null,
    authorName: authors.get(brief.updated_by ?? brief.created_by) ?? null,
  }));
}

export async function saveBrief(input: {
  id?: string;
  clientId: string;
  batchId: string | null;
  title: string;
  body: string;
}): Promise<string> {
  const user = await requireUser();

  const title = input.title.trim();
  if (!title) throw new Error("Ponle título al brief.");

  const supabase = await createClient();

  if (input.id) {
    const { error, count } = await supabase
      .from("briefs")
      .update(
        {
          title,
          body: input.body,
          batch_id: input.batchId,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        },
        { count: "exact" },
      )
      .eq("id", input.id);

    if (error) throw new Error(error.message);
    if (!count) throw new Error("No se pudo guardar el brief.");

    revalidatePath("/", "layout");
    return input.id;
  }

  const { data, error } = await supabase
    .from("briefs")
    .insert({
      client_id: input.clientId,
      batch_id: input.batchId,
      title,
      body: input.body,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  revalidatePath("/", "layout");
  return data.id as string;
}

/** Archiva, no borra: un brief es el historial de por qué se pidió cada ad. */
export async function archiveBrief(briefId: string): Promise<void> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("briefs")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", briefId);

  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}
