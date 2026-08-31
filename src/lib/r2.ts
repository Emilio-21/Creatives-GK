import "server-only";
import { S3Client } from "@aws-sdk/client-s3";
import { serverEnv } from "@/lib/env";

let client: S3Client | null = null;

/**
 * Cliente S3 apuntando a R2. `region: "auto"` es obligatorio.
 * Ningun componente debe usar esto directo: todo pasa por lib/storage.ts (§3.8).
 */
export function r2(): S3Client {
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: serverEnv.r2Endpoint,
      credentials: {
        accessKeyId: serverEnv.r2AccessKeyId,
        secretAccessKey: serverEnv.r2SecretAccessKey,
      },
    });
  }
  return client;
}
