import "server-only";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { adCodeFor, extractAdCode } from "@/lib/ad-code";
import {
  fetchAccountAds,
  fetchAccountCurrency,
  fetchAccountInsights,
  type DateRange,
} from "@/lib/meta";
import { serverEnv } from "@/lib/env";
import { publicEnv } from "@/lib/env";

export type SyncReport = {
  clientId: string;
  clientName: string;
  adsFound: number;
  /** De los enlazados, cuantos traian metricas (los demas nunca han gastado). */
  withMetrics: number;
  matched: number;
  launchesWritten: number;
  /** Periodo consultado, para que el reporte diga de que fechas habla. */
  range: DateRange | null;
  /**
   * Anuncios sin el codigo [GK-xxxxxxxx] en el nombre: una MUESTRA de nombres
   * distintos, no la lista completa.
   */
  adsWithoutCode: string[];
  /**
   * Cuantos son en realidad. Va aparte porque la muestra va deduplicada y
   * cortada a 20: sin este numero, una cuenta con 19 anuncios sin codigo
   * reportaba 12 y parecia que 7 se habian enlazado.
   */
  adsWithoutCodeCount: number;
  /** Codigos que no corresponden a ningun creativo (¿archivado? ¿borrado?). */
  unknownCodes: string[];
  error?: string;
};

/**
 * El sync corre con service role: necesita ver todos los creativos y escribir
 * launches sin sesion de usuario (lo dispara un cron).
 */
function serviceClient() {
  return createServiceClient(publicEnv.supabaseUrl, serverEnv.supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });
}

export async function syncClient(clientId: string, range?: DateRange): Promise<SyncReport> {
  const supabase = serviceClient();

  const { data: client } = await supabase
    .from("clients")
    .select("id, name, meta_ad_account_id, created_by")
    .eq("id", clientId)
    .maybeSingle();

  if (!client) throw new Error("Cliente no encontrado.");

  const report: SyncReport = {
    clientId: client.id as string,
    clientName: client.name as string,
    adsFound: 0,
    withMetrics: 0,
    matched: 0,
    launchesWritten: 0,
    range: range ?? null,
    adsWithoutCode: [],
    adsWithoutCodeCount: 0,
    unknownCodes: [],
  };

  if (!client.meta_ad_account_id) {
    report.error = "Este cliente no tiene ad account id.";
    return report;
  }

  // Codigo -> creativo. Se calcula aqui, no se guarda: sale del uuid.
  const { data: creatives } = await supabase
    .from("creatives")
    .select("id, parent_id")
    .eq("client_id", clientId);

  const byCode = new Map<string, string>();
  for (const row of creatives ?? []) {
    // El codigo de una variante resuelve al PADRE. Un par 1:1 + 9:16 es un solo
    // anuncio: si las metricas cayeran en la variante quedarian invisibles,
    // porque el tablero solo dibuja anuncios. Ademas pasa con los anuncios
    // viejos, que traen pegado el codigo de la mitad que hoy es variante.
    const anuncio = (row.parent_id as string | null) ?? (row.id as string);
    byCode.set(adCodeFor(row.id as string), anuncio);
  }

  let ads;
  let insights;
  let moneda: string | null = null;
  try {
    // Los anuncios primero: el endpoint de insights se salta los que no
    // gastaron, y esos tambien hay que enlazar y reportar.
    ads = await fetchAccountAds(client.meta_ad_account_id as string);
    insights = await fetchAccountInsights(client.meta_ad_account_id as string, range);
    moneda = await fetchAccountCurrency(client.meta_ad_account_id as string);
  } catch (error) {
    report.error = (error as Error).message;
    return report;
  }

  report.adsFound = ads.length;
  if (ads.length === 0) {
    report.error =
      "La cuenta no devolvió anuncios. Revisa el ad account id y que el token tenga acceso a esa cuenta.";
    return report;
  }

  const insightsByAd = new Map(insights.map((row) => [row.adId, row]));

  const rows = [];
  for (const ad of ads) {
    const code = extractAdCode(ad.adName);
    if (!code) {
      report.adsWithoutCodeCount += 1;
      if (ad.adName) report.adsWithoutCode.push(ad.adName);
      continue;
    }

    const creativeId = byCode.get(code);
    if (!creativeId) {
      report.unknownCodes.push(code);
      continue;
    }

    report.matched += 1;
    const insight = insightsByAd.get(ad.adId);
    if (insight) report.withMetrics += 1;

    rows.push({
      creative_id: creativeId,
      // El periodo es parte de la llave: dos pulls de rangos distintos son dos
      // lanzamientos del mismo anuncio, no uno que pisa al otro.
      launched_at:
        range?.since ||
        insight?.dateStart ||
        (ad.createdTime ? ad.createdTime.slice(0, 10) : new Date().toISOString().slice(0, 10)),
      ended_at: range?.until ?? insight?.dateStop ?? null,
      platform: "meta",
      campaign_name: ad.campaignName,
      adset_name: ad.adsetName,
      meta_campaign_id: ad.campaignId,
      meta_adset_id: ad.adsetId,
      meta_ad_id: ad.adId,
      spend: insight?.spend ?? null,
      impressions: insight?.impressions ?? null,
      reach: insight?.reach ?? null,
      clicks: insight?.clicks ?? null,
      results: insight?.results ?? null,
      result_type: insight?.resultType ?? null,
      // Lo que Meta dice del anuncio hoy: de aqui sale la columna de pausados.
      ad_status: ad.status,
      // El gasto sin moneda es un numero sin unidad.
      currency: moneda,
      metrics_source: "meta_api" as const,
      metrics_updated_at: new Date().toISOString(),
      created_by: client.created_by as string,
    });
  }

  if (rows.length > 0) {
    // Un ad de Meta es un lanzamiento: la llave es meta_ad_id (indice unico
    // parcial de 0006). Volver a correr el sync actualiza, no duplica.
    const { error } = await supabase
      .from("launches")
      .upsert(rows, { onConflict: "creative_id,meta_ad_id,launched_at,ended_at" });

    if (error) {
      report.error = `No se pudieron escribir los lanzamientos: ${error.message}`;
      return report;
    }
    report.launchesWritten = rows.length;
  }

  await supabase
    .from("clients")
    .update({
      meta_synced_at: new Date().toISOString(),
      ...(moneda ? { meta_currency: moneda } : {}),
    })
    .eq("id", clientId);

  // Listas largas no sirven de nada en la UI.
  report.adsWithoutCode = [...new Set(report.adsWithoutCode)].slice(0, 20);
  report.unknownCodes = [...new Set(report.unknownCodes)].slice(0, 20);

  return report;
}

export async function syncAllClients(range?: DateRange): Promise<SyncReport[]> {
  const supabase = serviceClient();
  const { data: clients } = await supabase
    .from("clients")
    .select("id")
    .is("archived_at", null)
    .not("meta_ad_account_id", "is", null);

  const reports: SyncReport[] = [];
  for (const client of clients ?? []) {
    try {
      reports.push(await syncClient(client.id as string, range));
    } catch (error) {
      reports.push({
        clientId: client.id as string,
        clientName: "",
        adsFound: 0,
        withMetrics: 0,
        matched: 0,
        launchesWritten: 0,
        range: range ?? null,
        adsWithoutCode: [],
        adsWithoutCodeCount: 0,
        unknownCodes: [],
        error: (error as Error).message,
      });
    }
  }
  return reports;
}
