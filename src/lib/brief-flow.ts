/**
 * Los estados del brief y lo que sigue desde cada uno.
 *
 * Viven aqui y no junto a las acciones porque un archivo "use server" solo
 * puede exportar funciones async: exportar una constante desde ahi rompe el
 * build en cuanto un componente de servidor lo importa.
 *
 * Las transiciones validas de verdad las decide transition_brief en la base.
 * Esto es el orden en que se ofrecen en pantalla.
 */
export const BRIEF_STATUSES = ["borrador", "asignado", "en_diseno", "listo"] as const;
export type BriefStatus = (typeof BRIEF_STATUSES)[number];

export const STATUS_LABEL: Record<BriefStatus, string> = {
  borrador: "Borrador",
  asignado: "Asignado",
  en_diseno: "En diseño",
  listo: "Listo para lanzar",
};

export const NEXT_STEPS: Record<BriefStatus, { to: BriefStatus; label: string }[]> = {
  borrador: [{ to: "asignado", label: "Asignar a diseño" }],
  asignado: [
    { to: "en_diseno", label: "Empezar diseño" },
    { to: "borrador", label: "Volver a borrador" },
  ],
  en_diseno: [
    { to: "listo", label: "Marcar listo para lanzar" },
    { to: "asignado", label: "Reasignar" },
  ],
  listo: [{ to: "en_diseno", label: "Devolver a diseño" }],
};

/**
 * El brief vive en Google Docs; la app guarda el link. Se acepta pegado sin
 * protocolo porque asi sale muchas veces de la barra del navegador.
 * Devuelve null si esta vacio y lanza si no parece un link.
 */
export function normalizeDocUrl(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  const withProtocol = /^[a-z]+:\/\//i.test(text) ? text : `https://${text}`;
  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    throw new Error("Ese link no se ve bien. Pega el link completo del Google Doc.");
  }
  if (url.protocol !== "https:") throw new Error("El link tiene que empezar con https://");
  return url.toString();
}

/** Lo que dice el boton. Si no es de Google, el dominio: que se vea a donde lleva. */
export function docLabel(docUrl: string): string {
  const { hostname, pathname } = new URL(docUrl);
  if (hostname === "docs.google.com") {
    if (pathname.startsWith("/document")) return "Google Doc";
    if (pathname.startsWith("/spreadsheets")) return "Google Sheet";
    if (pathname.startsWith("/presentation")) return "Google Slides";
  }
  if (hostname === "drive.google.com") return "Google Drive";
  return hostname.replace(/^www\./, "");
}
