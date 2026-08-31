import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient, type Profile } from "@/lib/supabase/server";
import { UploadDropzone } from "./upload-dropzone";

export const metadata = { title: "Subir · Creativos" };

export default async function UploadPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: rows }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, role, created_at").eq("id", user.id).single(),
    supabase.from("creatives").select("client").not("client", "is", null),
  ]);

  const knownClients = [
    ...new Set((rows ?? []).map((row) => row.client as string)),
  ].sort();

  return (
    <>
      <AppHeader profile={(profile as Profile) ?? null} email={user.email ?? ""} />
      <main className="mx-auto max-w-4xl p-6">
        <Card>
          <CardHeader>
            <CardTitle>Subir creativos</CardTitle>
            <CardDescription>
              Los archivos van directo a R2 sin pasar por el servidor. Las dimensiones, la
              duración y el poster de los videos se sacan aquí en el navegador.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <UploadDropzone knownClients={knownClients} />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
