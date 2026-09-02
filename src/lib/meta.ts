import "server-only";

/**
 * Cliente minimo de la Graph API. Solo lectura de insights: esta app nunca
 * crea ni modifica anuncios.
 */
const API_VERSION = process.env.META_API_VERSION ?? "v21.0";
const BASE = `https://graph.facebook.com/${API_VERSION}`;

export type MetaAd = {
  adId: string;
  adName: string;
  adsetId: string | null;
  adsetName: string | null;
  campaignId: string | null;
  campaignName: string | null;
  status: string | null;
  createdTime: string | null;
};

export type MetaAdInsight = {
  adId: string;
  adName: string;
  adsetId: string | null;
  adsetName: string | null;
  campaignId: string | null;
  campaignName: string | null;
  spend: number | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  results: number | null;
  resultType: string | null;
  dateStart: string;
  dateStop: string;
};

function token(): string {
  const value = process.env.META_ACCESS_TOKEN;
  if (!value) {
    throw new Error(
      "Falta META_ACCESS_TOKEN. Es un System User token del Business Manager, solo server-side.",
    );
  }
  return value;
}

/** Meta pide el prefijo act_ en el id de la cuenta publicitaria. */
function accountPath(adAccountId: string): string {
  const clean = adAccountId.trim();
  return clean.startsWith("act_") ? clean : `act_${clean}`;
}

type RawAd = {
  id?: string;
  name?: string;
  adset_id?: string;
  campaign_id?: string;
  status?: string;
  effective_status?: string;
  created_time?: string;
  adset?: { name?: string };
  campaign?: { name?: string };
};

/**
 * TODOS los anuncios de la cuenta, con entrega o sin ella.
 *
 * El endpoint de insights solo devuelve anuncios que gastaron en el periodo: un
 * ad recien creado, pausado o en revision no aparece ahi. Para enlazar y para
 * reportar "sin codigo" hace falta la lista completa.
 */
export async function fetchAccountAds(adAccountId: string): Promise<MetaAd[]> {
  const params = new URLSearchParams({
    limit: "200",
    fields: "id,name,adset_id,campaign_id,status,effective_status,created_time,adset{name},campaign{name}",
    access_token: token(),
  });

  const ads: MetaAd[] = [];
  let url = `${BASE}/${accountPath(adAccountId)}/ads?${params.toString()}`;

  for (let page = 0; page < 10 && url; page += 1) {
    const response = await fetch(url, { cache: "no-store" });
    const body = (await response.json()) as {
      data?: RawAd[];
      paging?: { next?: string };
      error?: { message?: string };
    };

    if (!response.ok || body.error) {
      throw new Error(
        `Meta respondió ${response.status} al listar anuncios: ${
          body.error?.message ?? "error desconocido"
        }`,
      );
    }

    for (const row of body.data ?? []) {
      if (!row.id) continue;
      ads.push({
        adId: row.id,
        adName: row.name ?? "",
        adsetId: row.adset_id ?? null,
        adsetName: row.adset?.name ?? null,
        campaignId: row.campaign_id ?? null,
        campaignName: row.campaign?.name ?? null,
        status: row.effective_status ?? row.status ?? null,
        createdTime: row.created_time ?? null,
      });
    }

    url = body.paging?.next ?? "";
  }

  return ads;
}

type RawInsight = {
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  date_start?: string;
  date_stop?: string;
  actions?: { action_type: string; value: string }[];
};

/**
 * Insights a nivel ad de toda la cuenta, en una sola consulta paginada.
 *
 * Se pide asi y no ad por ad porque Vercel Hobby corta a los 60 s: una cuenta
 * con 200 anuncios serian 200 requests.
 */
export type DateRange = { since: string; until: string };

export async function fetchAccountInsights(
  adAccountId: string,
  range?: DateRange,
): Promise<MetaAdInsight[]> {
  const params = new URLSearchParams({
    level: "ad",
    limit: "200",
    fields: [
      "ad_id",
      "ad_name",
      "adset_id",
      "adset_name",
      "campaign_id",
      "campaign_name",
      "spend",
      "impressions",
      "reach",
      "clicks",
      "actions",
      "date_start",
      "date_stop",
    ].join(","),
    access_token: token(),
  });

  // Sin rango, todo el historico disponible. Con rango, exactamente esos dias.
  if (range) params.set("time_range", JSON.stringify(range));
  else params.set("date_preset", "maximum");

  const results: MetaAdInsight[] = [];
  let url = `${BASE}/${accountPath(adAccountId)}/insights?${params.toString()}`;

  // Tope de paginas: sin esto una cuenta enorme se come el timeout.
  for (let page = 0; page < 10 && url; page += 1) {
    const response = await fetch(url, { cache: "no-store" });
    const body = (await response.json()) as {
      data?: RawInsight[];
      paging?: { next?: string };
      error?: { message?: string; code?: number };
    };

    if (!response.ok || body.error) {
      throw new Error(
        `Meta respondió ${response.status}: ${body.error?.message ?? "error desconocido"}`,
      );
    }

    for (const row of body.data ?? []) {
      if (!row.ad_id) continue;
      const result = pickResult(row.actions);
      results.push({
        adId: row.ad_id,
        adName: row.ad_name ?? "",
        adsetId: row.adset_id ?? null,
        adsetName: row.adset_name ?? null,
        campaignId: row.campaign_id ?? null,
        campaignName: row.campaign_name ?? null,
        spend: numberOrNull(row.spend),
        impressions: numberOrNull(row.impressions),
        reach: numberOrNull(row.reach),
        clicks: numberOrNull(row.clicks),
        results: result?.value ?? null,
        resultType: result?.type ?? null,
        dateStart: row.date_start ?? "",
        dateStop: row.date_stop ?? "",
      });
    }

    url = body.paging?.next ?? "";
  }

  return results;
}

/**
 * "Resultados" no es un campo: depende del objetivo de la campaña. Se toma la
 * primera acción de la lista por orden de prioridad.
 */
const RESULT_PRIORITY = [
  "offsite_conversion.fb_pixel_purchase",
  "purchase",
  "offsite_conversion.fb_pixel_lead",
  "lead",
  "onsite_conversion.messaging_conversation_started_7d",
  "landing_page_view",
  "link_click",
];

const RESULT_LABEL: Record<string, string> = {
  "offsite_conversion.fb_pixel_purchase": "purchase",
  purchase: "purchase",
  "offsite_conversion.fb_pixel_lead": "lead",
  lead: "lead",
  "onsite_conversion.messaging_conversation_started_7d": "message",
  landing_page_view: "lpv",
  link_click: "link_click",
};

function pickResult(
  actions: { action_type: string; value: string }[] | undefined,
): { type: string; value: number } | null {
  if (!actions?.length) return null;
  for (const type of RESULT_PRIORITY) {
    const found = actions.find((action) => action.action_type === type);
    if (found) {
      const value = numberOrNull(found.value);
      if (value !== null) return { type: RESULT_LABEL[type] ?? type, value };
    }
  }
  return null;
}

function numberOrNull(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
