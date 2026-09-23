import Link from "next/link";
import { logout } from "@/app/login/actions";
import { MobileNav } from "@/components/mobile-nav";
import { MobileTabBar } from "@/components/mobile-tabbar";
import { NewBriefButton } from "@/components/new-brief-button";
import { NewClientForm } from "@/components/new-client-form";
import { SidebarNav, type ClientOption } from "@/components/sidebar-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationBell } from "@/components/notification-bell";
import { TasksLink } from "@/components/tasks-link";
import { Button } from "@/components/ui/button";
import { roleLabel } from "@/lib/roles";
import type { Profile } from "@/lib/supabase/server";

/** Paneles flotantes. Vive en el layout: persiste entre navegaciones. */
export function AppShell({
  profile,
  email,
  clients,
  children,
  filtrandoClientes,
  totalClientes,
  orgName,
  teamSize,
  taskCount = 0,
}: {
  profile: Profile | null;
  email: string;
  orgName?: string | null;
  teamSize?: number;
  /** Etapas de briefs que tiene esta persona en sus manos. */
  taskCount?: number;
  clients: ClientOption[];
  children: React.ReactNode;
  /** Se está mostrando solo una parte de los clientes de la organización. */
  filtrandoClientes?: boolean;
  totalClientes?: number;
}) {
  const name = profile?.full_name ?? email.split("@")[0];

  return (
    <div className="min-h-svh p-3 sm:p-4">
      <div className="app-aura" aria-hidden="true" />

      <div className="flex gap-4">
        <aside className="hidden w-56 shrink-0 flex-col gap-4 md:flex">
          {/* La tarjeta ES la entrada al equipo. Antes el enlace vivia hasta
              abajo de la barra, detras de la lista de clientes: para llegar
              habia que hacer scroll por algo que no tiene nada que ver. */}
          <Link
            href="/equipo"
            className="glass group flex items-center gap-3 rounded-2xl border p-3 transition-colors hover:border-primary/40"
          >
            <span className="brand-gradient flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white">
              {name.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {roleLabel(profile?.role)}
              </p>
              {orgName ? (
                <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                  <span className="truncate">{orgName}</span>
                  {teamSize ? (
                    <span className="shrink-0 opacity-70">· {teamSize}</span>
                  ) : null}
                </p>
              ) : null}
            </div>
            <svg
              viewBox="0 0 24 24"
              className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
              aria-hidden="true"
            >
              <path
                d="m9 6 6 6-6 6"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>

          <div className="glass flex min-h-0 flex-1 flex-col gap-4 rounded-2xl border p-3">
            <NewBriefButton clients={clients.map(({ id, name }) => ({ id, name }))} />

            {/* Debajo del boton principal y encima de los clientes: es lo
                primero que alguien quiere saber al entrar, y ahi se ve sin
                bajar la vista. */}
            <div className="-my-2 space-y-0.5">
              <NotificationBell variant="row" />
              <TasksLink count={taskCount} />
            </div>

            <SidebarNav clients={clients} />

            {filtrandoClientes ? (
              <p className="px-1 text-[10px] text-muted-foreground">
                Tus clientes ({clients.length} de {totalClientes}).{" "}
                <Link href="/equipo" className="underline hover:text-foreground">
                  Cambiar
                </Link>
              </p>
            ) : null}

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
            <NotificationBell />
          </div>
          {children}
        </main>
      </div>

      <MobileTabBar />
    </div>
  );
}

export { Link };
