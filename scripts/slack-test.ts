/**
 * Prueba de Slack: revisa el token y le manda un mensaje de ejemplo a un correo.
 *
 *   npm run slack:test -- tu@correo.com
 *
 * No toca la base: no marca avisos ni guarda ids de Slack.
 */
import { lookupSlackUser, sendDirectMessage, slackToken } from "@/lib/slack";
import { buildMessage } from "@/lib/slack-deliver";

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error("Uso: npm run slack:test -- correo@dominio.com");
  if (!slackToken()) throw new Error("Falta SLACK_BOT_TOKEN en .env.local.");

  const auth = (await (
    await fetch("https://slack.com/api/auth.test", {
      headers: { authorization: `Bearer ${slackToken()}` },
    })
  ).json()) as { ok: boolean; team?: string; user?: string; error?: string };
  if (!auth.ok) throw new Error(`Token inválido: ${auth.error}`);
  console.log(`✓ Token del bot "${auth.user}" en el workspace "${auth.team}"`);

  const slackId = await lookupSlackUser(email);
  if (!slackId) throw new Error(`${email} no está en ese Slack (o el bot no tiene users:read.email).`);
  console.log(`✓ ${email} → ${slackId}`);

  await sendDirectMessage(
    slackId,
    buildMessage({
      title: 'Prueba: te toca producir "Tarea de ejemplo"',
      body: null,
      kind: "en_produccion",
      recipientId: "tu",
      nombres: new Map([["r", "Catalina Arias"], ["l", "Chris Gallardo"]]),
      brief: {
        id: "ejemplo",
        client_id: "ejemplo",
        status: "en_produccion",
        channel: "ads",
        due_date: null,
        doc_url: null,
        reviewer_id: "r",
        producer_id: "tu",
        launcher_id: "l",
        clients: { name: "Cliente de ejemplo" },
      },
    }),
  );
  console.log("✓ Mensaje enviado. Revisa Slack.");
}

main().catch((error) => {
  console.error("✗", (error as Error).message);
  process.exit(1);
});
