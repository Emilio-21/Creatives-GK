import "server-only";
import { PORTAL_TOKEN } from "@/lib/client-requests";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Lo que ve el cliente desde su link. Corre sin sesion y con service role, asi
 * que TODO sale filtrado por el cliente dueño del token: nunca se lee nada que
 * no cuelgue de ese cliente.
 */

export type PortalRequest = {
  id: string;
  title: string;
  instructions: string;
  dueDate: string | null;
  files: { name: string; size: number }[];
};

export type Portal = {
  clientId: string;
  clientName: string;
  orgName: string;
  requests: PortalRequest[];
};

/** El cliente del token, o null si el link no sirve (cambiado, archivado o inventado). */
export async function portalClient(token: string) {
  if (!PORTAL_TOKEN.test(token)) return null;
  const db = createAdminClient();
  const { data } = await db
    .from("clients")
    .select("id, name, orgs(name)")
    .eq("portal_token", token)
    .is("archived_at", null)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id as string,
    name: data.name as string,
    orgName: (data.orgs as { name?: string } | null)?.name ?? "",
  };
}

export async function loadPortal(token: string): Promise<Portal | null> {
  const client = await portalClient(token);
  if (!client) return null;

  const db = createAdminClient();
  const { data, error } = await db
    .from("client_requests")
    .select("id, title, instructions, due_date, created_at, client_request_files(file_name, size_bytes, created_at)")
    .eq("client_id", client.id)
    .is("closed_at", null)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  return {
    clientId: client.id,
    clientName: client.name,
    orgName: client.orgName,
    requests: (data ?? []).map((row) => ({
      id: row.id as string,
      title: row.title as string,
      instructions: (row.instructions as string) ?? "",
      dueDate: (row.due_date as string | null) ?? null,
      files: ((row.client_request_files ?? []) as Record<string, unknown>[])
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
        .map((f) => ({ name: f.file_name as string, size: Number(f.size_bytes) })),
    })),
  };
}

/** El pedido abierto de ese cliente, con cuantos archivos lleva; null si no. */
export async function openRequest(clientId: string, requestId: string) {
  const db = createAdminClient();
  const { data } = await db
    .from("client_requests")
    .select("id, client_request_files(count)")
    .eq("id", requestId)
    .eq("client_id", clientId)
    .is("closed_at", null)
    .maybeSingle();
  if (!data) return null;
  const conteo = (data.client_request_files as { count: number }[] | null)?.[0]?.count ?? 0;
  return { id: data.id as string, files: conteo };
}
