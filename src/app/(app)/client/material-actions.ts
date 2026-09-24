"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { normalizeDocUrl } from "@/lib/brief-flow";
import {
  buildMaterialPath,
  deleteFile,
  getDownloadUrl,
  getPreviewUrl,
  getUploadUrl,
  statFile,
} from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import { attempt, type ActionResult } from "@/lib/action-result";

/** Presentaciones con video pesan mas que un ad: mas margen que los 100 MB de creativos. */
const MAX_MATERIAL_BYTES = 250 * 1024 * 1024;

/** Lo que el navegador puede mostrar solo; lo demas se descarga con su nombre. */
const INLINE = /^(application\/pdf|image\/|video\/|audio\/|text\/plain)/;

export type Material = {
  id: string;
  kind: "file" | "link";
  title: string;
  description: string;
  url: string | null;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  /** Miniatura firmada, solo para imagenes. */
  thumbUrl: string | null;
  authorName: string | null;
  createdBy: string;
  updatedAt: string;
};

async function listMaterialsImpl(clientId: string): Promise<Material[]> {
  await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("client_materials")
    .select("*")
    .eq("client_id", clientId)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const autores = [...new Set(rows.map((r) => (r.updated_by ?? r.created_by) as string))];
  const { data: perfiles } = autores.length
    ? await supabase.from("profiles").select("id, full_name").in("id", autores)
    : { data: [] };
  const nombres = new Map((perfiles ?? []).map((p) => [p.id as string, p.full_name as string]));

  return Promise.all(
    rows.map(async (row) => ({
      id: row.id as string,
      kind: row.kind as Material["kind"],
      title: row.title as string,
      description: (row.description as string) ?? "",
      url: (row.url as string | null) ?? null,
      fileName: (row.file_name as string | null) ?? null,
      mimeType: (row.mime_type as string | null) ?? null,
      sizeBytes: (row.size_bytes as number | null) ?? null,
      thumbUrl:
        row.kind === "file" && String(row.mime_type ?? "").startsWith("image/")
          ? await getPreviewUrl(row.storage_path as string)
          : null,
      authorName: nombres.get((row.updated_by ?? row.created_by) as string) ?? null,
      createdBy: row.created_by as string,
      updatedAt: row.updated_at as string,
    })),
  );
}

/** Firma la subida. La ruta la arma el servidor: el navegador no elige donde escribe. */
async function requestMaterialUploadImpl(
  clientId: string,
  file: { name: string; type: string; size: number },
): Promise<{ path: string; uploadUrl: string; contentType: string }> {
  await requireUser();
  if (file.size > MAX_MATERIAL_BYTES) {
    throw new Error(`"${file.name}" pesa más de 250 MB.`);
  }

  // Que el cliente exista y sea de mi organizacion (RLS) antes de firmar nada.
  const supabase = await createClient();
  const { data: client } = await supabase.from("clients").select("id").eq("id", clientId).maybeSingle();
  if (!client) throw new Error("Ese cliente no existe.");

  // Algunos tipos (Keynote, Figma exportado) llegan sin MIME del navegador.
  const contentType = file.type || "application/octet-stream";
  const path = buildMaterialPath(clientId, file.name);
  return { path, uploadUrl: await getUploadUrl(path, contentType), contentType };
}

/**
 * Registra el archivo ya subido. Tamaño y tipo salen de R2, no del navegador:
 * lo que el navegador dice al pedir la firma no es confiable.
 */
async function verifyUpload(clientId: string, path: string) {
  if (!path.startsWith(`material/${clientId}/`)) {
    throw new Error("Ese archivo no es de este cliente.");
  }
  const stat = await statFile(path);
  if (!stat) throw new Error("El archivo no terminó de subir. Inténtalo de nuevo.");
  if (stat.size > MAX_MATERIAL_BYTES) {
    await deleteFile(path);
    throw new Error("El archivo pesa más de 250 MB.");
  }
  return stat;
}

async function addMaterialFileImpl(input: {
  clientId: string;
  path: string;
  fileName: string;
  title: string;
  description: string;
}): Promise<void> {
  const user = await requireUser();
  const stat = await verifyUpload(input.clientId, input.path);

  const supabase = await createClient();
  const { error } = await supabase.from("client_materials").insert({
    client_id: input.clientId,
    kind: "file",
    title: input.title.trim() || input.fileName,
    description: input.description.trim(),
    storage_path: input.path,
    file_name: input.fileName,
    mime_type: stat.contentType,
    size_bytes: stat.size,
    created_by: user.id,
  });
  if (error) {
    await deleteFile(input.path);
    throw new Error(error.message);
  }
  revalidatePath(`/client/${input.clientId}`);
}

