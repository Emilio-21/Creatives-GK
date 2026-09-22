import { redirect } from "next/navigation";
import { TeamBoard } from "@/components/team-board";
import { listMembers } from "@/app/(app)/team-actions";
import { getClientsWithCounts } from "@/lib/clients";
import { createClient } from "@/lib/supabase/server";

export default async function EquipoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const [members, clients, { data: org }] = await Promise.all([
    listMembers(),
    getClientsWithCounts(),
    supabase.from("orgs").select("name").maybeSingle(),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">{(org?.name as string) ?? "Equipo"}</h1>
        <p className="text-sm text-muted-foreground">
          {members.length} persona{members.length === 1 ? "" : "s"} · el rol decide a quién
          le llegan los avisos
        </p>
      </div>

      <TeamBoard
        members={members}
        clients={clients.map((client) => ({ id: client.id, name: client.name }))}
        isAdmin={profile?.role === "admin"}
      />
    </div>
  );
}
