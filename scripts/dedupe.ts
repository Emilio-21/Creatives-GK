/**
 * Encuentra y borra archivos subidos dos veces.
 *
 *   npm run dedupe            muestra el plan, no toca nada
 *   npm run dedupe -- --apply borra los sobrantes
 *
 * La identidad se decide por el hash del contenido (el ETag de R2), no por el
 * nombre: dos archivos pueden llamarse igual y ser distintos — pasa en esta
 * biblioteca con B.jpg y C.jpg — y el mismo archivo puede estar subido con dos
 * nombres. El nombre es una pista; el hash es la prueba.
 *
 * De cada grupo sobrevive uno y se borran los demas, con una regla explicita
 * de cual se queda para que el resultado no dependa del orden en que vengan
 * las filas.
 */
import { createClient } from "@supabase/supabase-js";
import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { config } from "dotenv";

config({ path: ".env.local" });

type Fila = {
  id: string;
  original_filename: string;
  display_name: string;
  file_size: number;
  storage_path: string;
  poster_path: string | null;
  client_id: string | null;
  batch_id: string | null;
  parent_id: string | null;
  created_at: string;
};

const APPLY = process.argv.includes("--apply");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

async function etagDe(key: string): Promise<string | null> {
  try {
    const head = await r2.send(
      new HeadObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: key }),
    );
    return (head.ETag ?? "").replace(/"/g, "") || null;
  } catch {
    return null;
  }
}

async function main() {
  const { data, error } = await supabase
    .from("creatives")
    .select(
      "id, original_filename, display_name, file_size, storage_path, poster_path, client_id, batch_id, parent_id, created_at",
    );
  if (error) throw new Error(error.message);
  const filas = (data ?? []) as Fila[];

  const [{ data: launchRows }, { data: downloadRows }, { data: clientRows }] =
    await Promise.all([
      supabase.from("launches").select("creative_id"),
      supabase.from("downloads").select("creative_id"),
      supabase.from("clients").select("id, name"),
    ]);

  const conLanzamientos = new Set((launchRows ?? []).map((r) => r.creative_id as string));
  const conDescargas = new Set((downloadRows ?? []).map((r) => r.creative_id as string));
  const esPadre = new Set(filas.filter((f) => f.parent_id).map((f) => f.parent_id as string));
  const nombreCliente = new Map(
    (clientRows ?? []).map((r) => [r.id as string, r.name as string]),
  );

  process.stdout.write(`Leyendo el hash de ${filas.length} archivos en R2… `);
  const etags = new Map<string, string>();
  for (const fila of filas) {
    const etag = await etagDe(fila.storage_path);
    if (etag) etags.set(fila.id, etag);
  }
  console.log(`${etags.size} leidos\n`);

  const faltantes = filas.filter((f) => !etags.has(f.id));
  if (faltantes.length > 0) {
    console.log(`AVISO: ${faltantes.length} sin archivo en R2 (no se tocan):`);
    for (const f of faltantes) console.log(`  ${f.original_filename}  ${f.id}`);
    console.log();
  }

  // El mismo contenido dentro del mismo cliente. Cruzar clientes seria borrar
  // el archivo de uno porque otro subio el mismo.
  const grupos = new Map<string, Fila[]>();
  for (const fila of filas) {
    const etag = etags.get(fila.id);
    if (!etag) continue;
    const clave = `${fila.client_id ?? "sin-cliente"}|${etag}`;
    grupos.set(clave, [...(grupos.get(clave) ?? []), fila]);
  }

  const planes: { queda: Fila; sobran: Fila[]; razon: string }[] = [];
  const revisar: { archivos: Fila[]; motivo: string }[] = [];

  for (const duplicados of grupos.values()) {
    if (duplicados.length < 2) continue;

    // Cualquiera con historial gana. Si hay mas de uno con historial, la
    // decision deja de ser obvia y no la toma un script.
    const conHistorial = duplicados.filter(
      (f) => conLanzamientos.has(f.id) || conDescargas.has(f.id) || esPadre.has(f.id),
    );
    if (conHistorial.length > 1) {
      revisar.push({
        archivos: duplicados,
        motivo: "mas de una copia tiene lanzamientos, descargas o variantes",
      });
      continue;
    }

    const porFecha = [...duplicados].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const conBatch = porFecha.find((f) => f.batch_id !== null);

    const queda = conHistorial[0] ?? conBatch ?? porFecha[0];
    const razon = conHistorial[0]
      ? "tiene historial"
      : conBatch && conBatch.id === queda.id
        ? "esta en un batch"
        : "es la mas antigua";

    planes.push({ queda, sobran: duplicados.filter((f) => f.id !== queda.id), razon });
  }

  const aBorrar = planes.reduce((suma, plan) => suma + plan.sobran.length, 0);
  const bytes = planes.reduce(
    (suma, plan) => suma + plan.sobran.reduce((s, f) => s + f.file_size, 0),
    0,
  );

  console.log(
    `${planes.length} grupos duplicados · ${aBorrar} archivos a borrar · ${(bytes / 1024 / 1024).toFixed(1)} MB\n`,
  );

  for (const plan of planes) {
    const cliente = nombreCliente.get(plan.queda.client_id ?? "") ?? "sin cliente";
    console.log(`  ${cliente}`);
    console.log(`    QUEDA  ${plan.queda.original_filename}  (${plan.razon})  ${plan.queda.id}`);
    for (const sobra of plan.sobran) {
      console.log(`    BORRA  ${sobra.original_filename}  ${sobra.id}`);
    }
  }

  if (revisar.length > 0) {
    console.log("\nA revisar a mano:");
    for (const item of revisar) {
      console.log(`  ${item.motivo}`);
      for (const f of item.archivos) console.log(`      ${f.original_filename}  ${f.id}`);
    }
  }

  if (!APPLY) {
    console.log("\nNada se toco. Para aplicarlo:  npm run dedupe -- --apply\n");
    return;
  }

  console.log("\nBorrando…");
  let borrados = 0;
  for (const plan of planes) {
    for (const sobra of plan.sobran) {
      // Primero la fila y luego R2, igual que deleteCreative: al reves quedaria
      // un registro apuntando a un archivo que ya no existe.
      const { error: delError } = await supabase.from("creatives").delete().eq("id", sobra.id);
      if (delError) {
        console.log(`  FALLA ${sobra.original_filename}: ${delError.message}`);
        continue;
      }
      const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
      for (const key of [sobra.storage_path, sobra.poster_path].filter(Boolean) as string[]) {
        await r2
          .send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: key }))
          .catch(() => {});
      }
      borrados++;
    }
  }

  const { count } = await supabase.from("creatives").select("id", { count: "exact", head: true });
  console.log(`\n${borrados} archivos borrados · ${count} creativos en la base\n`);
}

main().catch((error: Error) => {
  console.error(`\n${error.message}\n`);
  process.exit(1);
});
