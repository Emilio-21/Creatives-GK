"use server";

import { deliverSlackSoon } from "@/lib/slack-after";
import { MAX_FILES_PER_REQUEST, MAX_REQUEST_FILE_BYTES } from "@/lib/client-requests";
import { buildRequestFilePath, deleteFile, getUploadUrl, statFile } from "@/lib/storage";
import { createAdminClient } from "@/lib/supabase/admin";
import { attempt, type ActionResult } from "@/lib/action-result";
import { openRequest, portalClient } from "./portal";

/**
 * Las acciones del link del cliente. No hay sesion: lo que autoriza es el
 * token, y se valida en CADA llamada contra el cliente y el pedido.
 */

const LINK_MUERTO = "Este link ya no sirve. Pídele uno nuevo a tu contacto de la agencia.";

async function pedidoAbierto(token: string, requestId: string) {
  const client = await portalClient(token);
  if (!client) throw new Error(LINK_MUERTO);
  const request = await openRequest(client.id, requestId);
  if (!request) throw new Error("Este pedido ya se cerró. Si falta algo, avísale a tu contacto.");
  return { client, request };
}

/** Firma la subida. La ruta la arma el servidor: el navegador no elige donde escribe. */
async function portalUploadUrlImpl(
  token: string,
  requestId: string,
  files: { name: string; type: string; size: number }[],
): Promise<{ path: string; uploadUrl: string; contentType: string }[]> {
  const { client, request } = await pedidoAbierto(token, requestId);
  if (files.length === 0) throw new Error("Elige al menos un archivo.");
  if (request.files + files.length > MAX_FILES_PER_REQUEST) {
    throw new Error(`Son demasiados archivos para un pedido (máximo ${MAX_FILES_PER_REQUEST}).`);
  }
  for (const file of files) {
    if (file.size > MAX_REQUEST_FILE_BYTES) throw new Error(`"${file.name}" pesa más de 1 GB.`);
  }

  return Promise.all(
    files.map(async (file) => {
      const contentType = file.type || "application/octet-stream";
      const path = buildRequestFilePath(client.id, requestId, file.name);
      return { path, uploadUrl: await getUploadUrl(path, contentType), contentType };
    }),
  );
}

/**
 * Registra lo que ya subio y avisa a quien lo pidio. Tamaño y tipo salen de
 * R2, no del navegador.
 */
async function portalDeliverImpl(
  token: string,
  requestId: string,
  files: { path: string; name: string }[],
): Promise<number> {
  const { client } = await pedidoAbierto(token, requestId);
  const prefijo = `clientes/${client.id}/${requestId}/`;

  const verificados = await Promise.all(
    files.map(async (file) => {
      if (!file.path.startsWith(prefijo)) throw new Error("Ese archivo no es de este pedido.");
      const stat = await statFile(file.path);
      if (!stat) throw new Error(`"${file.name}" no terminó de subir. Inténtalo de nuevo.`);
      if (stat.size > MAX_REQUEST_FILE_BYTES) {
        await deleteFile(file.path);
        throw new Error(`"${file.name}" pesa más de 1 GB.`);
      }
      return { path: file.path, name: file.name, type: stat.contentType ?? "", size: stat.size };
    }),
  );

  const db = createAdminClient();
  const { data, error } = await db.rpc("portal_deliver", {
    p_token: token,
    p_request: requestId,
    p_files: verificados,
  });
  if (error) {
    await Promise.all(verificados.map((f) => deleteFile(f.path).catch(() => {})));
    throw new Error(error.message);
  }
  deliverSlackSoon();
  return data as number;
}

// ---- Acciones expuestas al navegador ----
// Regresan el error en vez de lanzarlo: en produccion Next oculta el mensaje de
// lo que se lanza. Ver src/lib/action-result.ts.

export async function portalUploadUrl(
  ...args: Parameters<typeof portalUploadUrlImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof portalUploadUrlImpl>>>> {
  return attempt(() => portalUploadUrlImpl(...args));
}

export async function portalDeliver(
  ...args: Parameters<typeof portalDeliverImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof portalDeliverImpl>>>> {
  return attempt(() => portalDeliverImpl(...args));
}
