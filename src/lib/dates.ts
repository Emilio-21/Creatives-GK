/** La zona del equipo. El Worker corre en UTC y el navegador puede estar en cualquiera. */
const ZONA = "America/Mexico_City";

/**
 * La fecha de hoy ("2026-09-24") en la zona del equipo.
 *
 * No `toISOString().slice(0, 10)`: eso es la fecha en UTC, que en Mexico ya es
 * "mañana" desde las 6 de la tarde, y una entrega de hoy saldria vencida.
 */
export function today(now: Date = new Date()): string {
  // en-CA formatea como AAAA-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(now);
}
