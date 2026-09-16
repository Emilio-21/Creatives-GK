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
  class SupabaseCaido extends Error {}
  const esRpcAusente = (mensaje: string) =>
    /could not find|does not exist|schema cache|404/i.test(mensaje);
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );
    // Si el proyecto no responde, todo lo de abajo falla por la misma razon y
    // "falta correr 0004" seria mentira: el diagnostico se corta aqui.
    const { error: pingError } = await supabase.from("profiles").select("id").limit(1);
    if (pingError && /fetch failed|ENOTFOUND|getaddrinfo|ECONNREFUSED/i.test(pingError.message)) {
      bad(`no se pudo conectar a ${process.env.NEXT_PUBLIC_SUPABASE_URL}: ${pingError.message}`);
      bad("el proyecto de Supabase no responde — revisa en el dashboard si esta pausado");
      throw new SupabaseCaido();
    }

    for (const table of [
      "profiles",
      "clients",
      "creatives",
      "launches",
      "downloads",
      "creative_stats",
      "batches",
      "briefs",
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
      ["creatives", "batch_id", "0008_batches_and_briefs.sql"],
      ["briefs", "brief_date", "0009_brief_flow.sql"],
      ["batches", "completed_at", "0009_brief_flow.sql"],
      ["batches", "campaign_code", "0011_batch_naming.sql"],
      ["creatives", "parent_id", "0013_variantes.sql"],
    ];
    for (const [table, column, migration] of columns) {
      const { error: columnError } = await supabase.from(table).select(column).limit(1);
      if (columnError) bad(`${table}.${column} no existe — falta correr ${migration}`);
      else ok(`${table}.${column} existe`);
    }

    // La funcion que mueve creativos a un batch: sin ella el boton "Mover a
    // batch" truena en produccion.
    const { error: rpcError } = await supabase.rpc("assign_creatives_to_batch", {
      // Un uuid que no existe: la llamada es real pero no toca ninguna fila.
      p_ids: ["00000000-0000-0000-0000-000000000000"],
      p_batch: null,
    });
    // La funcion levanta "No hay sesión." con la service key, que no tiene
    // auth.uid(): esa excepcion PRUEBA que existe. Lo unico que delata que
    // falta es el 404 del RPC.
    if (rpcError && esRpcAusente(rpcError.message)) {
      bad("assign_creatives_to_batch no existe — falta correr 0012_assign_batch.sql");
    } else {
      ok("assign_creatives_to_batch existe");
    }

    const { error: groupError } = await supabase.rpc("group_creatives_as_ad", {
      p_parent: "00000000-0000-0000-0000-000000000000",
      p_variantes: ["00000000-0000-0000-0000-000000000001"],
    });
    if (groupError && esRpcAusente(groupError.message)) {
      bad("group_creatives_as_ad no existe — falta correr 0013_variantes.sql");
    } else {
      ok("group_creatives_as_ad existe");
    }

    const { data, error } = await supabase.auth.admin.listUsers();
    if (error) bad(`auth: ${error.message}`);
    else ok(`auth responde (${data.users.length} usuario(s))`);
  } catch (e) {
    // R2 es independiente de Supabase: vale la pena seguir y reportarlo.
    if (!(e instanceof SupabaseCaido)) bad(`no se pudo conectar: ${(e as Error).message}`);
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
