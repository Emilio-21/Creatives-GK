import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { createClient, type Profile } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // El middleware ya redirige, esto es el cinturon por si el matcher cambia.
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, role, created_at")
    .eq("id", user.id)
    .single();
  const profile = (data as Profile) ?? null;

  return (
    <>
      <AppHeader profile={profile} email={user.email ?? ""} />
      <main className="mx-auto max-w-6xl p-6">
        <Card>
          <CardHeader>
            <CardTitle>Biblioteca</CardTitle>
            <CardDescription>
              Auth listo. El grid de creativos llega en la fase 3.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <dl className="grid gap-1">
              <div className="flex gap-2">
                <dt className="w-28">Usuario</dt>
                <dd className="font-mono">{user.email}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-28">Profile</dt>
                <dd className="font-mono">
                  {profile ? `${profile.id} · ${profile.role}` : "sin profile (revisa el trigger 0003)"}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
