/**
 * La URL vieja (creativos-gk.growth-kingdom.workers.dev) manda a la nueva.
 *
 * Existen links a la vieja en mensajes de Slack ya enviados y en favoritos:
 * con esto siguen llegando, a la misma ruta (/client/…?brief=… incluido).
 * 301 porque el cambio es permanente. La sesion no viaja (es otro dominio):
 * la primera vez en la URL nueva hay que volver a entrar.
 */
const NUEVA = "https://relevo.growth-kingdom.workers.dev";

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    return Response.redirect(`${NUEVA}${url.pathname}${url.search}`, 301);
  },
};
