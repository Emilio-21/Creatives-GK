import "server-only";
import { createClient } from "@/lib/supabase/server";

export type LaunchRow = {
  id: string;
  creative_id: string;
  launched_at: string;
  ended_at: string | null;
  platform: string;
  campaign_name: string | null;
  adset_name: string | null;
  meta_campaign_id: string | null;
  meta_adset_id: string | null;
  meta_ad_id: string | null;
  spend: number | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  results: number | null;
  result_type: string | null;
  metrics_source: "manual" | "meta_api";
  metrics_updated_at: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
};

export async function getLaunches(creativeId: string): Promise<LaunchRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("launches")
    .select("*")
    .eq("creative_id", creativeId)
    .order("launched_at", { ascending: false });

  return (data ?? []) as LaunchRow[];
}
