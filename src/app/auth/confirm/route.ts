import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Aqui aterriza el enlace del correo de confirmacion.
 *
 * Supabase confirma el correo en su /verify y luego redirige con un `code`
 * (flujo PKCE). Canjearlo abre la sesion, pero solo en el navegador donde se
 * hizo el registro: ahi vive el code verifier. Si lo abren en otro (el celular),
 * el canje falla aunque el correo YA quedo confirmado; por eso ese caso no es
 * un error, solo hay que entrar con la contraseña.
 *
 * `token_hash` cubre la plantilla de correo que apunta directo aqui.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const destino = (estado?: string) => {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/confirmado";
    url.search = estado ? `?estado=${estado}` : "";
    return NextResponse.redirect(url);
  };

  // Enlace caducado o ya usado: Supabase lo manda con error_code.
  if (searchParams.get("error_code") || searchParams.get("error")) {
    return destino("caducado");
  }

  const supabase = await createClient();

  const code = searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return destino(error ? "otro-navegador" : undefined);
  }

  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    return destino(error ? "caducado" : undefined);
  }

  return destino("caducado");
}
