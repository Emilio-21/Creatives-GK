"use server";

import { requireUser } from "@/lib/auth";
import { appUrl } from "@/lib/app-url";
import { portalPath } from "@/lib/client-requests";
import { deleteFile, getDownloadUrl, getPreviewUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import { attempt, type ActionResult } from "@/lib/action-result";

/** Lo que el navegador puede mostrar solo; lo demas se descarga con su nombre. */
const INLINE = /^(application\/pdf|image\/|video\/|audio\/)/;

/** Cerrados que se siguen mostrando: lo reciente sirve, el historial completo no. */
const CERRADOS_VISIBLES = 10;

export type RequestFile = {
  id: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number;
  createdAt: string;
};

export type ClientRequest = {
  id: string;
  title: string;
  instructions: string;
  dueDate: string | null;
  createdBy: string;
  authorName: string | null;
  createdAt: string;
  deliveredAt: string | null;
  closedAt: string | null;
  files: RequestFile[];
};

async function listRequestsImpl(clientId: string): Promise<ClientRequest[]> {
  await requireUser();
  const supabase = await createClient();

  const columnas =
    "id, title, instructions, due_date, created_by, created_at, delivered_at, closed_at, client_request_files(id, file_name, mime_type, size_bytes, created_at)";
  const [abiertos, cerrados] = await Promise.all([
    supabase
      .from("client_requests")
      .select(columnas)
      .eq("client_id", clientId)
      .is("closed_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("client_requests")
      .select(columnas)
      .eq("client_id", clientId)
      .not("closed_at", "is", null)
      .order("closed_at", { ascending: false })
      .limit(CERRADOS_VISIBLES),
  ]);
  if (abiertos.error) throw new Error(abiertos.error.message);
  if (cerrados.error) throw new Error(cerrados.error.message);

  const rows = [...(abiertos.data ?? []), ...(cerrados.data ?? [])];
  const autores = [...new Set(rows.map((r) => r.created_by as string))];
  const { data: perfiles } = autores.length
    ? await supabase.from("profiles").select("id, full_name").in("id", autores)
    : { data: [] };
  const nombres = new Map((perfiles ?? []).map((p) => [p.id as string, p.full_name as string]));

  return rows.map((row) => ({
    id: row.id as string,
    title: row.title as string,
    instructions: (row.instructions as string) ?? "",
    dueDate: (row.due_date as string | null) ?? null,
    createdBy: row.created_by as string,
    authorName: nombres.get(row.created_by as string) ?? null,
    createdAt: row.created_at as string,
    deliveredAt: (row.delivered_at as string | null) ?? null,
    closedAt: (row.closed_at as string | null) ?? null,
    files: ((row.client_request_files ?? []) as Record<string, unknown>[])
      .map((f) => ({
        id: f.id as string,
        fileName: f.file_name as string,
        mimeType: (f.mime_type as string | null) ?? null,
        sizeBytes: Number(f.size_bytes),
        createdAt: f.created_at as string,
      }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  }));
}

/** El link del cliente, completo. Se crea la primera vez; `renew` lo cambia. */
async function portalLinkImpl(clientId: string, renew = false): Promise<string> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("client_portal_token", {
    p_client: clientId,
    p_renew: renew,
  });
  if (error) throw new Error(error.message);
  return `${appUrl()}${portalPath(data as string)}`;
}

type RequestInput = { title: string; instructions: string; dueDate: string | null };

function limpiar(input: RequestInput) {
  const title = input.title.trim();
  if (!title) throw new Error("Escribe qué le pides al cliente.");
  if (title.length > 140) throw new Error("El título es muy largo (máximo 140).");
  return {
    title,
    instructions: input.instructions.trim(),
    due_date: input.dueDate || null,
  };
}

async function createRequestImpl(clientId: string, input: RequestInput): Promise<string> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("client_requests")
    .insert({ client_id: clientId, created_by: user.id, ...limpiar(input) })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

async function updateRequestImpl(id: string, input: RequestInput): Promise<void> {
  await requireUser();
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("client_requests")
    .update(limpiar(input), { count: "exact" })
    .eq("id", id);
  if (error) throw new Error(error.message);
  if (!count) throw new Error("Ese pedido ya no existe.");
}

/** Cerrado ya no le aparece al cliente; reabrir lo regresa a su link. */
async function setRequestClosedImpl(id: string, closed: boolean): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("client_requests")
    .update(
      closed
        ? { closed_at: new Date().toISOString(), closed_by: user.id }
        : { closed_at: null, closed_by: null },
      { count: "exact" },
    )
    .eq("id", id);
  if (error) throw new Error(error.message);
  if (!count) throw new Error("Ese pedido ya no existe.");
}

/** Borra el pedido y lo que subio el cliente, tambien de R2. */
async function deleteRequestImpl(id: string): Promise<void> {
  await requireUser();
  const supabase = await createClient();

  const { data: files } = await supabase
    .from("client_request_files")
    .select("storage_path")
    .eq("request_id", id);

  // La policy decide (quien lo pidio o admin): count 0 = no se pudo.
  const { error, count } = await supabase
    .from("client_requests")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) throw new Error(error.message);
  if (!count) throw new Error("Solo quien lo pidió o un admin puede borrarlo.");

  await Promise.all(
    (files ?? []).map((f) => deleteFile(f.storage_path as string).catch(() => {})),
  );
}

async function deleteRequestFileImpl(fileId: string): Promise<void> {
  await requireUser();
  const supabase = await createClient();

  const { data: row } = await supabase
    .from("client_request_files")
    .select("storage_path")
    .eq("id", fileId)
    .maybeSingle();
  if (!row) throw new Error("Ese archivo ya no existe.");

  const { error, count } = await supabase
    .from("client_request_files")
    .delete({ count: "exact" })
    .eq("id", fileId);
  if (error) throw new Error(error.message);
  if (!count) throw new Error("Solo quien lo pidió o un admin puede borrarlo.");

  await deleteFile(row.storage_path as string).catch(() => {});
}

/** URL firmada para ver o descargar lo que subio el cliente. */
async function openRequestFileImpl(fileId: string, download = false): Promise<string> {
  await requireUser();
  const supabase = await createClient();

  const { data: row } = await supabase
    .from("client_request_files")
    .select("storage_path, file_name, mime_type")
    .eq("id", fileId)
    .maybeSingle();
  if (!row) throw new Error("Ese archivo ya no existe.");

  const path = row.storage_path as string;
  if (!download && INLINE.test(String(row.mime_type ?? ""))) return getPreviewUrl(path);
  return getDownloadUrl(path, row.file_name as string);
}

// ---- Acciones expuestas al navegador ----
// Regresan el error en vez de lanzarlo: en produccion Next oculta el mensaje de
// lo que se lanza. Ver src/lib/action-result.ts.

export async function listRequests(
  ...args: Parameters<typeof listRequestsImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof listRequestsImpl>>>> {
  return attempt(() => listRequestsImpl(...args));
}

export async function portalLink(
  ...args: Parameters<typeof portalLinkImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof portalLinkImpl>>>> {
  return attempt(() => portalLinkImpl(...args));
}

export async function createRequest(
  ...args: Parameters<typeof createRequestImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof createRequestImpl>>>> {
  return attempt(() => createRequestImpl(...args));
}

export async function updateRequest(
  ...args: Parameters<typeof updateRequestImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof updateRequestImpl>>>> {
  return attempt(() => updateRequestImpl(...args));
}

export async function setRequestClosed(
  ...args: Parameters<typeof setRequestClosedImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof setRequestClosedImpl>>>> {
  return attempt(() => setRequestClosedImpl(...args));
}

export async function deleteRequest(
  ...args: Parameters<typeof deleteRequestImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof deleteRequestImpl>>>> {
  return attempt(() => deleteRequestImpl(...args));
}

export async function deleteRequestFile(
  ...args: Parameters<typeof deleteRequestFileImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof deleteRequestFileImpl>>>> {
  return attempt(() => deleteRequestFileImpl(...args));
}

export async function openRequestFile(
  ...args: Parameters<typeof openRequestFileImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof openRequestFileImpl>>>> {
  return attempt(() => openRequestFileImpl(...args));
}
