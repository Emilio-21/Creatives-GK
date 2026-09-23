import { NextResponse, type NextRequest } from "next/server";
import { deliverPendingSlack } from "@/lib/slack-deliver";

export const dynamic = "force-dynamic";

/**
 * Reintento de los avisos de Slack que no salieron al momento (Slack caido,
 * limite de velocidad). Lo dispara el Worker de cron cada 10 minutos. Misma
 * proteccion que sync-meta: sin CRON_SECRET no corre.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const report = await deliverPendingSlack(50);
  return NextResponse.json({ ok: report.failed === 0, ...report });
}
