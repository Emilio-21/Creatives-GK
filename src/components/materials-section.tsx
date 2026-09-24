"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  addMaterialFile as addMaterialFileAction,
  addMaterialLink as addMaterialLinkAction,
  deleteMaterial as deleteMaterialAction,
  listMaterials as listMaterialsAction,
  openMaterial as openMaterialAction,
  replaceMaterialFile as replaceMaterialFileAction,
  requestMaterialUpload as requestMaterialUploadAction,
  updateMaterial as updateMaterialAction,
  type Material,
} from "@/app/(app)/client/material-actions";
import { unwrapped } from "@/lib/action-result";
import { docLabel } from "@/lib/brief-flow";
import { formatBytes, materialKindLabel, titleFromFileName } from "@/lib/material";
import { uploadToR2 } from "@/lib/upload-xhr";

// Las acciones regresan el error como dato; esto lo vuelve a lanzar con su mensaje real.
const addMaterialFile = unwrapped(addMaterialFileAction);
const addMaterialLink = unwrapped(addMaterialLinkAction);
const deleteMaterial = unwrapped(deleteMaterialAction);
const listMaterials = unwrapped(listMaterialsAction);
const openMaterial = unwrapped(openMaterialAction);
const replaceMaterialFile = unwrapped(replaceMaterialFileAction);
const requestMaterialUpload = unwrapped(requestMaterialUploadAction);
const updateMaterial = unwrapped(updateMaterialAction);

/**
 * Material del cliente que no es un ad: presentaciones, plantillas, guias de
 * marca, links a Canva o Figma. Vive junto a Creativos pero aparte, porque no
 * tiene codigo de ad ni metricas.
 */
export function MaterialsSection({ clientId }: { clientId: string }) {
  const [items, setItems] = useState<Material[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Material | null>(null);

  const reload = () => listMaterials(clientId).then(setItems).catch(() => setItems([]));

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="font-heading text-3xl font-extralight tracking-tight">Material</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Presentaciones, plantillas y archivos que no son ads
            {items && items.length > 0 ? ` · ${items.length}` : ""}
          </p>
        </div>
        <Button size="sm" onClick={() => setAdding(true)}>
          Agregar
        </Button>
      </div>

      {items === null ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : items.length === 0 ? (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="w-full rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
        >
          Sin material todavía. Sube un PDF, una presentación o pega un link.
        </button>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <MaterialCard
              key={item.id}
              item={item}
              onEdit={() => setEditing(item)}
              onChanged={reload}
            />
          ))}
        </ul>
      )}

      {adding ? (
        <AddDialog
          clientId={clientId}
          onClose={() => setAdding(false)}
          onAdded={async () => {
            setAdding(false);
            await reload();
          }}
        />
      ) : null}

      {editing ? (
        <EditDialog
          clientId={clientId}
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reload();
          }}
        />
      ) : null}
    </section>
  );
}

