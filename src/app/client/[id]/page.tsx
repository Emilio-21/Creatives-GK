import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { LibraryView, readViewParams } from "@/components/library-view";
import { ClientMenu } from "@/components/client-menu";
import { getClient } from "@/lib/clients";
import { createClient, type Profile } from "@/lib/supabase/server";

export default async function ClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, client] = await Promise.all([
    supabase.from("profiles").select("id, full_name, role, created_at").eq("id", user.id).single(),
    getClient(id),
  ]);

  if (!client || client.archived_at) notFound();

  const view = readViewParams(await searchParams);

  return (
    <AppShell
      profile={(profile as Profile) ?? null}
      email={user.email ?? ""}
      activeClientId={client.id}
    >
      <LibraryView
        basePath={`/client/${client.id}`}
        clientId={client.id}
        params={view}
        title={client.name}
        headerExtra={<ClientMenu id={client.id} name={client.name} />}
      />
    </AppShell>
  );
}
