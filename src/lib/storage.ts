import "server-only";
import { randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2 } from "@/lib/r2";
import { serverEnv } from "@/lib/env";

/**
 * Toda la I/O de archivos pasa por aqui (§3.8). Ningun componente llama al SDK
 * de S3 directo: el dia que migremos de proveedor se toca este archivo y ya.
 *
 * El bucket es privado y no tiene dominio publico. El unico acceso es por
 * presigned URL generada en el servidor DESPUES de verificar la sesion — si una
 * Server Action olvida ese check, el archivo queda expuesto.
 */

/** Preview y thumbnails: 1 hora (§3.2). */
const PREVIEW_TTL_SECONDS = 60 * 60;
/** Descarga: 5 minutos (§3.2). */
const DOWNLOAD_TTL_SECONDS = 5 * 60;
/** Ventana para completar el PUT del navegador. */
const UPLOAD_TTL_SECONDS = 15 * 60;

/** URL firmada para subir. El navegador hace el PUT directo, sin pasar por Next. */
export async function getUploadUrl(path: string, contentType: string): Promise<string> {
  return getSignedUrl(
    r2(),
    new PutObjectCommand({
      Bucket: serverEnv.r2Bucket,
      Key: path,
      ContentType: contentType,
    }),
    { expiresIn: UPLOAD_TTL_SECONDS },
  );
}

/** URL firmada para mostrar el archivo en el navegador (img/video src). */
export async function getPreviewUrl(path: string): Promise<string> {
  return getSignedUrl(
    r2(),
    new GetObjectCommand({ Bucket: serverEnv.r2Bucket, Key: path }),
    { expiresIn: PREVIEW_TTL_SECONDS },
  );
}

/**
 * URL firmada que fuerza la descarga con el nombre original en vez de abrir el
 * archivo en una pestaña.
 */
export async function getDownloadUrl(path: string, filename: string): Promise<string> {
  return getSignedUrl(
    r2(),
    new GetObjectCommand({
      Bucket: serverEnv.r2Bucket,
      Key: path,
      ResponseContentDisposition: contentDisposition(filename),
    }),
    { expiresIn: DOWNLOAD_TTL_SECONDS },
  );
}

export async function deleteFile(path: string): Promise<void> {
  await r2().send(
    new DeleteObjectCommand({ Bucket: serverEnv.r2Bucket, Key: path }),
  );
}

// ---------------------------------------------------------------------------
// Helpers de rutas. No tocan R2, solo arman strings (§3.7).
// ---------------------------------------------------------------------------

/**
 * Deja el nombre seguro para usarlo como Key: sin separadores de ruta, sin
 * caracteres raros y sin acentos, conservando la extension.
 */
export function sanitizeFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? "archivo";
  const cleaned = base
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^[._-]+/, "");
  const safe = cleaned.length > 0 ? cleaned : "archivo";
  return safe.length > 120 ? safe.slice(-120) : safe;
}

/** `creatives/{uuid}/{filename}` — el uuid evita colisiones de nombre. */
export function buildCreativePath(filename: string, uuid: string = randomUUID()) {
  return { uuid, path: `creatives/${uuid}/${sanitizeFilename(filename)}` };
}

/** `posters/{uuid}/poster.jpg` — mismo uuid que el creativo, para agruparlos. */
export function buildPosterPath(uuid: string): string {
  return `posters/${uuid}/poster.jpg`;
}

/** `attachment` con filename ASCII + filename* RFC 5987 para nombres con acentos. */
function contentDisposition(filename: string): string {
  const fallback = sanitizeFilename(filename);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
