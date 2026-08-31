import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";

/**
 * Cliente para Server Components, Server Actions y Route Handlers.
 * En Server Components el `setAll` truena (no se pueden escribir cookies): se
 * ignora a proposito, el middleware ya refresco la sesion.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component: ignorar.
        }
      },
    },
  });
}

/**
 * Usuario autenticado o null. Usa getUser() (valida el JWT contra Supabase),
 * nunca getSession(), que confia en la cookie.
 */
export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export type Profile = {
  id: string;
  full_name: string | null;
  role: "admin" | "member";
  created_at: string;
};

export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, role, created_at")
    .eq("id", user.id)
    .single();

  return (data as Profile) ?? null;
}
