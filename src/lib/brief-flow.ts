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
export const BRIEF_STATUSES = [
  "borrador",
  "en_revision",
  "en_produccion",
  "en_lanzamiento",
  "lanzado",
] as const;
export type BriefStatus = (typeof BRIEF_STATUSES)[number];

export const STATUS_LABEL: Record<BriefStatus, string> = {
  borrador: "Borrador",
  en_revision: "En revisión",
  en_produccion: "En producción",
  en_lanzamiento: "Por lanzar",
  lanzado: "Lanzado",
};

/** Las tres manos por las que pasa un brief, en orden. */
export type StageStatus = "en_revision" | "en_produccion" | "en_lanzamiento";
export type OwnerField = "reviewer_id" | "producer_id" | "launcher_id";

export const STAGES: { status: StageStatus; field: OwnerField; label: string; hint: string }[] = [
  { status: "en_revision", field: "reviewer_id", label: "Revisión", hint: "Aprueba el copy" },
  { status: "en_produccion", field: "producer_id", label: "Producción", hint: "Diseña o arma la pieza" },
  { status: "en_lanzamiento", field: "launcher_id", label: "Lanzamiento", hint: "Sube la campaña" },
];

/** Las etapas en las que el brief esta en manos de alguien: lo "abierto". */
export const OPEN_STATUSES: StageStatus[] = STAGES.map((stage) => stage.status);

/** `back`: regresar trabajo pide motivo, y la base lo exige. */
export const NEXT_STEPS: Record<BriefStatus, { to: BriefStatus; label: string; back?: boolean }[]> = {
  borrador: [
    { to: "en_revision", label: "Mandar a revisión" },
    { to: "en_produccion", label: "Saltar a producción" },
  ],
  en_revision: [
    { to: "en_produccion", label: "Aprobar y mandar a producción" },
    { to: "borrador", label: "Regresar a copy", back: true },
  ],
  en_produccion: [
    { to: "en_lanzamiento", label: "Listo, mandar a lanzamiento" },
    { to: "en_revision", label: "Regresar a revisión", back: true },
  ],
  en_lanzamiento: [
    { to: "lanzado", label: "Marcar como lanzado" },
    { to: "en_produccion", label: "Regresar a producción", back: true },
  ],
  lanzado: [{ to: "en_lanzamiento", label: "Reabrir", back: true }],
};

export const CHANNELS = ["ads", "email", "sms"] as const;
export type Channel = (typeof CHANNELS)[number];

export const CHANNEL_LABEL: Record<Channel, string> = {
  ads: "Ads",
  email: "Email",
  sms: "SMS",
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

/**
 * Version para incrustar. Google sirve `/preview` sin bloquear iframes; `/edit`
 * no esta pensado para eso. Solo Docs, Sheets, Slides y archivos de Drive: de
 * otros sitios no sabemos si se dejan incrustar, asi que se abren aparte.
 */
export function docEmbedUrl(docUrl: string): string | null {
  const { hostname, pathname } = new URL(docUrl);
  if (hostname === "docs.google.com") {
    // `/u/1/` elige la cuenta de Google con la que se abre; se conserva.
    const match = pathname.match(
      /^\/(document|spreadsheets|presentation)(\/u\/\d+)?\/d\/([\w-]+)/,
    );
    if (match) {
      return `https://docs.google.com/${match[1]}${match[2] ?? ""}/d/${match[3]}/preview`;
    }
  }
  if (hostname === "drive.google.com") {
    const match = pathname.match(/^\/file\/d\/([\w-]+)/);
    if (match) return `https://drive.google.com/file/d/${match[1]}/preview`;
  }
  return null;
}

/** "3 h", "2 d": lo que lleva algo esperando, sin fecha que haya que restar. */
export function elapsed(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "recién";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

/** Lo que dice el boton de terminar cada etapa desde la lista de pendientes. */
export const FINISH_LABEL: Record<StageStatus, string> = {
  en_revision: "Aprobar",
  en_produccion: "Terminar",
  en_lanzamiento: "Marcar lanzado",
};
