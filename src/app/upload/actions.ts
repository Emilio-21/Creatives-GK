"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ALLOWED_MIME_TYPES, MAX_FILE_BYTES, type AllowedMimeType } from "@/lib/env";
import {
  buildCreativePath,
  buildPosterPath,
  deleteFile,
  getUploadUrl,
  statFile,
} from "@/lib/storage";

export type UploadTicket = {
  uuid: string;
  storagePath: string;
  uploadUrl: string;
  posterPath: string | null;
  posterUploadUrl: string | null;
};

/**
 * Firma el PUT del archivo (y el del poster, si es video).
 * Valida sesion, mime y tamaño ANTES de firmar (§4.4).
 */
export async function requestUploadUrls(
  filename: string,
  mimeType: string,
  size: number,
): Promise<UploadTicket> {
  await requireUser();

  if (!ALLOWED_MIME_TYPES.includes(mimeType as AllowedMimeType)) {
    throw new Error(`Tipo no permitido: ${mimeType}`);
  }
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error("Tamaño de archivo invalido.");
  }
  if (size > MAX_FILE_BYTES) {
    throw new Error(`${(size / 1024 / 1024).toFixed(1)} MB excede el maximo de 100 MB.`);
  }

  const { uuid, path } = buildCreativePath(filename);
  const isVideo = mimeType.startsWith("video/");
  const posterPath = isVideo ? buildPosterPath(uuid) : null;

  return {
    uuid,
    storagePath: path,
    uploadUrl: await getUploadUrl(path, mimeType),
    posterPath,
    posterUploadUrl: posterPath ? await getUploadUrl(posterPath, "image/jpeg") : null,
  };
}

export type ConfirmUploadInput = {
  storagePath: string;
  posterPath: string | null;
  originalFilename: string;
  mimeType: string;
  mediaType: "image" | "video";
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  clientId: string;
  batchId: string | null;
  format: string | null;
  tags: string[];
};

/**
 * Inserta el registro despues de que el PUT termino. Si esto falla queda un
 * huerfano en R2 — por eso el intento de borrarlo aqui y el script de limpieza
 * de la fase 7 para lo que se escape (§7).
 */
export async function confirmUpload(input: ConfirmUploadInput): Promise<{ id: string }> {
  const user = await requireUser();

  // El tamaño que reporto el cliente al firmar no es confiable: se verifica
  // contra el objeto que de verdad quedo en R2.
  const stat = await statFile(input.storagePath);
  if (!stat) throw new Error("El archivo no llego a R2.");
  if (stat.size > MAX_FILE_BYTES) {
    await deleteFile(input.storagePath);
    if (input.posterPath) await deleteFile(input.posterPath);
    throw new Error("El archivo excede 100 MB.");
  }
  if (!ALLOWED_MIME_TYPES.includes(input.mimeType as AllowedMimeType)) {
    await deleteFile(input.storagePath);
    throw new Error(`Tipo no permitido: ${input.mimeType}`);
  }

  if (!input.clientId) throw new Error("El cliente es obligatorio.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("creatives")
    .insert({
      original_filename: input.originalFilename,
      display_name: input.originalFilename,
      storage_path: input.storagePath,
      poster_path: input.posterPath,
      mime_type: input.mimeType,
      file_size: stat.size,
      media_type: input.mediaType,
      width: input.width,
      height: input.height,
      duration_seconds: input.durationSeconds,
      client_id: input.clientId,
      batch_id: input.batchId,
      format: input.format,
      tags: input.tags,
      uploaded_by: user.id,
    })
    .select("id")
    .single();

  if (error) {
    // Insert fallido = archivo pagando espacio sin registro.
    await deleteFile(input.storagePath).catch(() => {});
    if (input.posterPath) await deleteFile(input.posterPath).catch(() => {});
    throw new Error(`No se pudo guardar el registro: ${error.message}`);
  }

  revalidatePath("/");
  revalidatePath(`/client/${input.clientId}`);
  return { id: data.id as string };
}

/** Nombres que ya existen, para advertir en la UI sin bloquear (§3.7). */
export async function findDuplicateNames(filenames: string[]): Promise<string[]> {
  await requireUser();
  if (filenames.length === 0) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("creatives")
    .select("original_filename")
    .in("original_filename", filenames.slice(0, 100));

  return (data ?? []).map((row) => row.original_filename as string);
}

export async function revalidateLibrary(clientId: string) {
  await requireUser();
  revalidatePath("/");
  revalidatePath(`/client/${clientId}`);
}
