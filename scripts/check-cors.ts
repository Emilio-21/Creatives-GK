/**
 * Diagnostico de CORS: prueba el preflight de cada origen contra cada bucket.
 * El error de CORS en el navegador no dice nada util, este script si.
 *   npm run check:cors
 */
import dotenv from "dotenv";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { readFileSync } from "node:fs";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

const BUCKETS = ["creatives-dev", "creatives-prod"];

function originsFromPolicy(): string[] {
  const policy = JSON.parse(readFileSync("infra/r2-cors.json", "utf8")) as {
    AllowedOrigins: string[];
  }[];
  return policy.flatMap((rule) => rule.AllowedOrigins);
}

async function main() {
  const r2 = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });

  const origins = originsFromPolicy();
  let failed = false;

  for (const bucket of BUCKETS) {
    console.log(`\n${bucket}`);
    const url = await getSignedUrl(
      r2,
      new PutObjectCommand({ Bucket: bucket, Key: "cors-probe", ContentType: "image/png" }),
      { expiresIn: 300 },
    );

    for (const origin of origins) {
      const res = await fetch(url, {
        method: "OPTIONS",
        headers: {
          origin,
          "access-control-request-method": "PUT",
          "access-control-request-headers": "content-type",
        },
      });
      const allow = res.headers.get("access-control-allow-origin");
      if (res.ok && allow) {
        console.log(`  ok    ${origin}`);
      } else {
        failed = true;
        console.log(`  FALLA ${origin} (${res.status}, sin access-control-allow-origin)`);
      }
    }
  }

  console.log(
    failed
      ? "\nPega infra/r2-cors.json en R2 → bucket → Settings → CORS Policy. Es por bucket.\n"
      : "\nCORS OK en los dos buckets.\n",
  );
  process.exit(failed ? 1 : 0);
}

void main();
