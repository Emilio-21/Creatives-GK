import { redirect } from "next/navigation";
import { ProfileEditor } from "@/components/profile-editor";
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
    .select("role, background")
    .eq("id", user.id)
    .maybeSingle();

  const [members, clients, { data: org }] = await Promise.all([
    listMembers(),
    getClientsWithCounts(),
    supabase.from("orgs").select("name").maybeSingle(),
  ]);

  const yo = members.find((member) => member.isMe);

  return (
    <div className="space-y-5">
      {/* Arriba, porque la tarjeta del usuario en la barra lateral trae aqui. */}
      {yo ? (
        <ProfileEditor
          name={yo.name}
          avatarUrl={yo.avatarUrl}
          background={(profile?.background as string | null) ?? null}
        />
      ) : null}

      <div>
        <h1 className="font-heading font-extralight tracking-tight text-3xl">{(org?.name as string) ?? "Equipo"}</h1>
        <p className="text-sm text-muted-foreground">
          {members.length} persona{members.length === 1 ? "" : "s"} · los avisos le llegan a
          quien elijas en cada etapa de la tarea
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
