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
import { isBaseName, suggestPairs } from "../src/lib/pairing";

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

  const planes: { principal: Fila; variantes: Fila[]; motivo: "metricas" | "nombre" }[] = [];
  const saltados: { clave: string; motivo: string; archivos: string[] }[] = [];

  for (const grupo of suggestPairs(sueltos, (fila) => fila.original_filename)) {
    const archivos = grupo.items.map(etiqueta);
    const saltar = (motivo: string) =>
      saltados.push({ clave: grupo.key, motivo, archivos });

    if (grupo.items.length !== 2) {
      saltar(`son ${grupo.items.length} archivos, no un par`);
      continue;
    }
    if (grupo.items.some((fila) => fila.media_type !== "image")) {
      saltar("hay video: los videos no van en par por placement");
      continue;
    }
    // Si UNO del par ya corrio, no se salta: ese se vuelve el principal y se
    // queda con sus metricas. Son justo los pares que mas importan, porque son
    // los que ya estan al aire con la mitad del par huerfana. Solo se salta
    // cuando los dos tienen lanzamientos, que seria decidir cuales metricas
    // sobreviven.
    const conMetricas = grupo.items.filter((fila) => lanzados.has(fila.id));
    if (conMetricas.length === 2) {
      saltar("los dos tienen lanzamientos: hay que decidir a mano cual es el anuncio");
      continue;
    }
    if (grupo.items.some((fila) => yaEsPadre.has(fila.id))) {
      saltar("alguno ya tiene variantes colgando");
      continue;
    }
    const clientes = new Set(grupo.items.map((fila) => fila.client_id));
    if (clientes.size !== 1 || grupo.items[0].client_id === null) {
      saltar("no son del mismo cliente");
      continue;
    }
    // Dos archivos del mismo aspecto no son feed + historia: se parecen de
    // nombre pero probablemente son dos anuncios distintos.
    const aspectos = new Set(grupo.items.map(aspectoDe));
    if (aspectos.size !== 2 || aspectos.has("?")) {
      saltar(`aspectos ${[...aspectos].join(" y ")}: no parece un par de placements`);
      continue;
    }

    const principal =
      conMetricas[0] ??
      grupo.items.find((fila) => isBaseName(fila.original_filename)) ??
      grupo.items[0];
    planes.push({
      principal,
      variantes: grupo.items.filter((fila) => fila.id !== principal.id),
      motivo: conMetricas[0] ? "metricas" : "nombre",
    });
  }

  console.log(
    `\n${sueltos.length} anuncios sueltos · ${planes.length} pares para agrupar · ${saltados.length} a revisar\n`,
  );

  for (const plan of planes) {
    const cliente = nombreCliente.get(plan.principal.client_id!) ?? "sin cliente";
    const porMetricas = plan.motivo === "metricas" ? "  ← ya lanzado" : "";
    console.log(`  ${cliente.padEnd(18)} ${etiqueta(plan.principal)}${porMetricas}`);
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
