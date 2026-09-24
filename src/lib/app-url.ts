/** La URL publica de Relevo, sin diagonal final. APP_URL la cambia (p. ej. en local). */
export const PRODUCTION_URL = "https://relevo.growth-kingdom.workers.dev";

export function appUrl(): string {
  return (process.env.APP_URL || PRODUCTION_URL).replace(/\/$/, "");
}
