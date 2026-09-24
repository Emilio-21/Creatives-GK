import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getClientsWithCounts } from "@/lib/clients";
import { myClientIds } from "@/app/(app)/team-actions";
import { myTaskCount } from "@/app/(app)/client/assignment-actions";
import { getPreviewUrl } from "@/lib/storage";
import { createClient, type Profile } from "@/lib/supabase/server";

/**
 * El shell vive aqui y no dentro de cada pagina.
 *
 * Antes se re-montaba en cada navegacion: cambiar de cliente reemplazaba la
 * pantalla entera, sidebar incluido, y se sentia como recargar. Como layout,
 * React lo conserva y solo cambia el contenido.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: profile },
    clients,
    misClientes,
    { data: org },
    { count: equipo },
    pendientes,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, role, created_at, avatar_path")
      .eq("id", user.id)
      .single(),
    getClientsWithCounts(),
    myClientIds(),
    // Las policies ya limitan a la organizacion propia: no hace falta filtrar.
    supabase.from("orgs").select("name").maybeSingle(),
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    myTaskCount(),
  ]);

  const avatarPath = (profile?.avatar_path as string | null | undefined) ?? null;
  const avatarUrl = avatarPath ? await getPreviewUrl(avatarPath) : null;

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
      orgName={(org?.name as string | undefined) ?? null}
      teamSize={equipo ?? 0}
      taskCount={pendientes}
      avatarUrl={avatarUrl}
      clients={visibles.map((client) => ({
        id: client.id,
        name: client.name,
        count: client.creativeCount,
      }))}
      filtrandoClientes={
        misClientes.length > 0 && visibles.length < clients.length
      }
      totalClientes={clients.length}
    >
      {children}
    </AppShell>
  );
}
