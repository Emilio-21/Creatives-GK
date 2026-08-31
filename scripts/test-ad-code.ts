/** Prueba del codigo que enlaza anuncios de Meta con creativos. */
import { adCodeFor, adNameFor, extractAdCode } from "../src/lib/ad-code";

const id = "7b74c9bd-1297-4765-a409-cd2c8e212165";
const code = adCodeFor(id);
const name = adNameFor(id, "AB_TESTIMONIAL ácido v3.mp4");

const cases: [string, boolean][] = [
  ["ida y vuelta", extractAdCode(name) === code],
  ["con sufijo del equipo", extractAdCode(`${name} - copia 2`) === code],
  ["prefijo del equipo", extractAdCode(`JM 2026 ${name}`) === code],
  ["mayúsculas", extractAdCode(name.toUpperCase()) === code],
  ["sin código", extractAdCode("Anuncio normal sin nada") === null],
  ["código falso", extractAdCode("algo [GK-zzzz]") === null],
  ["ids distintos", code !== adCodeFor("7b74c9bd-0000-4765-a409-cd2c8e212165")],
];

console.log(`\ncódigo : ${code}`);
console.log(`nombre : ${name}\n`);

let failed = false;
for (const [label, ok] of cases) {
  if (!ok) failed = true;
  console.log(`  ${ok ? "ok   " : "FALLA"} ${label}`);
}

// Colisiones: 8 hex = 4.3e9 combinaciones. Con cientos de creativos es
// despreciable, pero se comprueba que la derivacion no repita en volumen.
const seen = new Set<string>();
let collisions = 0;
for (let i = 0; i < 20000; i += 1) {
  const generated = adCodeFor(crypto.randomUUID());
  if (seen.has(generated)) collisions += 1;
  seen.add(generated);
}
console.log(`  ${collisions === 0 ? "ok   " : "AVISO"} 20 000 uuids: ${collisions} colisiones`);

console.log(failed ? "\nHay fallas.\n" : "\nCódigo de anuncio OK.\n");
process.exit(failed ? 1 : 0);
