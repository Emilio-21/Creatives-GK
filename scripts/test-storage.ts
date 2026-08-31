/**
 * Fase 2: prueba aislada de la capa de storage contra R2.
 * Sube un archivo, lo lee por preview URL, verifica la descarga y lo borra.
 *   npm run test:storage
 *
 * Corre fuera de Next, asi que replica las cuatro funciones de lib/storage.ts
 * en vez de importarlas (ese modulo es "server-only").
 */
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

let failed = false;
const ok = (m: string) => console.log(`  ok    ${m}`);
const bad = (m: string) => {
  failed = true;
  console.log(`  FALLA ${m}`);
};

const BUCKET = process.env.R2_BUCKET_NAME!;
const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

// 1x1 PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function main() {
  for (const k of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"]) {
    if (!process.env[k]) {
      console.log(`Falta ${k} en .env.local`);
      process.exit(1);
    }
  }

  const uuid = randomUUID();
  const filename = "PRUEBA_ácido v3.png";
  const path = `creatives/${uuid}/PRUEBA_acido_v3.png`;
  console.log(`\nBucket ${BUCKET}, key ${path}\n`);

  console.log("1. getUploadUrl + PUT");
  const uploadUrl = await getSignedUrl(
    r2,
    new PutObjectCommand({ Bucket: BUCKET, Key: path, ContentType: "image/png" }),
    { expiresIn: 900 },
  );
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "content-type": "image/png" },
    body: new Uint8Array(PNG),
  });
  if (put.ok) ok(`subido (${put.status}, etag ${put.headers.get("etag")})`);
  else bad(`PUT ${put.status} ${await put.text()}`);

  console.log("\n2. getPreviewUrl");
  const previewUrl = await getSignedUrl(
    r2,
    new GetObjectCommand({ Bucket: BUCKET, Key: path }),
    { expiresIn: 3600 },
  );
  const preview = await fetch(previewUrl);
  const bytes = Buffer.from(await preview.arrayBuffer());
  if (preview.ok && bytes.equals(PNG)) ok(`preview devuelve los mismos ${bytes.length} bytes`);
  else bad(`preview ${preview.status}, ${bytes.length} bytes`);

  console.log("\n3. bucket privado");
  // R2 rechaza la request sin firma con 400 InvalidArgument/"Authorization",
  // no con 403. Lo que importa es que no devuelva el archivo.
  const unsigned = await fetch(previewUrl.split("?")[0]);
  const unsignedBody = Buffer.from(await unsigned.arrayBuffer());
  if (unsigned.status !== 200 && !unsignedBody.equals(PNG)) {
    ok(`sin firma responde ${unsigned.status}, no entrega el archivo`);
  } else {
    bad(`sin firma responde ${unsigned.status} — el bucket esta expuesto`);
  }

  console.log("\n4. getDownloadUrl");
  const downloadUrl = await getSignedUrl(
    r2,
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: path,
      ResponseContentDisposition: `attachment; filename="PRUEBA_acido_v3.png"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    }),
    { expiresIn: 300 },
  );
  const download = await fetch(downloadUrl);
  const disposition = download.headers.get("content-disposition") ?? "";
  if (disposition.startsWith("attachment")) ok(`content-disposition: ${disposition}`);
  else bad(`content-disposition ausente o incorrecto: "${disposition}"`);

  console.log("\n5. deleteFile");
  await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: path }));
  const afterDelete = await fetch(previewUrl);
  if (afterDelete.status === 404) ok("el objeto ya no existe (404)");
  else bad(`despues de borrar responde ${afterDelete.status}`);

  const origin = process.env.CORS_ORIGIN ?? "http://localhost:3000";
  console.log(`\n6. CORS del bucket (preflight desde ${origin})`);
  const preflightKey = `creatives/${randomUUID()}/cors-check.png`;
  const preflightUrl = await getSignedUrl(
    r2,
    new PutObjectCommand({ Bucket: BUCKET, Key: preflightKey, ContentType: "image/png" }),
    { expiresIn: 300 },
  );
  const preflight = await fetch(preflightUrl, {
    method: "OPTIONS",
    headers: {
      origin,
      "access-control-request-method": "PUT",
      "access-control-request-headers": "content-type",
    },
  });
  const allowOrigin = preflight.headers.get("access-control-allow-origin");
  if (preflight.ok && allowOrigin) {
    ok(`preflight ${preflight.status}, allow-origin: ${allowOrigin}`);
  } else {
    bad(
      `preflight ${preflight.status} sin access-control-allow-origin para ${origin}. ` +
        "Pega infra/r2-cors.json en R2 → bucket → Settings → CORS Policy.",
    );
  }

  console.log(failed ? "\nHay fallas arriba.\n" : "\nStorage OK end-to-end.\n");
  process.exit(failed ? 1 : 0);
}

void main();
