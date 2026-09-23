import "server-only";

/**
 * Lo minimo de la Web API de Slack: buscar a alguien por correo y mandarle un
 * mensaje directo. Sin SDK: son dos llamadas y el SDK arrastra dependencias de
 * Node que el Worker no necesita.
 *
 * El token (xoxb-…) es el del bot de la app de Slack de la agencia, con los
 * permisos chat:write, users:read y users:read.email.
 */

const API = "https://slack.com/api";

export function slackToken(): string | null {
  return process.env.SLACK_BOT_TOKEN || null;
}

type SlackResponse = { ok: boolean; error?: string; [key: string]: unknown };

async function call(method: string, body: Record<string, unknown>): Promise<SlackResponse> {
  const token = slackToken();
  if (!token) throw new Error("Falta SLACK_BOT_TOKEN.");

  const response = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });

  // Slack responde 200 con ok:false para casi todo; 429 es el unico que importa aparte.
  if (response.status === 429) {
    throw new Error(`Slack pidió esperar (${response.headers.get("retry-after") ?? "?"} s).`);
  }
  return (await response.json()) as SlackResponse;
}

/** El id de Slack (U…) de quien tiene ese correo en el workspace, o null si no esta. */
export async function lookupSlackUser(email: string): Promise<string | null> {
  const token = slackToken();
  if (!token) throw new Error("Falta SLACK_BOT_TOKEN.");

  // lookupByEmail es GET con query string; con JSON en el cuerpo lo ignora.
  const response = await fetch(`${API}/users.lookupByEmail?email=${encodeURIComponent(email)}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const data = (await response.json()) as SlackResponse & { user?: { id: string } };
  if (data.ok && data.user) return data.user.id;
  if (data.error === "users_not_found") return null;
  throw new Error(`Slack: ${data.error ?? "error desconocido"}`);
}

/**
 * Mensaje directo. Mandar al id de usuario (U…) lo deja en la conversacion con
 * la app, sin tener que abrirla antes con conversations.open.
 */
export async function sendDirectMessage(
  slackUserId: string,
  message: { text: string; blocks: unknown[] },
): Promise<void> {
  const data = await call("chat.postMessage", {
    channel: slackUserId,
    text: message.text, // lo que sale en la notificacion del celular
    blocks: message.blocks,
    unfurl_links: false,
    unfurl_media: false,
  });
  if (!data.ok) throw new Error(`Slack: ${data.error ?? "error desconocido"}`);
}

/** Escapa lo que Slack interpreta en mrkdwn (&, <, >). */
export function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
