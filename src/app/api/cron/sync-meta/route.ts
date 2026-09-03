import { NextResponse, type NextRequest } from "next/server";
import { syncAllClients } from "@/lib/meta-sync";

export const dynamic = "force-dynamic";

/**
 * La dispara el Worker de cron (workers/cron-sync). Protegida con CRON_SECRET: si la ruta quedara abierta,
 * cualquiera podria dispararla y quemar el rate limit de la Graph API.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const reports = await syncAllClients();
  const failed = reports.filter((report) => report.error);

  return NextResponse.json({
    ok: failed.length === 0,
    clients: reports.length,
    matched: reports.reduce((sum, report) => sum + report.matched, 0),
    written: reports.reduce((sum, report) => sum + report.launchesWritten, 0),
    reports,
  });
}
