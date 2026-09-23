"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Option = { id: string; name: string; count: number };

/**
 * En movil el sidebar no cabe. En vez de un <select>, una fila de chips que se
 * desplaza: se ve a que cliente estas entrando y cuantos creativos tiene sin
 * abrir nada.
 *
 * Solo dentro de Creativos (la biblioteca y cada cliente). En el resto de las
 * pantallas era una segunda navegacion encima de la barra de abajo.
 */
export function MobileNav({ clients }: { clients: Option[] }) {
  const pathname = usePathname();
  const total = clients.reduce((sum, client) => sum + client.count, 0);
  const allActive = pathname === "/creativos";

  if (!pathname.startsWith("/creativos") && !pathname.startsWith("/client")) return null;

  return (
    <div className="-ml-4 min-w-0 flex-1 overflow-x-auto pb-1 pl-4 md:hidden">
      <div className="flex w-max gap-2">
        <Chip href="/creativos" active={allActive}>
          Todos · {total}
        </Chip>
        {clients.map((client) => (
          <Chip
            key={client.id}
            href={`/client/${client.id}`}
            active={pathname === `/client/${client.id}`}
          >
            {client.name} {client.count}
          </Chip>
        ))}
      </div>
    </div>
  );
}

function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition-colors ${
        active
          ? "border-primary/40 bg-primary/15 font-medium text-primary"
          : "text-muted-foreground"
      }`}
    >
      {children}
    </Link>
  );
}
