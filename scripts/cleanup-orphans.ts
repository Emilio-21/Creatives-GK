/**
 * Borra objetos de R2 que no tienen registro en `creatives`.
 *
 * Un PUT exitoso seguido de un insert fallido deja el archivo ocupando espacio
 * sin que nada lo referencie (§3.1). El free tier son 10 GB acumulados, asi que
 * esto se corre mensual.
 *
 *   npm run cleanup:orphans           # solo lista (dry run)
 *   npm run cleanup:orphans -- --delete
 *   npm run cleanup:orphans -- --delete --bucket creatives-prod
 *   npm run cleanup:orphans -- --min-age-hours 0     # ignora el margen de 24 h
 *
 * Usa la service role key: tiene que ver TODOS los creativos, no solo los del
 * usuario, o borraria archivos vivos.
 */
import dotenv from "dotenv";
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

const args = process.argv.slice(2);
const shouldDelete = args.includes("--delete");
const bucketArg = args.indexOf("--bucket");
const BUCKET = bucketArg >= 0 ? args[bucketArg + 1] : process.env.R2_BUCKET_NAME!;

/** Margen para no borrar un upload que esta a la mitad ahorita mismo. */
const minAgeArg = args.indexOf("--min-age-hours");
const MIN_AGE_HOURS = minAgeArg >= 0 ? Number(args[minAgeArg + 1]) : 24;

async function main() {
  for (const key of [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]) {
    if (!process.env[key]) {
      console.error(`Falta ${key} en .env.local`);
      process.exit(1);
    }
  }
  if (!BUCKET) {
    console.error("Falta el bucket: define R2_BUCKET_NAME o pasa --bucket.");
    process.exit(1);
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: creatives, error } = await supabase
    .from("creatives")
    .select("storage_path, poster_path");
  if (error) {
    console.error(`No se pudo leer creatives: ${error.message}`);
    process.exit(1);
  }

  // Los archivados tambien cuentan: siguen teniendo su archivo en R2.
  const referenced = new Set<string>();
  for (const row of creatives ?? []) {
    referenced.add(row.storage_path as string);
    if (row.poster_path) referenced.add(row.poster_path as string);
  }

  const r2 = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });

  const cutoff = Date.now() - MIN_AGE_HOURS * 3600 * 1000;
  const orphans: { key: string; size: number; modified: Date }[] = [];
  let scanned = 0;
  let tooRecent = 0;
  let token: string | undefined;

  do {
    const page = await r2.send(
      new ListObjectsV2Command({ Bucket: BUCKET, ContinuationToken: token }),
    );
    for (const object of page.Contents ?? []) {
      const key = object.Key;
      if (!key) continue;
      scanned += 1;
      if (referenced.has(key)) continue;

      const modified = object.LastModified ?? new Date(0);
      if (modified.getTime() > cutoff) {
        tooRecent += 1;
        continue;
      }
      orphans.push({ key, size: object.Size ?? 0, modified });
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);

  const bytes = orphans.reduce((sum, orphan) => sum + orphan.size, 0);

  console.log(`\nBucket ${BUCKET}`);
  console.log(`  ${scanned} objetos, ${referenced.size} referenciados en la DB`);
  if (tooRecent > 0) {
    console.log(`  ${tooRecent} huérfanos con menos de ${MIN_AGE_HOURS} h: se respetan`);
  }

  if (orphans.length === 0) {
    console.log("\nNo hay huérfanos que borrar.\n");
    return;
  }

  console.log(`\n${orphans.length} huérfanos (${(bytes / 1024 ** 2).toFixed(1)} MB):`);
  for (const orphan of orphans) {
    console.log(
      `  ${orphan.key}  ${(orphan.size / 1024).toFixed(0)} KB  ${orphan.modified
        .toISOString()
        .slice(0, 10)}`,
    );
  }

  if (!shouldDelete) {
    console.log("\nDry run. Corre otra vez con --delete para borrarlos.\n");
    return;
  }

  // DeleteObjects acepta 1000 keys por llamada.
  for (let index = 0; index < orphans.length; index += 1000) {
    const batch = orphans.slice(index, index + 1000);
    const result = await r2.send(
      new DeleteObjectsCommand({
        Bucket: BUCKET,
        Delete: { Objects: batch.map((orphan) => ({ Key: orphan.key })) },
      }),
    );
    for (const failure of result.Errors ?? []) {
      console.error(`  FALLA ${failure.Key}: ${failure.Message}`);
    }
  }

  console.log(`\nBorrados ${orphans.length} objetos, ${(bytes / 1024 ** 2).toFixed(1)} MB.\n`);
}

void main();
