"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { deliverSlackSoon } from "@/lib/slack-after";
import { getPreviewUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import { attempt, type ActionResult } from "@/lib/action-result";

export type BriefComment = {
  id: string;
  /** 'aprobado' y 'cambios' los escribe el flujo al aprobar o pedir cambios. */
  kind: "comentario" | "aprobado" | "cambios";
  body: string | null;
  authorName: string;
  authorAvatarUrl: string | null;
  createdAt: string;
  /** Es mio: lo puedo borrar (solo los comentarios, no los vistos buenos). */
  mine: boolean;
};

/** El hilo de la tarea, del mas viejo al mas nuevo: se lee como conversacion. */
async function listCommentsImpl(briefId: string): Promise<BriefComment[]> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("brief_comments")
    .select("id, kind, body, author, created_at")
    .eq("brief_id", briefId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const authorIds = [...new Set(rows.map((row) => row.author as string))];
  const { data: profiles } = authorIds.length
    ? await supabase.from("profiles").select("id, full_name, avatar_path").in("id", authorIds)
    : { data: [] };

  // Una firma por persona, no por comentario.
  const autores = new Map(
    await Promise.all(
      (profiles ?? []).map(
        async (p) =>
          [
            p.id as string,
            {
              name: (p.full_name as string | null) ?? "sin nombre",
              avatarUrl: p.avatar_path ? await getPreviewUrl(p.avatar_path as string) : null,
            },
          ] as const,
      ),
    ),
  );

  return rows.map((row) => ({
    id: row.id as string,
    kind: row.kind as BriefComment["kind"],
    body: (row.body as string | null) ?? null,
    authorName: autores.get(row.author as string)?.name ?? "sin nombre",
    authorAvatarUrl: autores.get(row.author as string)?.avatarUrl ?? null,
    createdAt: row.created_at as string,
    mine: row.author === user.id,
  }));
}

/** La base guarda el comentario y avisa a quienes estan en la tarea. */
async function addCommentImpl(briefId: string, body: string): Promise<void> {
  await requireUser();
  const supabase = await createClient();

  const { error } = await supabase.rpc("add_brief_comment", { p_brief: briefId, p_body: body });
  if (error) throw new Error(error.message);

  revalidatePath("/", "layout");
  deliverSlackSoon();
}

async function deleteCommentImpl(commentId: string): Promise<void> {
  await requireUser();
  const supabase = await createClient();

  const { error, count } = await supabase
    .from("brief_comments")
    .delete({ count: "exact" })
    .eq("id", commentId);
  if (error) throw new Error(error.message);
  if (!count) throw new Error("Solo puedes borrar tus comentarios.");
}

// ---- Acciones expuestas al navegador ----
// Regresan el error en vez de lanzarlo: en produccion Next oculta el mensaje de
// lo que se lanza. Ver src/lib/action-result.ts.

export async function listComments(
  ...args: Parameters<typeof listCommentsImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof listCommentsImpl>>>> {
  return attempt(() => listCommentsImpl(...args));
}

export async function addComment(
  ...args: Parameters<typeof addCommentImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof addCommentImpl>>>> {
  return attempt(() => addCommentImpl(...args));
}

export async function deleteComment(
  ...args: Parameters<typeof deleteCommentImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof deleteCommentImpl>>>> {
  return attempt(() => deleteCommentImpl(...args));
}
