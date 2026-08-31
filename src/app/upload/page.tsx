import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getClientsWithCounts } from "@/lib/clients";
import { createClient, type Profile } from "@/lib/supabase/server";
import { UploadDropzone } from "./upload-dropzone";

export const metadata = { title: "Subir · Creativos" };

export default async function UploadPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, clients, { client: preselected }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, role, created_at").eq("id", user.id).single(),
    getClientsWithCounts(),
    searchParams,
  ]);

  const options = clients.map((client) => ({ id: client.id, name: client.name }));
  const defaultClientId = options.some((option) => option.id === preselected)
    ? preselected
    : undefined;

  return (
    <AppShell
      profile={(profile as Profile) ?? null}
      email={user.email ?? ""}
      activeClientId={defaultClientId}
    >
      <Card className="mx-auto max-w-3xl">
        <CardHeader>
          <CardTitle>Subir creativos</CardTitle>
          <CardDescription>
            Los archivos van directo a R2 sin pasar por el servidor. Las dimensiones, la
            duración y el poster de los videos se sacan aquí en el navegador.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UploadDropzone clients={options} defaultClientId={defaultClientId} />
        </CardContent>
      </Card>
    </AppShell>
  );
}
