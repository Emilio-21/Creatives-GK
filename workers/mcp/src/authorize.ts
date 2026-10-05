import {
  AuthorizationError,
  CimdFetchError,
  type AuthRequest,
  type ConsentDescription,
  type OAuthHelpers,
} from "@cloudflare/workers-oauth-provider";
import { signIn, type Env, type Props } from "./supabase";

/**
 * /authorize: la persona entra con su cuenta de Relevo y autoriza a Claude en
 * la misma pantalla. No hay sesion previa que reusar: el conector vive en otro
 * dominio que la app, asi que pide correo y contraseña una vez y guarda su
 * propia sesion de Supabase (cifrada en el grant).
 */

type EnvWithHelpers = Env & { OAUTH_PROVIDER: OAuthHelpers };

const escape = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export async function handleAuthorize(request: Request, env: EnvWithHelpers): Promise<Response> {
  const oauth = env.OAUTH_PROVIDER;
  try {
    if (request.method === "GET") {
      const authRequest = await oauth.parseAuthRequest(request);
      return await showPage(oauth, authRequest);
    }

    if (request.method !== "POST") return new Response("Método no permitido.", { status: 405 });

    const form = await request.formData();
    const handle = String(form.get("handle") ?? "");

    if (form.get("decision") !== "approve") {
      const denied = await oauth.denyConsent(request, handle);
      return new Response(null, { status: 302, headers: denied.headers });
    }

    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");
    let session: Awaited<ReturnType<typeof signIn>>;
    try {
      session = await signIn(env, email, password);
    } catch (error) {
      // El handle sigue sin usar: se vuelve a mostrar la pagina con el error.
      return page(
        { handle, email, error: mensajeLogin(error as Error & { code?: string }) },
        new Headers({ "X-Frame-Options": "DENY", "Content-Security-Policy": "frame-ancestors 'none'" }),
        null,
      );
    }

    const approved = await oauth.approveConsent(request, handle, { scope: ["relevo"] });
    const props: Props = {
      userId: session.user.id,
      email: session.user.email ?? email,
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
    };
    const { redirectTo } = await oauth.completeAuthorization({
      request: approved.request,
      userId: session.user.id,
      metadata: { email: props.email },
      scope: ["relevo"],
      props,
    });
    approved.headers.set("Location", redirectTo);
    return new Response(null, { status: 302, headers: approved.headers });
  } catch (error) {
    if (error instanceof AuthorizationError && error.redirectTo) {
      return Response.redirect(error.redirectTo, 302);
    }
    if (error instanceof AuthorizationError || error instanceof CimdFetchError) {
      const message =
        error instanceof AuthorizationError
          ? "La conexión caducó o se abrió en otro navegador. Vuelve a conectar desde Claude."
          : "No se pudo verificar la aplicación que pide acceso.";
      return page({ fatal: message }, new Headers(), null, 400);
    }
    throw error;
  }
}

function mensajeLogin(error: Error & { code?: string }): string {
  if (error.code === "email_not_confirmed") return "Primero confirma tu correo desde el enlace que te llegó.";
  if (error.code === "invalid_credentials") return "Correo o contraseña incorrectos.";
  return error.message || "No se pudo iniciar sesión.";
}

async function showPage(oauth: OAuthHelpers, authRequest: AuthRequest): Promise<Response> {
  const details = await oauth.describeConsent(authRequest);
  const consent = await oauth.beginConsent(authRequest);
  return page({ handle: consent.handle }, consent.headers, details);
}

function page(
  state: { handle?: string; email?: string; error?: string; fatal?: string },
  headers: Headers,
  details: ConsentDescription | null,
  status = 200,
): Response {
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "no-store");

  const quien = details
    ? `<p class="muted"><strong>${escape(details.clientName)}</strong> quiere usar Relevo con tu cuenta.
       El acceso se manda a <strong>${escape(details.redirectHost)}</strong>.</p>
       ${details.redirectIsLoopback ? '<p class="warn">Esto manda el acceso a una app en tu computadora. Sigue solo si acabas de conectar desde ella.</p>' : ""}`
    : "";

  const cuerpo = state.fatal
    ? `<p class="error">${escape(state.fatal)}</p>`
    : `${quien}
      <ul class="muted">
        <li>Podrá ver tus tareas, clientes, equipo y métricas.</li>
        <li>Podrá crear y mover tareas, aprobar, comentar y pedir cosas a clientes en tu nombre.</li>
        <li>Todo queda registrado como hecho por ti.</li>
      </ul>
      <form method="post">
        <input type="hidden" name="handle" value="${escape(state.handle ?? "")}">
        <label>Correo<input name="email" type="email" autocomplete="username" required value="${escape(state.email ?? "")}"></label>
        <label>Contraseña<input name="password" type="password" autocomplete="current-password" required></label>
        ${state.error ? `<p class="error">${escape(state.error)}</p>` : ""}
        <div class="actions">
          <button name="decision" value="deny" formnovalidate class="ghost">Cancelar</button>
          <button name="decision" value="approve" class="primary">Entrar y conectar</button>
        </div>
      </form>`;

  const html = `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Conectar Claude · Relevo</title>
<style>
  :root { --bg:#f7f4f0; --card:#fff; --fg:#1d1a17; --muted:#6b645d; --line:#e4ddd5; --brand:#BE3D0D; --error:#b42318; }
  @media (prefers-color-scheme: dark) { :root { --bg:#151311; --card:#1f1c19; --fg:#f3eee8; --muted:#a39a90; --line:#36312c; --error:#f97066; } }
  * { box-sizing:border-box } body { margin:0; min-height:100svh; display:grid; place-items:center; padding:16px; background:var(--bg); color:var(--fg); font:15px/1.5 system-ui,-apple-system,sans-serif }
  main { width:100%; max-width:420px; background:var(--card); border:1px solid var(--line); border-radius:18px; padding:28px }
  h1 { font-size:22px; font-weight:600; margin:0 0 12px } .brand { color:var(--brand); font-weight:600; font-size:13px; letter-spacing:.06em; text-transform:uppercase; margin-bottom:8px }
  .muted { color:var(--muted); font-size:14px } ul { padding-left:18px; margin:12px 0 20px } .warn { color:var(--error); font-size:14px }
  label { display:block; font-size:13px; font-weight:500; margin-bottom:12px } input { display:block; width:100%; margin-top:4px; padding:10px 12px; border:1px solid var(--line); border-radius:10px; background:transparent; color:inherit; font:inherit }
  .error { color:var(--error); font-size:14px } .actions { display:flex; gap:8px; justify-content:flex-end; margin-top:16px }
  button { font:inherit; padding:9px 16px; border-radius:999px; border:1px solid var(--line); background:transparent; color:inherit; cursor:pointer } .primary { background:var(--brand); border-color:var(--brand); color:#fff }
</style></head>
<body><main>
  <div class="brand">Relevo</div>
  <h1>Conectar Claude</h1>
  ${cuerpo}
</main></body></html>`;

  return new Response(html, { status, headers });
}
