/**
 * Detecta pares de estaticos por el nombre del archivo.
 *
 * La convencion del equipo es "10" para la version de feed y "10.2" para la de
 * historia: mismo numero base, sufijo distinto. Es una SUGERENCIA, no una
 * regla — el nombre de un archivo es demasiado fragil para agrupar anuncios sin
 * que alguien lo confirme.
 */

/** "10.2.png" -> "10"; "10.png" -> "10"; "hook-a.png" -> "hook-a". */
export function pairKey(filename: string): string {
  const sinExtension = filename.replace(/\.[a-z0-9]+$/i, "");
  // Solo se recorta el sufijo cuando la base es numerica: "v1.2" agrupa con
  // "v1", pero "spot.final" no debe agrupar con "spot".
  const match = sinExtension.match(/^(.*\d)\.\d+$/);
  return (match ? match[1] : sinExtension).trim().toLowerCase();
}

export type SugerenciaPar<T> = { key: string; items: T[] };

/** Agrupa por clave y devuelve solo los grupos de 2 o mas. */
export function suggestPairs<T>(
  items: T[],
  filenameOf: (item: T) => string,
): SugerenciaPar<T>[] {
  const porClave = new Map<string, T[]>();
  for (const item of items) {
    const key = pairKey(filenameOf(item));
    porClave.set(key, [...(porClave.get(key) ?? []), item]);
  }
  return [...porClave.entries()]
    .filter(([, lista]) => lista.length >= 2)
    .map(([key, lista]) => ({ key, items: lista }));
}
