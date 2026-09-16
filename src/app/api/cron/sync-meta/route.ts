import { NextResponse, type NextRequest } from "next/server";
import { syncAllClients } from "@/lib/meta-sync";
import { getTokenInfo } from "@/lib/meta";

export const dynamic = "force-dynamic";

/** Margen para cambiar el token sin prisas. */
const DIAS_DE_AVISO = 15;

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

  // El token vive aqui, no en la maquina de nadie: este es el unico lugar donde
  // se puede avisar que esta por caducar antes de que el sync se congele.
  let token: Awaited<ReturnType<typeof getTokenInfo>> | null = null;
  let tokenWarning: string | null = null;
  try {
    token = await getTokenInfo();
    if (!token.valid) {
      tokenWarning = "El token de Meta ya no es valido: el sync no va a traer nada.";
    } else if (token.expiresInDays !== null && token.expiresInDays <= DIAS_DE_AVISO) {
      tokenWarning = `El token de Meta caduca en ${token.expiresInDays} dia(s). Genera uno de System User, que no caduca.`;
    }
  } catch (error) {
    tokenWarning = `No se pudo revisar el token: ${(error as Error).message}`;
  }

  return NextResponse.json({
    ok: failed.length === 0,
    clients: reports.length,
    matched: reports.reduce((sum, report) => sum + report.matched, 0),
    written: reports.reduce((sum, report) => sum + report.launchesWritten, 0),
    tokenWarning,
    tokenExpiresInDays: token?.expiresInDays ?? null,
    reports,
  });
}
