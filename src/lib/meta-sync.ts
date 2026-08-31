import "server-only";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { adCodeFor, extractAdCode } from "@/lib/ad-code";
import { fetchAccountInsights } from "@/lib/meta";
import { serverEnv } from "@/lib/env";
import { publicEnv } from "@/lib/env";

export type SyncReport = {
  clientId: string;
  clientName: string;
  adsFound: number;
  matched: number;
  launchesWritten: number;
  /** Anuncios sin el codigo [GK-xxxxxxxx] en el nombre. */
  adsWithoutCode: string[];
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

export async function syncClient(clientId: string): Promise<SyncReport> {
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
    matched: 0,
    launchesWritten: 0,
    adsWithoutCode: [],
    unknownCodes: [],
  };

  if (!client.meta_ad_account_id) {
    report.error = "Este cliente no tiene ad account id.";
    return report;
  }

  // Codigo -> creativo. Se calcula aqui, no se guarda: sale del uuid.
  const { data: creatives } = await supabase
    .from("creatives")
    .select("id")
    .eq("client_id", clientId);

  const byCode = new Map<string, string>();
  for (const row of creatives ?? []) {
    byCode.set(adCodeFor(row.id as string), row.id as string);
  }

  let insights;
  try {
    insights = await fetchAccountInsights(client.meta_ad_account_id as string);
  } catch (error) {
    report.error = (error as Error).message;
    return report;
  }

  report.adsFound = insights.length;

  const rows = [];
  for (const insight of insights) {
    const code = extractAdCode(insight.adName);
    if (!code) {
      if (insight.adName) report.adsWithoutCode.push(insight.adName);
      continue;
    }

    const creativeId = byCode.get(code);
    if (!creativeId) {
      report.unknownCodes.push(code);
      continue;
    }

    report.matched += 1;
    rows.push({
      creative_id: creativeId,
      launched_at: insight.dateStart || new Date().toISOString().slice(0, 10),
      ended_at: null,
      platform: "meta",
      campaign_name: insight.campaignName,
      adset_name: insight.adsetName,
      meta_campaign_id: insight.campaignId,
      meta_adset_id: insight.adsetId,
      meta_ad_id: insight.adId,
      spend: insight.spend,
      impressions: insight.impressions,
      reach: insight.reach,
      clicks: insight.clicks,
      results: insight.results,
      result_type: insight.resultType,
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
      .upsert(rows, { onConflict: "meta_ad_id" });

    if (error) {
      report.error = `No se pudieron escribir los lanzamientos: ${error.message}`;
      return report;
    }
    report.launchesWritten = rows.length;
  }

  await supabase
    .from("clients")
    .update({ meta_synced_at: new Date().toISOString() })
    .eq("id", clientId);

  // Listas largas no sirven de nada en la UI.
  report.adsWithoutCode = [...new Set(report.adsWithoutCode)].slice(0, 20);
  report.unknownCodes = [...new Set(report.unknownCodes)].slice(0, 20);

  return report;
}

export async function syncAllClients(): Promise<SyncReport[]> {
  const supabase = serviceClient();
  const { data: clients } = await supabase
    .from("clients")
    .select("id")
    .is("archived_at", null)
    .not("meta_ad_account_id", "is", null);

  const reports: SyncReport[] = [];
  for (const client of clients ?? []) {
    try {
      reports.push(await syncClient(client.id as string));
    } catch (error) {
      reports.push({
        clientId: client.id as string,
        clientName: "",
        adsFound: 0,
        matched: 0,
        launchesWritten: 0,
        adsWithoutCode: [],
        unknownCodes: [],
        error: (error as Error).message,
      });
    }
  }
  return reports;
}