function MaterialCard({
  item,
  onEdit,
  onChanged,
}: {
  item: Material;
  onEdit: () => void;
  onChanged: () => Promise<unknown>;
}) {
  const [pending, startTransition] = useTransition();

  const tipo =
    item.kind === "link" && item.url
      ? docLabel(item.url)
      : materialKindLabel(item.fileName, item.mimeType);
  const detalle = item.kind === "file" ? formatBytes(item.sizeBytes) : "Link";

  // La URL firmada dura minutos: se pide al abrir, no al cargar la lista.
  const abrir = (download = false) => {
    // Descargar no navega (el archivo llega como adjunto): misma pestaña, sin
    // dejar una vacia abierta.
    if (download) {
      openMaterial(item.id, true)
        .then((url) => {
          window.location.href = url;
        })
        .catch((error: Error) => toast.error(error.message));
      return;
    }
    // La ventana se abre antes del await: si se abre despues, Safari la bloquea.
    const win = window.open("about:blank", "_blank");
    // Lo que se abre (un link externo, un archivo) no debe poder tocar esta pestaña.
    if (win) win.opener = null;
    openMaterial(item.id, download)
      .then((url) => {
        if (win) win.location.href = url;
        else window.location.href = url;
      })
      .catch((error: Error) => {
        win?.close();
        toast.error(error.message);
      });
  };

  return (
    <li className="surface group flex flex-col overflow-hidden rounded-xl border">
      <button
        type="button"
        onClick={() => abrir()}
        className="flex flex-1 flex-col text-left"
        title={item.kind === "link" ? item.url ?? "" : item.fileName ?? ""}
      >
        <div className="flex h-28 items-center justify-center border-b bg-muted/30">
          {item.thumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.thumbUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="font-heading text-2xl font-extralight tracking-tight text-muted-foreground">
              {tipo}
            </span>
          )}
        </div>
        <div className="flex-1 p-3">
          <p className="line-clamp-2 text-sm font-medium group-hover:underline">{item.title}</p>
          {item.description ? (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
          ) : null}
        </div>
      </button>

      <div className="flex items-center gap-1 border-t px-3 py-1.5 text-[11px] text-muted-foreground">
        <span className="min-w-0 flex-1 truncate">
          {tipo} · {detalle}
          {item.authorName ? ` · ${item.authorName}` : ""}
        </span>
        {item.kind === "file" ? (
          <button type="button" onClick={() => abrir(true)} className="rounded px-1.5 py-0.5 hover:bg-muted hover:text-foreground">
            Descargar
          </button>
        ) : null}
        <button type="button" onClick={onEdit} className="rounded px-1.5 py-0.5 hover:bg-muted hover:text-foreground">
          Editar
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!window.confirm(`¿Borrar "${item.title}"? No se puede deshacer.`)) return;
            startTransition(async () => {
              try {
                await deleteMaterial(item.id);
                toast.success("Borrado");
                await onChanged();
              } catch (error) {
                toast.error((error as Error).message);
              }
            });
          }}
          className="rounded px-1.5 py-0.5 hover:bg-destructive/10 hover:text-destructive"
        >
          Borrar
        </button>
      </div>
    </li>
  );
}

/** Sube un archivo a R2 con la ruta que firma el servidor. Regresa la ruta. */
async function subir(clientId: string, file: File, onProgress: (p: number) => void) {
  const { path, uploadUrl, contentType } = await requestMaterialUpload(clientId, {
    name: file.name,
    type: file.type,
    size: file.size,
  });
  await uploadToR2(uploadUrl, file, onProgress, contentType).promise;
  return path;
}

