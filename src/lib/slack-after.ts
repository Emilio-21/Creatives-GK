import "server-only";
import { after } from "next/server";
import { deliverPendingSlack } from "@/lib/slack-deliver";

/**
 * Manda a Slack lo pendiente despues de responder: el cambio de etapa no espera
 * a Slack, y si Slack falla no tumba la accion. Lo que no salga aqui lo toma el
 * reintento del cron.
 */
export function deliverSlackSoon(): void {
  after(async () => {
    try {
      const report = await deliverPendingSlack();
      if (report.failed) console.error("[slack]", report.errors.join(" | "));
    } catch (error) {
      console.error("[slack]", (error as Error).message);
    }
  });
}
