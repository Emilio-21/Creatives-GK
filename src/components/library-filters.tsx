import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Options = {
  clients: string[];
  formats: string[];
  tags: string[];
  uploaders: { id: string; name: string }[];
};

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/**
 * Form GET nativo: los filtros viven en la URL, asi que se pueden compartir y
 * el boton de atras funciona. Sin JS de cliente.
 */
export function LibraryFilters({
  options,
  current,
}: {
  options: Options;
  current: Record<string, string | undefined>;
}) {
  return (
    <form method="get" action="/" className="grid gap-3 md:grid-cols-6">
      {current.view ? <input type="hidden" name="view" value={current.view} /> : null}

      <div className="md:col-span-2">
        <Input name="q" defaultValue={current.q ?? ""} placeholder="Buscar por nombre…" />
      </div>

      <select name="client" defaultValue={current.client ?? ""} className={selectClass}>
        <option value="">Todos los clientes</option>
        {options.clients.map((client) => (
          <option key={client} value={client}>
            {client}
          </option>
        ))}
      </select>

      <select name="status" defaultValue={current.status ?? ""} className={selectClass}>
        <option value="">Cualquier estado</option>
        <option value="sin-lanzar">Sin lanzar</option>
        <option value="lanzados">En circulación</option>
      </select>

      <select name="format" defaultValue={current.format ?? ""} className={selectClass}>
        <option value="">Todos los formatos</option>
        {options.formats.map((format) => (
          <option key={format} value={format}>
            {format}
          </option>
        ))}
      </select>

      <select name="tag" defaultValue={current.tag ?? ""} className={selectClass}>
        <option value="">Todos los tags</option>
        {options.tags.map((tag) => (
          <option key={tag} value={tag}>
            {tag}
          </option>
        ))}
      </select>

      <select name="uploadedBy" defaultValue={current.uploadedBy ?? ""} className={selectClass}>
        <option value="">Cualquiera</option>
        {options.uploaders.map((uploader) => (
          <option key={uploader.id} value={uploader.id}>
            {uploader.name}
          </option>
        ))}
      </select>

      <select name="sort" defaultValue={current.sort ?? "recientes"} className={selectClass}>
        <option value="recientes">Más recientes</option>
        <option value="antiguos">Más antiguos</option>
        <option value="nombre">Nombre</option>
      </select>

      <div className="flex gap-2 md:col-span-2">
        <Button type="submit" size="sm">
          Filtrar
        </Button>
        <Link href="/" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          Limpiar
        </Link>
      </div>
    </form>
  );
}
