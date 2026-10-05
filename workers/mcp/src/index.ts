import { OAuthError, OAuthProvider, type OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { handleAuthorize } from "./authorize";
import { refresh, type Env, type Props } from "./supabase";
import { registerTools } from "./tools";

/**
 * Relevo como conector de Claude (MCP remoto).
 *
 * Un solo Worker hace de servidor de autorizacion (OAuth 2.1 con registro
 * dinamico, lo que pide Claude para un conector personalizado) y de servidor
 * MCP en /mcp. Cada persona entra con su cuenta de Relevo; las herramientas
 * corren con SU sesion de Supabase, asi que RLS, las reglas del flujo y el
 * historial son los mismos que en la app.
 */

const PUBLIC_URL = "https://relevo-mcp.growth-kingdom.workers.dev";

/** El token de Claude vive menos que el de Supabase (1 h): nunca llega uno vencido. */
const ACCESS_TTL = 50 * 60;

const INSTRUCTIONS = `Relevo es la app de Growth Kingdom que lleva cada tarea de un cliente de mano en mano:
copy → revisión → producción → aprobación → lanzamiento (ads, VSL y funnel); email y mensaje van copy → revisión → lanzamiento.
- Cada etapa tiene una persona a cargo; al mover una tarea, a quien sigue le llega aviso en Relevo y Slack.
- En aprobación dan visto bueno copy (quien revisó) y media (quien lanza); con los dos pasa sola a lanzamiento.
- Regresar trabajo pide motivo. Las reglas las aplica la base: si algo no se puede, el error dice por qué.
- Todo lo que hagas queda a nombre de quien conectó. Antes de mover, aprobar, comentar o crear algo, confirma con la persona si no lo pidió explícitamente.
- Los clientes y personas se nombran como en Relevo; si un nombre es ambiguo, la herramienta te dice las opciones.
- Las fechas van como AAAA-MM-DD, en hora de Ciudad de México. Comparte el link de Relevo de lo que menciones.`;

const mcpHandler = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext & { props: Props }) {
    const server = new McpServer({ name: "relevo", version: "1.0.0" }, { instructions: INSTRUCTIONS });
    registerTools(server, { env, props: ctx.props, waitUntil: (p) => ctx.waitUntil(p) });
    // Sin sesion: cada llamada trae su token y se resuelve sola.
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    return transport.handleRequest(request);
  },
};

const defaultHandler = {
  async fetch(request: Request, env: Env & { OAUTH_PROVIDER: OAuthHelpers }) {
    const { pathname } = new URL(request.url);
    if (pathname === "/authorize") return handleAuthorize(request, env);
    if (pathname === "/") {
      return new Response(
        "Conector de Relevo para Claude. Agrégalo en Claude como conector personalizado con la URL " +
          `${PUBLIC_URL}/mcp`,
        { headers: { "content-type": "text/plain; charset=utf-8" } },
      );
    }
    return new Response("No encontrado.", { status: 404 });
  },
};

export default new OAuthProvider<Env>({
  apiRoute: "/mcp",
  apiHandler: mcpHandler as never,
  defaultHandler: defaultHandler as never,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/oauth/token",
  clientRegistrationEndpoint: "/oauth/register",
  scopesSupported: ["relevo"],
  requiredScopes: ["relevo"],
  resourceMetadata: {
    resource: `${PUBLIC_URL}/mcp`,
    authorization_servers: [PUBLIC_URL],
  },
  accessTokenTTL: ACCESS_TTL,
  // Mientras Claude lo siga usando, no hay que volver a entrar.
  refreshTokenIdleTTL: 30 * 24 * 3600,
  tokenExchangeCallback: async (options) => {
    if (options.grantType !== "refresh_token") return;
    const props = options.props as Props;
    // Sesion nueva de Supabase; su refresh token rota y se guarda en el grant.
    let session: Awaited<ReturnType<typeof refresh>>;
    try {
      session = await refresh(options.env, props.refreshToken);
    } catch {
      // La sesion de Supabase ya no sirve (cambio de contraseña, cuenta borrada):
      // Claude tiene que volver a conectar.
      throw new OAuthError("invalid_grant", { description: "La sesión de Relevo caducó. Vuelve a conectar." });
    }
    const next: Props = { ...props, accessToken: session.access_token, refreshToken: session.refresh_token };
    return {
      accessTokenProps: next,
      newProps: next,
      accessTokenTTL: Math.min(ACCESS_TTL, Math.max(60, session.expires_in - 300)),
    };
  },
});
