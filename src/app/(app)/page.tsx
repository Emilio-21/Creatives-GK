import { redirect } from "next/navigation";
import { LibraryView, readViewParams } from "@/components/library-view";
import { createClient } from "@/lib/supabase/server";

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


  const params = readViewParams(await searchParams);

  return (
      <LibraryView basePath="/" params={params} title="Todos los creativos" />
  );
}
