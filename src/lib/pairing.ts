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

/**
 * El archivo sin sufijo es la pieza base ("AD-PM2-9.jpg" frente a
 * "AD-PM2-9.2.jpg"). Es el nombre que el equipo usa para referirse al anuncio,
 * asi que es el que conviene dejar en la tarjeta del tablero.
 */
export function isBaseName(filename: string): boolean {
  const sinExtension = filename.replace(/\.[a-z0-9]+$/i, "");
  return !/^(.*\d)\.\d+$/.test(sinExtension);
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

/** Lo minimo para decidir si dos archivos son el mismo anuncio. */
export type Emparejable = {
  id: string;
  original_filename: string;
  media_type: "image" | "video";
  width: number | null;
  height: number | null;
  client_id: string | null;
};

export type ParElegido<T> = { principal: T; variantes: T[] };
export type ParDescartado<T> = { clave: string; motivo: string; items: T[] };

/**
 * Decide que se agrupa y que no, con una sola definicion de las reglas.
 *
 * Vive aqui y no en el script ni en la accion porque las dos necesitan la
 * MISMA respuesta: si se agrupa distinto al subir que al limpiar la biblioteca,
 * el equipo deja de poder predecir lo que hace la app.
 *
 * Es deliberadamente conservador. Agrupar de mas obliga a separar a mano;
 * agrupar de menos solo deja un par para el panel.
 */
export function selectAutoPairs<T extends Emparejable>(
  items: T[],
  opciones: {
    aspectoDe: (item: T) => string | null;
    tieneLanzamientos?: (item: T) => boolean;
    tieneVariantes?: (item: T) => boolean;
  },
): { elegidos: ParElegido<T>[]; descartados: ParDescartado<T>[] } {
  const elegidos: ParElegido<T>[] = [];
  const descartados: ParDescartado<T>[] = [];

  for (const grupo of suggestPairs(items, (item) => item.original_filename)) {
    const descartar = (motivo: string) =>
      descartados.push({ clave: grupo.key, motivo, items: grupo.items });

    if (grupo.items.length !== 2) {
      descartar(`son ${grupo.items.length} archivos, no un par`);
      continue;
    }
    if (grupo.items.some((item) => item.media_type !== "image")) {
      descartar("hay video: los videos no van en par por placement");
      continue;
    }
    if (opciones.tieneLanzamientos && grupo.items.some(opciones.tieneLanzamientos)) {
      descartar("ya tiene lanzamientos: el historial se deja como esta");
      continue;
    }
    if (opciones.tieneVariantes && grupo.items.some(opciones.tieneVariantes)) {
      descartar("alguno ya tiene variantes colgando");
      continue;
    }

    const clientes = new Set(grupo.items.map((item) => item.client_id));
    if (clientes.size !== 1 || grupo.items[0].client_id === null) {
      descartar("no son del mismo cliente");
      continue;
    }

    // Dos archivos del mismo aspecto no son feed + historia: se parecen de
    // nombre pero probablemente son dos anuncios distintos.
    const aspectos = new Set(grupo.items.map(opciones.aspectoDe));
    if (aspectos.size !== 2 || aspectos.has(null)) {
      descartar(
        `aspectos ${[...aspectos].map((a) => a ?? "desconocido").join(" y ")}: no parece un par de placements`,
      );
      continue;
    }

    const principal =
      grupo.items.find((item) => isBaseName(item.original_filename)) ?? grupo.items[0];
    elegidos.push({
      principal,
      variantes: grupo.items.filter((item) => item.id !== principal.id),
    });
  }

  return { elegidos, descartados };
}
