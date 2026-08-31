import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { LibraryView, readViewParams } from "@/components/library-view";
import { createClient, type Profile } from "@/lib/supabase/server";

export const metadata = { title: "Biblioteca · Creativos" };

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role, created_at")
    .eq("id", user.id)
    .single();

  const params = readViewParams(await searchParams);

  return (
    <AppShell profile={(profile as Profile) ?? null} email={user.email ?? ""}>
      <LibraryView basePath="/" params={params} title="Todos los creativos" />
    </AppShell>
  );
}
