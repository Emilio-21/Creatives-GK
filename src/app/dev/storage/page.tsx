import { StorageHarness } from "./storage-harness";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AppHeader } from "@/components/app-header";
import { createClient, type Profile } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const metadata = { title: "Storage · dev" };

/**
 * Banco de pruebas de la fase 2: valida el ciclo completo desde el navegador,
 * incluyendo el PUT con CORS. No es parte de la app para el equipo.
 */
export default async function DevStoragePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, role, created_at")
    .eq("id", user.id)
    .single();

  return (
    <>
      <AppHeader profile={(data as Profile) ?? null} email={user.email ?? ""} />
      <main className="mx-auto max-w-3xl p-6">
        <Card>
          <CardHeader>
            <CardTitle>Prueba de storage (fase 2)</CardTitle>
            <CardDescription>
              Sube un archivo, míralo, descárgalo y bórralo. Si el PUT falla aquí, falla el
              upload de la fase 3.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <StorageHarness />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
