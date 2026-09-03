"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type ClientOption = { id: string; name: string; count: number };

/**
 * El estado activo sale de la ruta actual, no de una prop.
 *
 * Asi el layout no necesita saber en que cliente estas, que es lo que obligaba
 * a montar el shell dentro de cada pagina.
 */
export function SidebarNav({ clients }: { clients: ClientOption[] }) {
  const pathname = usePathname();
  const total = clients.reduce((sum, client) => sum + client.count, 0);

  return (
    <>
      <nav className="space-y-1">
        <SidebarLink href="/" active={pathname === "/"} count={total}>
          Todos los creativos
        </SidebarLink>
        <SidebarLink href="/dashboard" active={pathname.startsWith("/dashboard")}>
          Resumen
        </SidebarLink>
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <p className="flex items-baseline justify-between px-3 pb-2 text-base font-medium">
          Clientes
          <span className="font-mono text-sm text-muted-foreground">{clients.length}</span>
        </p>

        <div className="space-y-0.5">
          {clients.map((client) => (
            <SidebarLink
              key={client.id}
              href={`/client/${client.id}`}
              active={pathname === `/client/${client.id}`}
              count={client.count}
            >
              {client.name}
            </SidebarLink>
          ))}
        </div>
      </div>
    </>
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
      prefetch
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
