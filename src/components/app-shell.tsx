import Link from "next/link";
import { logout } from "@/app/login/actions";
import { MobileNav } from "@/components/mobile-nav";
import { MobileTabBar } from "@/components/mobile-tabbar";
import { NewBriefButton } from "@/components/new-brief-button";
import { NewClientForm } from "@/components/new-client-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { getClientsWithCounts } from "@/lib/clients";
import type { Profile } from "@/lib/supabase/server";

/**
 * Shell de la app: paneles flotantes sobre el fondo, como el diseño.
 * La navegacion es por cliente, no por filtros.
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
  const name = profile?.full_name ?? email.split("@")[0];

  return (
    <div className="min-h-svh p-3 sm:p-4">
      <div className="app-aura" aria-hidden="true" />

      <div className="flex gap-4">
        <aside className="hidden w-56 shrink-0 flex-col gap-4 md:flex">
          <div className="glass flex items-center gap-3 rounded-2xl border p-3">
            <span className="brand-gradient flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white">
              {name.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {profile?.role === "admin" ? "Admin" : "Media buying"}
              </p>
            </div>
          </div>

          <div className="glass flex min-h-0 flex-1 flex-col gap-4 rounded-2xl border p-3">
            <NewBriefButton
              clients={clients.map((client) => ({ id: client.id, name: client.name }))}
              activeClientId={activeClientId}
            />

            <nav className="space-y-1">
              <SidebarLink
                href="/"
                active={activeSection !== "dashboard" && !activeClientId}
              >
                Todos los creativos
              </SidebarLink>
              <SidebarLink href="/dashboard" active={activeSection === "dashboard"}>
                Resumen
              </SidebarLink>
            </nav>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <p className="flex items-baseline justify-between px-3 pb-2 text-base font-medium">
                Clientes
                <span className="font-mono text-sm text-muted-foreground">
                  {clients.length}
                </span>
              </p>

              <div className="space-y-0.5">
                {clients.map((client) => (
                  <SidebarLink
                    key={client.id}
                    href={`/client/${client.id}`}
                    active={activeClientId === client.id}
                    count={client.creativeCount}
                  >
                    {client.name}
                  </SidebarLink>
                ))}
              </div>

              <div className="pt-1">
                <NewClientForm />
              </div>
            </div>

            <div className="flex items-center gap-2 border-t pt-3">
              <ThemeToggle />
              <form action={logout} className="flex-1">
                <Button type="submit" variant="ghost" size="sm" className="w-full">
                  Salir
                </Button>
              </form>
            </div>
          </div>
        </aside>

        <main className="glass min-w-0 flex-1 rounded-2xl border p-4 pb-20 sm:p-6 md:pb-6">
          <div className="mb-4 flex items-center gap-2 md:hidden">
            <MobileNav
              clients={clients.map((client) => ({
                id: client.id,
                name: client.name,
                count: client.creativeCount,
              }))}
              activeClientId={activeClientId}
              activeSection={activeSection}
            />
            <ThemeToggle />
          </div>
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
      className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors ${
        active ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60"
      }`}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {count !== undefined ? (
        <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
          {count}
        </span>
      ) : null}
    </Link>
  );
}
