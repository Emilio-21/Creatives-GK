"use server";

import { requireUser } from "@/lib/auth";
import { ALLOWED_MIME_TYPES, MAX_FILE_BYTES, type AllowedMimeType } from "@/lib/env";
import {
  buildCreativePath,
  deleteFile,
  getDownloadUrl,
  getPreviewUrl,
  getUploadUrl,
} from "@/lib/storage";

/** Solo dejamos firmar rutas que genera la app, nunca una key arbitraria. */
const MANAGED_PATH =
  /^(creatives|posters)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9._-]+$/;

function assertManagedPath(path: string) {
  if (!MANAGED_PATH.test(path)) throw new Error("Ruta no valida.");
}

export type UploadTicket = { path: string; uploadUrl: string };

/**
 * Valida ANTES de firmar (§4.4): sesion, mime permitido y tamaño maximo.
 * `size` lo reporta el cliente; el chequeo real del byte count llega en
 * confirmUpload (fase 3), que compara contra el objeto ya subido.
 */
export async function requestUploadUrl(
  filename: string,
  mimeType: string,
  size: number,
): Promise<UploadTicket> {
  await requireUser();

  if (!ALLOWED_MIME_TYPES.includes(mimeType as AllowedMimeType)) {
    throw new Error(`Tipo de archivo no permitido: ${mimeType}`);
  }
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error("Tamaño de archivo invalido.");
  }
  if (size > MAX_FILE_BYTES) {
    throw new Error(
      `El archivo pesa ${(size / 1024 / 1024).toFixed(1)} MB. El maximo son 100 MB.`,
    );
  }

  const { path } = buildCreativePath(filename);
  return { path, uploadUrl: await getUploadUrl(path, mimeType) };
}

export async function requestPreviewUrl(path: string): Promise<string> {
  await requireUser();
  assertManagedPath(path);
  return getPreviewUrl(path);
}

export async function requestDownloadUrl(path: string, filename: string): Promise<string> {
  await requireUser();
  assertManagedPath(path);
  return getDownloadUrl(path, filename);
}

export async function removeFile(path: string): Promise<void> {
  await requireUser();
  assertManagedPath(path);
  await deleteFile(path);
}
