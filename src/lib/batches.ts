import "server-only";
import { createClient } from "@/lib/supabase/server";

export type BatchRecord = {
  id: string;
  client_id: string;
  name: string;
  notes: string | null;
  created_by: string;
  created_at: string;
  archived_at: string | null;
};

export async function getBatches(clientId: string): Promise<BatchRecord[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("batches")
    .select("*")
    .eq("client_id", clientId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  return (data ?? []) as BatchRecord[];
}
