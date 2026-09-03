import Link from "next/link";
import { logout } from "@/app/login/actions";
import { MobileNav } from "@/components/mobile-nav";
import { MobileTabBar } from "@/components/mobile-tabbar";
import { NewBriefButton } from "@/components/new-brief-button";
import { NewClientForm } from "@/components/new-client-form";
import { SidebarNav, type ClientOption } from "@/components/sidebar-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { roleLabel } from "@/lib/roles";
import type { Profile } from "@/lib/supabase/server";

/** Paneles flotantes. Vive en el layout: persiste entre navegaciones. */
export function AppShell({
  profile,
  email,
  clients,
  children,
}: {
  profile: Profile | null;
  email: string;
  clients: ClientOption[];
  children: React.ReactNode;
}) {
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
                {roleLabel(profile?.role)}
              </p>
            </div>
          </div>

          <div className="glass flex min-h-0 flex-1 flex-col gap-4 rounded-2xl border p-3">
            <NewBriefButton clients={clients.map(({ id, name }) => ({ id, name }))} />

            <SidebarNav clients={clients} />

            <div className="pt-1">
              <NewClientForm />
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
            <MobileNav clients={clients} />
            <ThemeToggle />
          </div>
          {children}
        </main>
      </div>

      <MobileTabBar />
    </div>
  );
}

export { Link };
