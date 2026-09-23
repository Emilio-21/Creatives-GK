/**
 * Cron del sync de Meta.
 *
 * Va en un Worker aparte y no dentro de la app: el worker que genera OpenNext
 * exporta su propio `fetch`, y meterle un `scheduled` encima ata el despliegue
 * a los detalles internos del adaptador. Un Worker de veinte lineas que llama a
 * la ruta con el secreto es mas facil de razonar y de probar.
 */
export interface Env {
  /** URL publica de la app, sin diagonal final. */
  APP_URL: string;
  /** El mismo CRON_SECRET que valida la ruta. */
  CRON_SECRET: string;
}

/** Cada horario de wrangler.jsonc dispara una ruta distinta. */
const SLACK_CRON = "*/10 * * * *";

export default {
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(event.cron === SLACK_CRON ? runRoute(env, "slack") : runSync(env));
  },

  // Para dispararlo a mano en desarrollo: curl al worker.
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
      return new Response("No autorizado.", { status: 401 });
    }
    return new Response(JSON.stringify(await runSync(env)), {
      headers: { "content-type": "application/json" },
    });
  },
};

async function runSync(env: Env): Promise<unknown> {
  return runRoute(env, "sync-meta");
}

async function runRoute(env: Env, route: "sync-meta" | "slack"): Promise<unknown> {
  const response = await fetch(`${env.APP_URL}/api/cron/${route}`, {
    headers: { authorization: `Bearer ${env.CRON_SECRET}` },
  });

  const body = await response.json().catch(() => ({ error: "respuesta no JSON" }));
  if (!response.ok) {
    console.error(`${route} falló`, response.status, body);
  }
  return body;
}
