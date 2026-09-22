import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getClientsWithCounts } from "@/lib/clients";
import { myClientIds } from "@/app/(app)/team-actions";
import { createClient, type Profile } from "@/lib/supabase/server";

/**
 * El shell vive aqui y no dentro de cada pagina.
 *
 * Antes se re-montaba en cada navegacion: cambiar de cliente reemplazaba la
 * pantalla entera, sidebar incluido, y se sentia como recargar. Como layout,
 * React lo conserva y solo cambia el contenido.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, clients, misClientes] = await Promise.all([
    supabase.from("profiles").select("id, full_name, role, created_at").eq("id", user.id).single(),
    getClientsWithCounts(),
    myClientIds(),
  ]);

  // Filtro de vista, no permiso: sin clientes asignados se ven todos. Asi la
  // app sigue sirviendo aunque nadie se acuerde de repartir.
  const visibles =
    misClientes.length > 0
      ? clients.filter((client) => misClientes.includes(client.id))
      : clients;

  return (
    <AppShell
      profile={(profile as Profile) ?? null}
      email={user.email ?? ""}
      clients={visibles.map((client) => ({
        id: client.id,
        name: client.name,
        count: client.creativeCount,
      }))}
      filtrandoClientes={misClientes.length > 0 && visibles.length < clients.length}
      totalClientes={clients.length}
    >
      {children}
    </AppShell>
  );
}
