import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type Env = {
  OAUTH_KV: KVNamespace;
  APP_URL: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  CRON_SECRET: string;
};

/**
 * La sesion de Supabase de quien conecto Claude. Va cifrada en los props del
 * grant: solo quien tiene el token de Claude la puede abrir.
 *
 * Es una sesion propia del conector (su propio login), no la de la app: si
 * compartieran refresh token, refrescar en un lado mataria la sesion del otro.
 */
export type Props = {
  userId: string;
  email: string;
  accessToken: string;
  refreshToken: string;
};

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: { id: string; email?: string };
};

async function tokenRequest(env: Env, grant: string, body: unknown): Promise<TokenResponse> {
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=${grant}`, {
    method: "POST",
    headers: { apikey: env.SUPABASE_ANON_KEY, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as Partial<TokenResponse> & {
    error_description?: string;
    msg?: string;
    error_code?: string;
  };
  if (!response.ok || !data.access_token || !data.refresh_token || !data.user) {
    const error = new Error(data.error_description ?? data.msg ?? "No se pudo iniciar sesión.");
    (error as Error & { code?: string }).code = data.error_code;
    throw error;
  }
  return data as TokenResponse;
}

/** Entrar con el correo y contraseña de Relevo. */
export async function signIn(env: Env, email: string, password: string) {
  return tokenRequest(env, "password", { email, password });
}

/** Sesion nueva a partir del refresh token (Supabase lo rota: hay que guardar el nuevo). */
export async function refresh(env: Env, refreshToken: string) {
  return tokenRequest(env, "refresh_token", { refresh_token: refreshToken });
}

/** Cliente con la sesion de la persona: RLS y auth.uid() son los suyos. */
export function userClient(env: Env, accessToken: string): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