function AddDialog({
  clientId,
  onClose,
  onAdded,
}: {
  clientId: string;
  onClose: () => void;
  onAdded: () => Promise<void>;
}) {
  const [modo, setModo] = useState<"file" | "link">("file");
  const [files, setFiles] = useState<File[]>([]);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [progress, setProgress] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  // Varios archivos a la vez: cada uno queda con su nombre como titulo.
  const varios = files.length > 1;

  const guardar = () =>
    startTransition(async () => {
      try {
        if (modo === "link") {
          await addMaterialLink({ clientId, url, title, description });
        } else {
          if (files.length === 0) throw new Error("Elige un archivo.");
          for (const [i, file] of files.entries()) {
            const path = await subir(clientId, file, (p) =>
              setProgress(`${varios ? `${i + 1}/${files.length} · ` : ""}${p}%`),
            );
            await addMaterialFile({
              clientId,
              path,
              fileName: file.name,
              title: varios ? titleFromFileName(file.name) : title || titleFromFileName(file.name),
              description: varios ? "" : description,
            });
          }
        }
        toast.success(varios ? `${files.length} archivos agregados` : "Agregado");
        await onAdded();
      } catch (error) {
        toast.error((error as Error).message);
      } finally {
        setProgress(null);
      }
    });

  return (
    <Dialog title="Agregar material" onClose={onClose} busy={pending}>
      <div role="radiogroup" className="mb-4 flex gap-1.5">
        {(["file", "link"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={modo === m}
            onClick={() => setModo(m)}
            className={`h-8 flex-1 rounded-md border text-sm transition-colors ${
              modo === m ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {m === "file" ? "Archivo" : "Link"}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {modo === "file" ? (
          <div
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              setFiles([...event.dataTransfer.files]);
            }}
            onClick={() => input.current?.click()}
            className="cursor-pointer rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground transition-colors hover:border-foreground/30"
          >
            <input
              ref={input}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => setFiles([...(event.target.files ?? [])])}
            />
            {files.length === 0 ? (
              <>
                Arrastra archivos o haz clic
                <span className="mt-1 block text-xs">PDF, presentaciones, imágenes, plantillas… hasta 250 MB</span>
              </>
            ) : (
              <span className="text-foreground">
                {files.map((f) => f.name).join(", ")}
              </span>
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="material-url">Link</Label>
            <Input
              id="material-url"
              type="url"
              inputMode="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://www.canva.com/design/…"
              autoFocus
            />
          </div>
        )}

        {varios ? (
          <p className="text-xs text-muted-foreground">
            Cada archivo queda con su nombre como título; los editas después.
          </p>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="material-title">Título</Label>
              <Input
                id="material-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={
                  files[0] ? titleFromFileName(files[0].name) : "Presentación de resultados Q3"
                }
                maxLength={140}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="material-desc">Nota (opcional)</Label>
              <Textarea
                id="material-desc"
                rows={2}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Para qué es, cuándo se usa"
              />
            </div>
          </>
        )}
      </div>

      <div className="mt-5 flex items-center justify-end gap-2">
        {progress ? <span className="mr-auto font-mono text-xs text-muted-foreground">Subiendo {progress}</span> : null}
        <Button variant="ghost" disabled={pending} onClick={onClose}>
          Cancelar
        </Button>
        <Button disabled={pending} onClick={guardar}>
          {pending ? "Guardando…" : "Agregar"}
        </Button>
      </div>
    </Dialog>
  );
}

function EditDialog({
  clientId,
  item,
  onClose,
  onSaved,
}: {
  clientId: string;
  item: Material;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description);
  const [url, setUrl] = useState(item.url ?? "");
  const [nuevo, setNuevo] = useState<File | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const guardar = () =>
    startTransition(async () => {
      try {
        await updateMaterial(item.id, {
          title,
          description,
          ...(item.kind === "link" ? { url } : {}),
        });
        if (nuevo) {
          const path = await subir(clientId, nuevo, (p) => setProgress(`${p}%`));
          await replaceMaterialFile(item.id, { path, fileName: nuevo.name });
        }
        toast.success("Guardado");
        await onSaved();
      } catch (error) {
        toast.error((error as Error).message);
      } finally {
        setProgress(null);
      }
    });

  return (
    <Dialog title="Editar material" onClose={onClose} busy={pending}>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="edit-title">Título</Label>
          <Input id="edit-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} />
        </div>
        {item.kind === "link" ? (
          <div className="space-y-1.5">
            <Label htmlFor="edit-url">Link</Label>
            <Input id="edit-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} />
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label>Archivo</Label>
            <div className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {nuevo ? `Nuevo: ${nuevo.name}` : `${item.fileName} · ${formatBytes(item.sizeBytes)}`}
              </span>
              <input
                ref={input}
                type="file"
                className="hidden"
                onChange={(e) => setNuevo(e.target.files?.[0] ?? null)}
              />
              <Button size="sm" variant="outline" onClick={() => input.current?.click()}>
                Reemplazar
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Reemplazar sube la versión nueva y borra la anterior.
            </p>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="edit-desc">Nota</Label>
          <Textarea id="edit-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </div>

      <div className="mt-5 flex items-center justify-end gap-2">
        {progress ? <span className="mr-auto font-mono text-xs text-muted-foreground">Subiendo {progress}</span> : null}
        <Button variant="ghost" disabled={pending} onClick={onClose}>
          Cancelar
        </Button>
        <Button disabled={pending} onClick={guardar}>
          {pending ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </Dialog>
  );
}

/** Ventana flotante. Por portal: dentro de un panel con blur, `fixed` se queda atrapado. */
function Dialog({
  title,
  onClose,
  busy,
  children,
}: {
  title: string;
  onClose: () => void;
  busy: boolean;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:p-8"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-xl border bg-card p-5 shadow-2xl">
        <h2 className="mb-4 text-base font-semibold">{title}</h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}
