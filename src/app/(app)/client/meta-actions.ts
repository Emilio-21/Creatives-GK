"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { syncClient } from "@/lib/meta-sync";
import type { SyncReport } from "@/lib/meta-sync";

/** Solo el id de la cuenta publicitaria. El token nunca toca la base. */
export async function setMetaAdAccount(clientId: string, adAccountId: string): Promise<void> {
  await requireUser();

  const value = adAccountId.trim();
  if (value && !/^(act_)?\d{6,20}$/.test(value)) {
    throw new Error("El ad account id son solo dígitos, con o sin el prefijo act_.");
  }

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("clients")
    .update({ meta_ad_account_id: value || null }, { count: "exact" })
    .eq("id", clientId);

  if (error) throw new Error(error.message);
  if (!count) throw new Error("Solo quien creó el cliente o un admin puede editarlo.");

  revalidatePath("/", "layout");
}

export async function syncClientNow(
  clientId: string,
  range?: { since: string; until: string },
): Promise<SyncReport> {
  await requireUser();

  if (range) {
    if (!range.since || !range.until) throw new Error("Elige las dos fechas.");
    if (range.until < range.since) throw new Error("La fecha final va después de la inicial.");
  }

  const report = await syncClient(clientId, range);
  revalidatePath("/", "layout");
  return report;
}
