/**
 * Los fondos que cada quien puede elegir para su pantalla. La imagen completa
 * vive en /fondos/{id}.webp y su miniatura (para el selector) en
 * /fondos/mini/{id}.webp. `color` es el tono de respaldo mientras carga.
 *
 * Los ids se guardan en profiles.background y la base los valida (0031): uno
 * nuevo va aqui Y en esa lista.
 */
export const BACKGROUNDS = [
  { id: "naranja", label: "Naranja", color: "#a6380b" },
  { id: "petroleo", label: "Petróleo", color: "#0a556f" },
  { id: "cobalto", label: "Cobalto", color: "#085db6" },
  { id: "acero", label: "Acero", color: "#648aa9" },
  { id: "esmeralda", label: "Esmeralda", color: "#0b6d4f" },
  { id: "salvia", label: "Salvia", color: "#74866e" },
  { id: "grafito", label: "Grafito", color: "#7f7f7f" },
] as const;

export type BackgroundId = (typeof BACKGROUNDS)[number]["id"];

export const DEFAULT_BACKGROUND: BackgroundId = "naranja";

export function backgroundOf(id: string | null | undefined) {
  return BACKGROUNDS.find((bg) => bg.id === id) ?? BACKGROUNDS[0];
}

/** Las variables CSS que lee .app-aura. */
export function auraStyle(id: string | null | undefined): Record<string, string> {
  const bg = backgroundOf(id);
  return { "--aura-image": `url("/fondos/${bg.id}.webp")`, "--aura-color": bg.color };
}
