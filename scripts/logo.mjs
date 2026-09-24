/**
 * Genera el logo de Relevo (el relevo de la estafeta) desde geometria exacta.
 *
 *   node scripts/logo.mjs
 *
 * Tres barras redondeadas a 45° — el angulo de las guias del cutting mat:
 * en un carril, la barra de atras entrega y la de adelante toma (su punta
 * encaja en una muesca de la de atras); en el carril de al lado, una barra
 * larga. Todo se dibuja horizontal y se rota -45° al final.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const T = 96; // grosor de todas las barras
const R = T / 2; // puntas redondas completas
const CARRIL = 24; // separacion entre carriles
const MUESCA = 14; // aire entre la barra que entrega y la que toma
const yA = -(R + CARRIL / 2); // carril del relevo
const yB = R + CARRIL / 2; // carril largo

// Tramos en el eje de la barra (antes de rotar).
const atras = [-134, 26];
const adelante = [-24, 203];
const larga = [-202, 169];

const bar = (x0, x1, y) =>
  `<rect x="${x0}" y="${y - R}" width="${x1 - x0}" height="${T}" rx="${R}"/>`;

// Extremos rotados, para centrar el simbolo en el cuadro.
function bbox() {
  const pts = [];
  for (const [[x0, x1], y] of [[atras, yA], [adelante, yA], [larga, yB]]) {
    for (let a = 0; a < 360; a += 5) {
      const rad = (a * Math.PI) / 180;
      for (const cx of [x0 + R, x1 - R]) {
        const x = cx + R * Math.cos(rad);
        const yy = y + R * Math.sin(rad);
        pts.push([Math.SQRT1_2 * (x + yy), Math.SQRT1_2 * (-x + yy)]);
      }
    }
  }
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

/** El simbolo solo, centrado en un cuadro de `size` con `pad` de margen. */
export function symbol({ color = "currentColor", size = 512, pad = 40, bg = null } = {}) {
  const b = bbox();
  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  const scale = (size - pad * 2) / Math.max(w, h);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const muescaX = adelante[0] + R;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
${bg ? `  <rect width="${size}" height="${size}" rx="${size * 0.22}" fill="${bg}"/>\n` : ""}  <defs>
    <mask id="muesca" maskUnits="userSpaceOnUse" x="-400" y="-400" width="800" height="800">
      <rect x="-400" y="-400" width="800" height="800" fill="#fff"/>
      <circle cx="${muescaX}" cy="${yA}" r="${R + MUESCA}" fill="#000"/>
    </mask>
  </defs>
  <g fill="${color}" transform="translate(${size / 2} ${size / 2}) scale(${scale.toFixed(4)}) translate(${(-cx).toFixed(2)} ${(-cy).toFixed(2)}) rotate(-45)">
    <g mask="url(#muesca)">${bar(atras[0], atras[1], yA)}</g>
    ${bar(adelante[0], adelante[1], yA)}
    ${bar(larga[0], larga[1], yB)}
  </g>
</svg>
`;
}

const NARANJA = "#BE3D0D";
const out = process.argv[2] ?? "public/brand";
mkdirSync(out, { recursive: true });

const files = {
  // Para la app: toma el color del texto, sirve en claro y oscuro.
  "relevo-mark.svg": symbol(),
  // Naranja sobre transparente: documentos, presentaciones.
  "relevo-mark-orange.svg": symbol({ color: NARANJA }),
  // Icono de app / Slack: blanco sobre cuadro naranja redondeado.
  "relevo-icon.svg": symbol({ color: "#FFF7ED", bg: NARANJA, pad: 96 }),
};
for (const [name, svg] of Object.entries(files)) writeFileSync(`${out}/${name}`, svg);

// PNG: Slack pide cuadrado de 512 a 2000 px; iOS usa 180.
await sharp(Buffer.from(symbol({ color: "#FFF7ED", bg: NARANJA, pad: 96, size: 1024 }))).png().toFile(`${out}/relevo-slack-1024.png`);
await sharp(Buffer.from(symbol({ color: "#FFF7ED", bg: NARANJA, pad: 34, size: 180 }))).png().toFile(`${out}/relevo-apple-180.png`);
await sharp(Buffer.from(symbol({ color: NARANJA, size: 1024 }))).png().toFile(`${out}/relevo-mark-1024.png`);
console.log("ok", Object.keys(files).length + 3, "archivos en", out);
