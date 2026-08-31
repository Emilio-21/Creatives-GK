import Link from "next/link";
import { LibraryResults } from "@/components/library-results";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getLibrary, type LibraryFilters } from "@/lib/creatives";

export type ViewParams = {
  q?: string;
  sort?: LibraryFilters["sort"];
  onlyUnlaunched: boolean;
  view: "grid" | "tabla";
  page: number;
};

const selectClass =
  "h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export async function LibraryView({
  basePath,
  clientId,
  params,
  title,
  subtitle,
  headerExtra,
  headingLevel = "h1",
}: {
  basePath: string;
  clientId?: string;
  params: ViewParams;
  title: string;
  subtitle?: string;
  headerExtra?: React.ReactNode;
  /** h2 cuando la pagina ya tiene su propio h1 encima. */
  headingLevel?: "h1" | "h2";
}) {
  const library = await getLibrary({
    clientId,
    q: params.q,
    onlyUnlaunched: params.onlyUnlaunched,
    sort: params.sort,
    page: params.page,
  });

  const linkTo = (patch: Record<string, string | undefined>) => {
    const query = new URLSearchParams();
    const base: Record<string, string | undefined> = {
      q: params.q,
      sort: params.sort === "recientes" ? undefined : params.sort,
      sinLanzar: params.onlyUnlaunched ? "1" : undefined,
      view: params.view === "tabla" ? "tabla" : undefined,
      page: params.page > 1 ? String(params.page) : undefined,
    };
    for (const [key, value] of Object.entries({ ...base, ...patch })) {
      if (value) query.set(key, value);
    }
    const search = query.toString();
    return search ? `${basePath}?${search}` : basePath;
  };

  const uploadHref = clientId ? `/upload?client=${clientId}` : "/upload";
  const Heading = headingLevel;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Heading className={headingLevel === "h1" ? "truncate text-xl font-semibold" : "truncate text-base font-semibold"}>
            {title}
          </Heading>
          <p className="text-sm text-muted-foreground">
            {subtitle ??
              `${library.total} creativo${library.total === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {headerExtra}
          <Link href={uploadHref} className={buttonVariants({ size: "sm" })}>
            Subir
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <form method="get" action={basePath} className="flex gap-2">
          {params.onlyUnlaunched ? <input type="hidden" name="sinLanzar" value="1" /> : null}
          {params.view === "tabla" ? <input type="hidden" name="view" value="tabla" /> : null}
          <Input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Buscar por nombre…"
            className="h-9 w-56"
          />
          <select name="sort" defaultValue={params.sort ?? "recientes"} className={selectClass}>
            <option value="recientes">Más recientes</option>
            <option value="antiguos">Más antiguos</option>
            <option value="nombre">Nombre</option>
            <option value="gasto">Más gasto</option>
            <option value="ctr">Mejor CTR</option>
            <option value="cpa">Mejor CPA</option>
          </select>
          <button type="submit" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Buscar
          </button>
        </form>

        <Link
          href={linkTo({ sinLanzar: params.onlyUnlaunched ? undefined : "1", page: undefined })}
          className={buttonVariants({
            variant: params.onlyUnlaunched ? "default" : "outline",
            size: "sm",
          })}
        >
          Sin lanzar
        </Link>

        <Link
          href={linkTo({ view: params.view === "grid" ? "tabla" : undefined })}
          className={`${buttonVariants({ variant: "ghost", size: "sm" })} ml-auto`}
        >
          {params.view === "grid" ? "Ver tabla" : "Ver grid"}
        </Link>
      </div>

      {library.cards.length === 0 ? (
        <EmptyState
          filtered={Boolean(params.q || params.onlyUnlaunched)}
          uploadHref={uploadHref}
        />
      ) : (
        <LibraryResults
          cards={library.cards}
          view={params.view}
          zipBaseName={slug(title)}
        />
      )}

      {library.pageCount > 1 ? (
        <div className="flex items-center justify-center gap-3 text-sm">
          {library.page > 1 ? (
            <Link
              href={linkTo({ page: String(library.page - 1) })}
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
              href={linkTo({ page: String(library.page + 1) })}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Siguiente
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function EmptyState({ filtered, uploadHref }: { filtered: boolean; uploadHref: string }) {
  return (
    <div className="rounded-lg border border-dashed p-12 text-center">
      <p className="text-sm font-medium">
        {filtered ? "Nada con esa búsqueda." : "Todavía no hay creativos aquí."}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {filtered ? "Prueba con otro nombre o quita el filtro." : "Sube el primero."}
      </p>
      {!filtered ? (
        <Link href={uploadHref} className={`${buttonVariants({ size: "sm" })} mt-4`}>
          Subir creativos
        </Link>
      ) : null}
    </div>
  );
}

/** Lee los searchParams de la vista de biblioteca. */
export function readViewParams(params: Record<string, string | string[] | undefined>): ViewParams {
  const one = (key: string) => {
    const value = params[key];
    const text = Array.isArray(value) ? value[0] : value;
    return text && text.length > 0 ? text : undefined;
  };
  const sort = one("sort");
  const validSorts = ["antiguos", "nombre", "gasto", "ctr", "cpa"] as const;
  return {
    q: one("q"),
    sort: validSorts.includes(sort as (typeof validSorts)[number])
      ? (sort as ViewParams["sort"])
      : "recientes",
    onlyUnlaunched: one("sinLanzar") === "1",
    view: one("view") === "tabla" ? "tabla" : "grid",
    page: Math.max(1, Number(one("page") ?? 1) || 1),
  };
}

/** Nombre de archivo del zip a partir del titulo de la vista. */
function slug(text: string): string {
  return (
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "creativos"
  );
}
