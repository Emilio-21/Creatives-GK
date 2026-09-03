"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ALLOWED_EMAIL_DOMAIN, SIGNUP_ROLES, type Role } from "@/lib/roles";

export type SignupState = { error: string | null; check: boolean };

/**
 * Alta del equipo.
 *
 * La validacion del dominio tambien vive aqui para dar un mensaje decente, pero
 * el candado real es el trigger de 0010: la anon key es publica y cualquiera
 * puede llamar al endpoint de registro de Supabase saltandose esta pantalla.
 */
export async function signup(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("fullName") ?? "").trim();
  const role = String(formData.get("role") ?? "member") as Role;

  if (!email || !password) return { error: "Faltan el correo y la contraseña.", check: false };
  if (!fullName) return { error: "Escribe tu nombre.", check: false };

  if (email.split("@")[1] !== ALLOWED_EMAIL_DOMAIN) {
    return { error: `Solo se permiten correos @${ALLOWED_EMAIL_DOMAIN}.`, check: false };
  }
  if (password.length < 10) {
    return { error: "La contraseña necesita al menos 10 caracteres.", check: false };
  }
  if (!SIGNUP_ROLES.includes(role)) {
    return { error: "Elige tu área.", check: false };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, role } },
  });

  if (error) {
    // El trigger del dominio llega hasta aqui como error de la base.
    if (/growthkingdom/i.test(error.message)) {
      return { error: `Solo se permiten correos @${ALLOWED_EMAIL_DOMAIN}.`, check: false };
    }
    if (/already registered|already exists/i.test(error.message)) {
      return { error: "Ese correo ya tiene cuenta. Entra desde el login.", check: false };
    }
    return { error: error.message, check: false };
  }

  // Con confirmacion de correo activada no viene sesion: hay que revisar el mail.
  if (!data.session) {
    return { error: null, check: true };
  }

  revalidatePath("/", "layout");
  redirect("/");
}
