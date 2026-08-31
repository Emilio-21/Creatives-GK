/**
 * Verificacion de fase 0: valida .env.local y que Supabase y R2 respondan.
 *   npm run check:setup
 */
import dotenv from "dotenv";

import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
];

let failed = false;
const ok = (m: string) => console.log(`  ok    ${m}`);
const bad = (m: string) => {
  failed = true;
  console.log(`  FALLA ${m}`);
};

/** Identifica el tipo de clave sin imprimir su valor. */
function keyRole(value: string): "anon" | "service_role" | "publishable" | "secret" | "unknown" {
  if (value.startsWith("sb_publishable_")) return "publishable";
  if (value.startsWith("sb_secret_")) return "secret";
  if (value.startsWith("eyJ")) {
    try {
      const payload = JSON.parse(
        Buffer.from(value.split(".")[1], "base64").toString("utf8"),
      ) as { role?: string };
      if (payload.role === "anon") return "anon";
      if (payload.role === "service_role") return "service_role";
    } catch {
      return "unknown";
    }
  }
  return "unknown";
}

async function main() {
  console.log("\nVariables de entorno");
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    bad(`faltan: ${missing.join(", ")}`);
  } else {
    ok("las 7 variables estan definidas");
  }
  if (Object.keys(process.env).some((k) => k.startsWith("NEXT_PUBLIC_R2"))) {
    bad("hay una credencial de R2 con prefijo NEXT_PUBLIC_ — quitala");
  }
  if (missing.length) return;

  // Error tipico: pegar la anon key en las dos variables.
  const anonRole = keyRole(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const serviceRole = keyRole(process.env.SUPABASE_SERVICE_ROLE_KEY!);
  if (serviceRole === "anon" || serviceRole === "publishable") {
    bad(
      "SUPABASE_SERVICE_ROLE_KEY tiene una clave publica. Copia la service_role " +
        "(Supabase → Project Settings → API Keys → Legacy API keys) o una Secret key sb_secret_…",
    );
  } else if (serviceRole === "unknown") {
    bad("SUPABASE_SERVICE_ROLE_KEY no parece una clave de Supabase");
  } else {
    ok(`SUPABASE_SERVICE_ROLE_KEY es ${serviceRole}`);
  }
  if (anonRole === "service_role" || anonRole === "secret") {
    bad("NEXT_PUBLIC_SUPABASE_ANON_KEY tiene una clave SECRETA — se filtra al navegador. Cambiala ya.");
  }

  console.log("\nSupabase");
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );
    for (const table of [
      "profiles",
      "clients",
      "creatives",
      "launches",
      "downloads",
      "creative_stats",
    ]) {
      // select real, no head: un HEAD no falla si la tabla no esta en el cache.
      const { error } = await supabase.from(table).select("*").limit(1);
      if (error) bad(`${table}: ${error.message}`);
      else ok(`${table} existe`);
    }
    const columns: [string, string, string][] = [
      ["creatives", "client_id", "0004_clients.sql"],
      ["creative_stats", "active_launch_count", "0005_creative_stats_status.sql"],
      ["clients", "meta_ad_account_id", "0006_meta_sync.sql"],
    ];
    for (const [table, column, migration] of columns) {
      const { error: columnError } = await supabase.from(table).select(column).limit(1);
      if (columnError) bad(`${table}.${column} no existe — falta correr ${migration}`);
      else ok(`${table}.${column} existe`);
    }

    const { data, error } = await supabase.auth.admin.listUsers();
    if (error) bad(`auth: ${error.message}`);
    else ok(`auth responde (${data.users.length} usuario(s))`);
  } catch (e) {
    bad(`no se pudo conectar: ${(e as Error).message}`);
  }

  console.log("\nCloudflare R2");
  try {
    const r2 = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
    const res = await r2.send(
      new ListObjectsV2Command({ Bucket: process.env.R2_BUCKET_NAME!, MaxKeys: 1 }),
    );
    ok(`bucket ${process.env.R2_BUCKET_NAME} accesible (${res.KeyCount ?? 0} objeto(s))`);
  } catch (e) {
    bad(`bucket: ${(e as Error).message}`);
  }

  console.log(failed ? "\nHay fallas arriba.\n" : "\nFase 0 lista.\n");
  process.exit(failed ? 1 : 0);
}

void main();
