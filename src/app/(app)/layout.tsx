import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getClientsWithCounts } from "@/lib/clients";
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

  const [{ data: profile }, clients] = await Promise.all([
    supabase.from("profiles").select("id, full_name, role, created_at").eq("id", user.id).single(),
    getClientsWithCounts(),
  ]);

  return (
    <AppShell
      profile={(profile as Profile) ?? null}
      email={user.email ?? ""}
      clients={clients.map((client) => ({
        id: client.id,
        name: client.name,
        count: client.creativeCount,
      }))}
    >
      {children}
    </AppShell>
  );
}
