/**
 * Codigo que enlaza un anuncio de Meta con un creativo de aqui.
 *
 * Se deriva del uuid del creativo, asi que no hay columna nueva ni riesgo de
 * que se desincronice. Va dentro del nombre del anuncio y el sync lo extrae con
 * un regex: es una llave exacta, no una comparacion de nombres parecidos.
 */
const PREFIX = "GK-";

export function adCodeFor(creativeId: string): string {
  return `${PREFIX}${hash32(creativeId)}`;
}

/**
 * FNV-1a de 32 bits sobre el uuid completo, no sus primeros caracteres: dos ids
 * que compartan el primer bloque darian el mismo codigo. Isomorfo a proposito
 * (el nombre se arma en el navegador y se lee en el servidor), sin dependencias.
 */
function hash32(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** Formato listo para pegar en el nombre del anuncio. */
export function adNameFor(creativeId: string, displayName: string): string {
  const base = displayName
    .replace(/\.[a-z0-9]{2,4}$/i, "")
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_|_$/g, "");
  return `${base}_[${adCodeFor(creativeId)}]`;
}

const CODE_PATTERN = /\[GK-([0-9a-f]{8})\]/i;

/** Devuelve el codigo que trae el nombre de un anuncio, o null. */
export function extractAdCode(adName: string): string | null {
  const match = CODE_PATTERN.exec(adName);
  return match ? `${PREFIX}${match[1].toLowerCase()}` : null;
}
