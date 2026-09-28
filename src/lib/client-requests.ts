/**
 * Pedidos al cliente: lo que se comparte entre la pagina del link (sin sesion)
 * y la seccion del equipo. Modulo aparte porque "use server" solo puede
 * exportar funciones async.
 */

/** Un video grabado en el celular pesa cientos de MB; mas de 1 GB ya es otra cosa. */
export const MAX_REQUEST_FILE_BYTES = 1024 * 1024 * 1024;

/** Tope por pedido: el link es publico y no debe servir para llenar el bucket. */
export const MAX_FILES_PER_REQUEST = 60;

/** Los 64 hex que genera client_portal_token (0033). */
export const PORTAL_TOKEN = /^[a-f0-9]{64}$/;

export function portalPath(token: string): string {
  return `/entregas/${token}`;
}

/** El texto listo para pegar en WhatsApp o en un correo. */
export function mensajeParaCliente({
  titulo,
  fecha,
  url,
}: {
  titulo: string;
  fecha: string | null;
  url: string;
}): string {
  const cuando = fecha ? ` antes del ${fechaLarga(fecha)}` : "";
  return (
    `¡Hola! Para seguir con tu campaña necesitamos: ${titulo}.\n\n` +
    `Súbelo aquí${cuando}, no necesitas cuenta:\n${url}\n\n¡Gracias!`
  );
}

/** "2026-10-03" → "viernes 3 de octubre". Sin zona: es una fecha, no un instante. */
export function fechaLarga(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}
