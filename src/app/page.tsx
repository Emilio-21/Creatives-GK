import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { CreativeCard } from "@/components/creative-card";
import { LibraryFilters } from "@/components/library-filters";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getFilterOptions, getLibrary, type LibraryFilters as Filters } from "@/lib/creatives";
import { createClient, type Profile } from "@/lib/supabase/server";

export const metadata = { title: "Biblioteca · Creativos" };

type SearchParams = Record<string, string | string[] | undefined>;

function one(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  const text = Array.isArray(value) ? value[0] : value;
  return text && text.length > 0 ? text : undefined;
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const filters: Filters = {
    q: one(params, "q"),
    client: one(params, "client"),
    format: one(params, "format"),
    tag: one(params, "tag"),
    uploadedBy: one(params, "uploadedBy"),
    status: one(params, "status") as Filters["status"],
    sort: one(params, "sort") as Filters["sort"],
    page: Number(one(params, "page") ?? 1),
  };
  const view = one(params, "view") === "tabla" ? "tabla" : "grid";

  const [{ data: profile }, options, library] = await Promise.all([
    supabase.from("profiles").select("id, full_name, role, created_at").eq("id", user.id).single(),
    getFilterOptions(),
    getLibrary(filters),
  ]);

  const queryFor = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...params, ...patch })) {
      const text = Array.isArray(value) ? value[0] : value;
      if (text) next.set(key, text);
    }
    const query = next.toString();
    return query ? `/?${query}` : "/";
  };

  return (
    <>
      <AppHeader profile={(profile as Profile) ?? null} email={user.email ?? ""} />
      <main className="mx-auto max-w-6xl space-y-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Biblioteca</h1>
            <p className="text-sm text-muted-foreground">
              {library.total} creativo{library.total === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={queryFor({ view: view === "grid" ? "tabla" : undefined })}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              {view === "grid" ? "Ver tabla" : "Ver grid"}
            </Link>
            <Link href="/upload" className={buttonVariants({ size: "sm" })}>
              Subir
            </Link>
          </div>
        </div>

        <LibraryFilters
          options={options}
          current={{
            q: filters.q,
            client: filters.client,
            format: filters.format,
            tag: filters.tag,
            uploadedBy: filters.uploadedBy,
            status: filters.status,
            sort: filters.sort,
            view: view === "tabla" ? "tabla" : undefined,
          }}
        />

        {library.cards.length === 0 ? (
          <EmptyState hasFilters={Object.values(filters).some(Boolean)} />
        ) : view === "grid" ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {library.cards.map((creative) => (
              <CreativeCard key={creative.id} creative={creative} />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Formato</TableHead>
                  <TableHead>Subido por</TableHead>
                  <TableHead className="text-right">Peso</TableHead>
                  <TableHead className="text-right">Subido</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {library.cards.map((creative) => (
                  <TableRow key={creative.id}>
                    <TableCell className="max-w-xs truncate font-medium">
                      <Link href={`/creative/${creative.id}`} className="hover:underline">
                        {creative.display_name}
                      </Link>
                    </TableCell>
                    <TableCell>{creative.client ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={creative.stats?.is_published ? "default" : "secondary"}>
                        {creative.stats?.is_published ? "En circulación" : "Sin lanzar"}
                      </Badge>
                    </TableCell>
                    <TableCell>{creative.format ?? "—"}</TableCell>
                    <TableCell>{creative.uploaderName ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {(creative.file_size / 1024 / 1024).toFixed(1)} MB
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {new Date(creative.created_at).toLocaleDateString("es-MX")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {library.pageCount > 1 ? (
          <div className="flex items-center justify-center gap-3 text-sm">
            {library.page > 1 ? (
              <Link
                href={queryFor({ page: String(library.page - 1) })}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Anterior
              </Link>
            ) : null}
            <span className="text-muted-foreground">
              {library.page} de {library.pageCount}
            </span>
            {library.page < library.pageCount ? (
              <Link
                href={queryFor({ page: String(library.page + 1) })}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Siguiente
              </Link>
            ) : null}
          </div>
        ) : null}
      </main>
    </>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="rounded-lg border border-dashed p-12 text-center">
      <p className="text-sm font-medium">
        {hasFilters ? "Ningún creativo con esos filtros." : "Todavía no hay creativos."}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {hasFilters ? "Prueba quitando alguno." : "Sube el primero para arrancar la biblioteca."}
      </p>
      {!hasFilters ? (
        <Link href="/upload" className={`${buttonVariants({ size: "sm" })} mt-4`}>
          Subir creativos
        </Link>
      ) : null}
    </div>
  );
}
