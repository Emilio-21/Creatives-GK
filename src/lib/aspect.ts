/**
 * Etiqueta de aspecto a partir de las dimensiones reales del archivo.
 *
 * No se captura a mano: el ancho y el alto ya se leen al subir, y escribir
 * "9:16" en un campo es una oportunidad mas de equivocarse. Se redondea al
 * placement de Meta mas cercano porque los exports rara vez son exactos
 * (1080x1920 sí, pero 1080x1350 y 1200x1500 son el mismo 4:5).
 */
const PLACEMENTS: { label: string; ratio: number }[] = [
  { label: "9:16", ratio: 9 / 16 },
  { label: "4:5", ratio: 4 / 5 },
  { label: "1:1", ratio: 1 },
  { label: "1.91:1", ratio: 1.91 },
  { label: "16:9", ratio: 16 / 9 },
];

/** Tolerancia relativa: 4% cubre el redondeo de los exports, no confunde 4:5 con 1:1. */
const TOLERANCIA = 0.04;

export function aspectLabel(width: number | null, height: number | null): string | null {
  if (!width || !height || width <= 0 || height <= 0) return null;

  const ratio = width / height;
  let mejor: { label: string; error: number } | null = null;

  for (const placement of PLACEMENTS) {
    const error = Math.abs(ratio - placement.ratio) / placement.ratio;
    if (!mejor || error < mejor.error) mejor = { label: placement.label, error };
  }

  if (mejor && mejor.error <= TOLERANCIA) return mejor.label;

  // Fuera de los placements conocidos: mejor decir la proporcion cruda que
  // mentir con la etiqueta mas cercana.
  return `${ratio.toFixed(2)}:1`;
}
