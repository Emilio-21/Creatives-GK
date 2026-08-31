import Link from "next/link";
import { logout } from "@/app/login/actions";
import { MobileNav } from "@/components/mobile-nav";
import { MobileTabBar } from "@/components/mobile-tabbar";
import { ThemeToggle } from "@/components/theme-toggle";
import { NewClientForm } from "@/components/new-client-form";
import { Button } from "@/components/ui/button";
import { getClientsWithCounts } from "@/lib/clients";
import type { Profile } from "@/lib/supabase/server";

/**
 * Shell de la app: header + sidebar de clientes.
 *
 * La biblioteca se navega por cliente, no con una barra de filtros: con ~250
 * archivos lo util es "abrir PLG y ver que hay", no cruzar seis facetas.
 */
export async function AppShell({
  profile,
  email,
  activeClientId,
  activeSection,
  children,
}: {
  profile: Profile | null;
  email: string;
  activeClientId?: string | null;
  activeSection?: "biblioteca" | "dashboard";
  children: React.ReactNode;
}) {
  const clients = await getClientsWithCounts();
  const name = profile?.full_name ?? email;

  return (
    <div className="min-h-svh">
      <header className="glass sticky top-0 z-30 border-b">
        <div className="flex h-14 items-center gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary font-mono text-xs text-primary-foreground">
              GK
            </span>
            Creativos
          </Link>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-muted-foreground sm:inline">
              {name}
              {profile?.role === "admin" ? " · admin" : ""}
            </span>
            <ThemeToggle />
            <form action={logout}>
              <Button type="submit" variant="outline" size="sm">
                Salir
              </Button>
            </form>
          </div>
        </div>
      </header>

      <div className="flex">
        <aside className="glass sticky top-14 hidden h-[calc(100svh-3.5rem)] w-60 shrink-0 overflow-y-auto border-r p-3 md:block">
          <nav className="space-y-1">
            <SidebarLink
              href="/"
              count={clients.reduce((sum, client) => sum + client.creativeCount, 0)}
              active={
                activeSection !== "dashboard" &&
                (activeClientId === undefined || activeClientId === null)
              }
            >
              Todos los creativos
            </SidebarLink>
            <SidebarLink href="/dashboard" active={activeSection === "dashboard"}>
              Resumen
            </SidebarLink>
          </nav>

          <div className="mt-5 space-y-1">
            <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Clientes
            </p>

            {clients.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                Todavía no hay clientes.
              </p>
            ) : (
              clients.map((client) => (
                <SidebarLink
                  key={client.id}
                  href={`/client/${client.id}`}
                  active={activeClientId === client.id}
                  count={client.creativeCount}
                >
                  {client.name}
                </SidebarLink>
              ))
            )}

            <div className="pt-1">
              <NewClientForm />
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 space-y-4 p-4 pb-20 sm:p-6 md:pb-6">
          <MobileNav
            clients={clients.map((client) => ({
              id: client.id,
              name: client.name,
              count: client.creativeCount,
            }))}
            activeClientId={activeClientId}
            activeSection={activeSection}
          />
          {children}
        </main>
      </div>

      <MobileTabBar />
    </div>
  );
}

function SidebarLink({
  href,
  active,
  count,
  children,
}: {
  href: string;
  active: boolean;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${
        active ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60"
      }`}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {count !== undefined ? (
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{count}</span>
      ) : null}
    </Link>
  );
}
