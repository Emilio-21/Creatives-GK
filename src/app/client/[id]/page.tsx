import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { LibraryView, readViewParams } from "@/components/library-view";
import { ClientMenu } from "@/components/client-menu";
import { StatsStrip } from "@/components/stats-strip";
import { ClientInsights } from "@/components/client-insights";
import { MetaPanel } from "@/components/meta-panel";
import { getClientOverview } from "@/lib/dashboard";
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

  const overview = await getClientOverview(client.id);

  const view = readViewParams(await searchParams);

  return (
    <AppShell
      profile={(profile as Profile) ?? null}
      email={user.email ?? ""}
      activeClientId={client.id}
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{client.name}</h1>
            <p className="text-sm text-muted-foreground">
              {overview.kpis.total} creativo{overview.kpis.total === 1 ? "" : "s"} ·{" "}
              {overview.kpis.unlaunched} sin lanzar
            </p>
          </div>
          <ClientMenu id={client.id} name={client.name} />
        </div>

        <StatsStrip stats={overview.kpis} monthSpend={overview.kpis.monthSpend} />

        <MetaPanel
          clientId={client.id}
          adAccountId={client.meta_ad_account_id}
          syncedAt={client.meta_synced_at}
        />

        <ClientInsights
          topByCpa={overview.topByCpa}
          topByCtr={overview.topByCtr}
          stale={overview.stale}
          monthly={overview.monthly}
        />

        <LibraryView
          basePath={`/client/${client.id}`}
          clientId={client.id}
          params={view}
          title="Creativos"
          headingLevel="h2"
        />
      </div>
    </AppShell>
  );
}
