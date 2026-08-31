/**
 * Lectura de variables de entorno. Se resuelven en tiempo de llamada (no al
 * importar el modulo) para que un build sin secretos no truene.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Falta la variable de entorno ${name}. Copiala de .env.example a .env.local (o agregala en Vercel).`,
    );
  }
  return value;
}

export const publicEnv = {
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseAnonKey() {
    return required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
};

/** Solo usar desde codigo que corre en el servidor. */
export const serverEnv = {
  get supabaseServiceRoleKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  get r2AccountId() {
    return required("R2_ACCOUNT_ID");
  },
  get r2AccessKeyId() {
    return required("R2_ACCESS_KEY_ID");
  },
  get r2SecretAccessKey() {
    return required("R2_SECRET_ACCESS_KEY");
  },
  get r2Bucket() {
    return required("R2_BUCKET_NAME");
  },
  get r2Endpoint() {
    return `https://${required("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`;
  },
};

/** Limites validados en el servidor antes de firmar cualquier URL (§4.4). */
export const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100 MB
export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];