async function addMaterialLinkImpl(input: {
  clientId: string;
  url: string;
  title: string;
  description: string;
}): Promise<void> {
  const user = await requireUser();
  const url = normalizeDocUrl(input.url);
  if (!url) throw new Error("Pega el link.");

  const supabase = await createClient();
  const { error } = await supabase.from("client_materials").insert({
    client_id: input.clientId,
    kind: "link",
    title: input.title.trim() || new URL(url).hostname.replace(/^www\./, ""),
    description: input.description.trim(),
    url,
    created_by: user.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/client/${input.clientId}`);
}

/** Titulo, nota y (si es link) el link. Reemplazar el archivo va aparte. */
async function updateMaterialImpl(
  id: string,
  input: { title: string; description: string; url?: string },
): Promise<void> {
  const user = await requireUser();
  const title = input.title.trim();
  if (!title) throw new Error("Ponle título.");

  const patch: Record<string, unknown> = {
    title,
    description: input.description.trim(),
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  };
  if (input.url !== undefined) {
    const url = normalizeDocUrl(input.url);
    if (!url) throw new Error("Pega el link.");
    patch.url = url;
  }

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("client_materials")
    .update(patch, { count: "exact" })
    .eq("id", id);
  if (error) throw new Error(error.message);
  if (!count) throw new Error("No se pudo guardar.");
  revalidatePath("/client", "layout");
}

/** Nueva version del archivo: misma ficha, archivo nuevo, el viejo se borra de R2. */
async function replaceMaterialFileImpl(
  id: string,
  input: { path: string; fileName: string },
): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: row } = await supabase
    .from("client_materials")
    .select("client_id, kind, storage_path")
    .eq("id", id)
    .maybeSingle();
  if (!row || row.kind !== "file") throw new Error("Ese material no es un archivo.");

  const stat = await verifyUpload(row.client_id as string, input.path);
  const { error } = await supabase
    .from("client_materials")
    .update({
      storage_path: input.path,
      file_name: input.fileName,
      mime_type: stat.contentType,
      size_bytes: stat.size,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) {
    await deleteFile(input.path);
    throw new Error(error.message);
  }
  if (row.storage_path) await deleteFile(row.storage_path as string).catch(() => {});
  revalidatePath(`/client/${row.client_id}`);
}

async function deleteMaterialImpl(id: string): Promise<void> {
  await requireUser();
  const supabase = await createClient();

  const { data: row } = await supabase
    .from("client_materials")
    .select("client_id, storage_path")
    .eq("id", id)
    .maybeSingle();
  if (!row) throw new Error("Ese material ya no existe.");

  // La policy decide si puedes borrar (quien lo subio o admin): count 0 = no.
  const { error, count } = await supabase
    .from("client_materials")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) throw new Error(error.message);
  if (!count) throw new Error("Solo quien lo subió o un admin puede borrarlo.");

  if (row.storage_path) await deleteFile(row.storage_path as string).catch(() => {});
  revalidatePath(`/client/${row.client_id}`);
}

/**
 * URL para abrir el archivo. PDFs, imagenes y video se ven en el navegador; lo
 * demas (pptx, zip, keynote) se descarga con su nombre original.
 */
async function openMaterialImpl(id: string, download = false): Promise<string> {
  await requireUser();
  const supabase = await createClient();

  const { data: row } = await supabase
    .from("client_materials")
    .select("kind, url, storage_path, file_name, mime_type")
    .eq("id", id)
    .maybeSingle();
  if (!row) throw new Error("Ese material ya no existe.");
  if (row.kind === "link") return row.url as string;

  const path = row.storage_path as string;
  if (!download && INLINE.test(String(row.mime_type ?? ""))) return getPreviewUrl(path);
  return getDownloadUrl(path, (row.file_name as string) ?? "archivo");
}

// ---- Acciones expuestas al navegador ----
// Regresan el error en vez de lanzarlo: en produccion Next oculta el mensaje de
// lo que se lanza. Ver src/lib/action-result.ts.

export async function listMaterials(
  ...args: Parameters<typeof listMaterialsImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof listMaterialsImpl>>>> {
  return attempt(() => listMaterialsImpl(...args));
}

export async function requestMaterialUpload(
  ...args: Parameters<typeof requestMaterialUploadImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof requestMaterialUploadImpl>>>> {
  return attempt(() => requestMaterialUploadImpl(...args));
}

export async function addMaterialFile(
  ...args: Parameters<typeof addMaterialFileImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof addMaterialFileImpl>>>> {
  return attempt(() => addMaterialFileImpl(...args));
}

export async function addMaterialLink(
  ...args: Parameters<typeof addMaterialLinkImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof addMaterialLinkImpl>>>> {
  return attempt(() => addMaterialLinkImpl(...args));
}

export async function updateMaterial(
  ...args: Parameters<typeof updateMaterialImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof updateMaterialImpl>>>> {
  return attempt(() => updateMaterialImpl(...args));
}

export async function replaceMaterialFile(
  ...args: Parameters<typeof replaceMaterialFileImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof replaceMaterialFileImpl>>>> {
  return attempt(() => replaceMaterialFileImpl(...args));
}

export async function deleteMaterial(
  ...args: Parameters<typeof deleteMaterialImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof deleteMaterialImpl>>>> {
  return attempt(() => deleteMaterialImpl(...args));
}

export async function openMaterial(
  ...args: Parameters<typeof openMaterialImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof openMaterialImpl>>>> {
  return attempt(() => openMaterialImpl(...args));
}
