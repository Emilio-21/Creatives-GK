/**
 * Agrupa los pares de estaticos que ya estan en la biblioteca.
 *
 * Los estaticos salen en 1:1 y 9:16 y entran al MISMO anuncio de Meta, pero se
 * subieron cuando la app todavia suponia un archivo por anuncio. Esto los junta
 * de una vez, sin tener que pasar 28 veces por el panel.
 *
 *   npm run pair:statics            muestra el plan, no toca nada
 *   npm run pair:statics -- --apply lo ejecuta
 *
 * Es conservador a proposito: solo agrupa lo que no deja ninguna duda, y todo
 * lo demas lo reporta para que alguien lo mire. Agrupar de mas obliga a
 * desagrupar a mano; agrupar de menos solo deja trabajo pendiente.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { aspectLabel } from "../src/lib/aspect";
import { selectAutoPairs } from "../src/lib/pairing";

config({ path: ".env.local" });

type Fila = {
  id: string;
  original_filename: string;
  display_name: string;
  media_type: "image" | "video";
  width: number | null;
  height: number | null;
  client_id: string | null;
  batch_id: string | null;
  parent_id: string | null;
};

const APPLY = process.argv.includes("--apply");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const aspectoDe = (fila: Fila) => aspectLabel(fila.width, fila.height) ?? "?";
const etiqueta = (fila: Fila) => `${fila.original_filename} (${aspectoDe(fila)})`;

async function main() {
  const { data, error } = await supabase
    .from("creatives")
    .select(
      "id, original_filename, display_name, media_type, width, height, client_id, batch_id, parent_id",
    )
    .is("archived_at", null);

  if (error) throw new Error(error.message);
  const filas = (data ?? []) as Fila[];

  const { data: launchRows } = await supabase.from("launches").select("creative_id");
  const lanzados = new Set((launchRows ?? []).map((row) => row.creative_id as string));

  const { data: clientRows } = await supabase.from("clients").select("id, name");
  const nombreCliente = new Map(
    (clientRows ?? []).map((row) => [row.id as string, row.name as string]),
  );

  // Solo se consideran anuncios sueltos: lo ya agrupado se deja en paz para que
  // el script se pueda correr dos veces sin efectos raros.
  const sueltos = filas.filter((fila) => fila.parent_id === null);
  const yaEsPadre = new Set(
    filas.filter((fila) => fila.parent_id).map((fila) => fila.parent_id as string),
  );

  // Las mismas reglas que al subir: si agrupara distinto aqui que alla, el
  // equipo dejaria de poder predecir lo que hace la app.
  const { elegidos, descartados } = selectAutoPairs(sueltos, {
    aspectoDe: (fila) => aspectLabel(fila.width, fila.height),
    tieneLanzamientos: (fila) => lanzados.has(fila.id),
    tieneVariantes: (fila) => yaEsPadre.has(fila.id),
  });

  const planes = elegidos;
  const saltados = descartados.map((item) => ({
    clave: item.clave,
    motivo: item.motivo,
    archivos: item.items.map(etiqueta),
  }));


  console.log(
    `\n${sueltos.length} anuncios sueltos · ${planes.length} pares para agrupar · ${saltados.length} a revisar\n`,
  );

  for (const plan of planes) {
    const cliente = nombreCliente.get(plan.principal.client_id!) ?? "sin cliente";
    console.log(`  ${cliente.padEnd(18)} ${etiqueta(plan.principal)}`);
    for (const variante of plan.variantes) console.log(`  ${"".padEnd(18)}   + ${etiqueta(variante)}`);
  }

  if (saltados.length > 0) {
    console.log("\nA revisar a mano:");
    for (const item of saltados) {
      console.log(`  [${item.clave}] ${item.motivo}`);
      for (const archivo of item.archivos) console.log(`      ${archivo}`);
    }
  }

  if (!APPLY) {
    console.log(
      `\nNada se toco. Para aplicarlo:  npm run pair:statics -- --apply\n`,
    );
    return;
  }

  console.log("\nAplicando…");
  let agrupadas = 0;
  for (const plan of planes) {
    const { error: updateError } = await supabase
      .from("creatives")
      .update({ parent_id: plan.principal.id, batch_id: plan.principal.batch_id })
      .in(
        "id",
        plan.variantes.map((variante) => variante.id),
      );

    if (updateError) {
      console.log(`  FALLA ${plan.principal.original_filename}: ${updateError.message}`);
      continue;
    }
    agrupadas += plan.variantes.length;
  }

  // Se cuenta contra la base, no contra lo que este script cree que hizo.
  const { count } = await supabase
    .from("creatives")
    .select("id", { count: "exact", head: true })
    .not("parent_id", "is", null);

  console.log(`\n${agrupadas} variantes agrupadas · ${count} variantes en la base\n`);
}

main().catch((error: Error) => {
  console.error(`\n${error.message}\n`);
  process.exit(1);
});
