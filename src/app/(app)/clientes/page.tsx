import Link from "next/link";
import { getClientsWithCounts } from "@/lib/clients";
import { myClientIds } from "@/app/(app)/team-actions";

export const metadata = { title: "Clientes · Relevo" };

/**
 * La entrada a los creativos: se consultan por cliente, no todos revueltos. En
 * escritorio la lista vive en la barra lateral; esta pagina es la de celular.
 */
export default async function ClientesPage() {
  const [clients, mios] = await Promise.all([getClientsWithCounts(), myClientIds()]);
  // Mismo filtro de vista que la barra lateral: sin clientes asignados, todos.
  const visibles = mios.length > 0 ? clients.filter((c) => mios.includes(c.id)) : clients;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-3xl font-extralight tracking-tight">Clientes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {visibles.length} cliente{visibles.length === 1 ? "" : "s"}
        </p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {visibles.map((client) => (
          <li key={client.id}>
            <Link
              href={`/client/${client.id}`}
              className="surface flex items-baseline justify-between gap-3 rounded-xl border p-4 transition-colors hover:border-foreground/30"
            >
              <span className="truncate font-medium">{client.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {client.creativeCount} creativo{client.creativeCount === 1 ? "" : "s"}
                {client.unlaunchedCount > 0 ? ` · ${client.unlaunchedCount} sin lanzar` : ""}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
