import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv, serverEnv } from "@/lib/env";

/**
 * Cliente con service role: se salta RLS. Solo para lo que corre sin sesion o
 * tiene que ver a todo el equipo (el sync de Meta, la entrega a Slack). Nunca
 * para responder a lo que pide un usuario: ahi va el cliente con su sesion.
 */
export function createAdminClient() {
  return createClient(publicEnv.supabaseUrl, serverEnv.supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });
}
