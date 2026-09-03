import { notFound, redirect } from "next/navigation";
import { LibraryView, readViewParams } from "@/components/library-view";
import { ClientMenu } from "@/components/client-menu";
import { ClientInsights } from "@/components/client-insights";
import { MetaButtons } from "@/components/meta-buttons";
import { ClientKpis } from "@/components/client-kpis";
import { BriefsSection } from "@/components/briefs-section";
import { getClientOverview } from "@/lib/dashboard";
import { getClient } from "@/lib/clients";
import { createClient } from "@/lib/supabase/server";

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

  const client = await getClient(id);

  if (!client || client.archived_at) notFound();

  const overview = await getClientOverview(client.id);

  const view = readViewParams(await searchParams);

  return (
      <div className="space-y-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-3xl font-semibold">{client.name}</h1>
            <p className="mt-1 flex flex-wrap gap-x-4 text-sm text-muted-foreground">
              <span>{overview.kpis.total} creativos</span>
              <span>{overview.kpis.unlaunched} sin lanzar</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <ClientMenu id={client.id} name={client.name} />
            <MetaButtons
              clientId={client.id}
              adAccountId={client.meta_ad_account_id}
              syncedAt={client.meta_synced_at}
            />
          </div>
        </header>

        <ClientKpis stats={overview.kpis} monthSpend={overview.kpis.monthSpend} />

        <BriefsSection clientId={client.id} clientName={client.name} />

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
  );
}
