import { adCodeFor } from "@/lib/ad-code";

/**
 * Compone los nombres de Meta a partir de la nomenclatura del batch.
 *
 * Un batch es un adset: el numero de campaña y el de adset viven ahi, y el
 * consecutivo del anuncio lo lleva la app. Isomorfo a proposito — se usa en el
 * navegador para el boton de copiar.
 */
export type BatchNaming = {
  campaignCode: string | null;
  adsetCode: string | null;
  campaignLabel: string | null;
  adsetLabel: string | null;
  adLabel: string | null;
};

export function campaignName(naming: BatchNaming): string | null {
  if (!naming.campaignCode) return null;
  return join(`[${naming.campaignCode}]`, naming.campaignLabel);
}

export function adsetName(naming: BatchNaming): string | null {
  if (!naming.campaignCode || !naming.adsetCode) return null;
  return join(`[${naming.campaignCode}-${naming.adsetCode}]`, naming.adsetLabel);
}

/**
 * `index` es la posicion del creativo dentro del batch, empezando en 0.
 *
 * El orden debe ser estable (fecha de alta), no el del filtro de pantalla: si
 * dependiera de como esta ordenada la vista, cambiar de "mas recientes" a
 * "nombre" renumeraria los anuncios.
 */
export function adName(naming: BatchNaming, creativeId: string, index: number): string {
  const code = `[${adCodeFor(creativeId)}]`;
  const prefix =
    naming.campaignCode && naming.adsetCode
      ? `[${naming.campaignCode}-${naming.adsetCode}-Ad${String(index + 1).padStart(2, "0")}]`
      : null;

  return [prefix, code, naming.adLabel ? `| ${naming.adLabel}` : null]
    .filter(Boolean)
    .join(" ");
}

function join(prefix: string, label: string | null): string {
  return label?.trim() ? `${prefix} ${label.trim()}` : prefix;
}
