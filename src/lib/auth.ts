import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

/**
 * Guarda de sesion para Server Actions. La proteccion de los archivos en R2 es
 * exactamente esto: una presigned URL solo se firma despues de pasar por aqui
 * (§5). Toda Server Action que toque storage debe llamarla primero.
 */
export async function requireUser(): Promise<User> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado.");
  return user;
}
