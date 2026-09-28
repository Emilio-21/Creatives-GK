"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/modal";
import {
  createRequest as createRequestAction,
  deleteRequest as deleteRequestAction,
  deleteRequestFile as deleteRequestFileAction,
  listRequests as listRequestsAction,
  openRequestFile as openRequestFileAction,
  portalLink as portalLinkAction,
  setRequestClosed as setRequestClosedAction,
  updateRequest as updateRequestAction,
  type ClientRequest,
} from "@/app/(app)/client/request-actions";
import { unwrapped } from "@/lib/action-result";
import { mensajeParaCliente } from "@/lib/client-requests";
import { today } from "@/lib/dates";
import { formatBytes } from "@/lib/material";
import { formatDate } from "@/lib/metrics";

// Las acciones regresan el error como dato; esto lo vuelve a lanzar con su mensaje real.
const createRequest = unwrapped(createRequestAction);
const deleteRequest = unwrapped(deleteRequestAction);
const deleteRequestFile = unwrapped(deleteRequestFileAction);
const listRequests = unwrapped(listRequestsAction);
const openRequestFile = unwrapped(openRequestFileAction);
const portalLink = unwrapped(portalLinkAction);
const setRequestClosed = unwrapped(setRequestClosedAction);
const updateRequest = unwrapped(updateRequestAction);

/**
 * Pedidos al cliente: lo que el cliente tiene que mandar (grabar ads, fotos,
 * su logo). El cliente lo sube desde su link, sin cuenta; quien lo pidio
 * recibe el aviso y los archivos quedan aqui.
 */
export function ClientRequestsSection({ clientId }: { clientId: string }) {
  const [items, setItems] = useState<ClientRequest[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ClientRequest | null>(null);
  const [sending, setSending] = useState<ClientRequest | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [showClosed, setShowClosed] = useState(false);

  const reload = useCallback(
    () =>
      listRequests(clientId)
        .then(setItems)
        .catch(() => setItems([])),
    [clientId],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  const abiertos = items?.filter((r) => !r.closedAt) ?? [];
  const cerrados = items?.filter((r) => r.closedAt) ?? [];
  const esperando = abiertos.filter((r) => r.files.length === 0).length;

  return (
    <section id="pedidos" className="scroll-mt-6 space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-heading text-3xl font-extralight tracking-tight">Pedidos al cliente</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Lo que el cliente sube desde su link, sin cuenta
            {esperando > 0 ? ` · ${esperando} esperando` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setLinkOpen(true)}>
            Link del cliente
          </Button>
          <Button size="sm" onClick={() => setCreating(true)}>
            Pedir al cliente
          </Button>
        </div>
      </div>

      {items === null ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : abiertos.length === 0 && cerrados.length === 0 ? (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="w-full rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
        >
          Pídele al cliente lo que falta: videos grabados, fotos, su logo…
        </button>
      ) : (
        <>
          {abiertos.length > 0 ? (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {abiertos.map((item) => (
                <RequestCard
                  key={item.id}
                  item={item}
                  onSend={() => setSending(item)}
                  onEdit={() => setEditing(item)}
                  onChanged={reload}
                />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nada pendiente del cliente.</p>
          )}

          {cerrados.length > 0 ? (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setShowClosed((v) => !v)}
                className="text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                {showClosed ? "Ocultar cerrados" : `Ver cerrados (${cerrados.length})`}
              </button>
              {showClosed ? (
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {cerrados.map((item) => (
                    <RequestCard
                      key={item.id}
                      item={item}
                      onSend={() => setSending(item)}
                      onEdit={() => setEditing(item)}
                      onChanged={reload}
                    />
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </>
      )}

      {creating || editing ? (
        <RequestDialog
          clientId={clientId}
          item={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={async (id) => {
            const nuevo = creating;
            setCreating(false);
            setEditing(null);
            const lista = await listRequests(clientId).catch(() => null);
            if (lista) setItems(lista);
            // Recien creado, lo que sigue es mandarle el mensaje al cliente.
            if (nuevo) setSending(lista?.find((r) => r.id === id) ?? null);
          }}
        />
      ) : null}

      {sending ? (
        <SendDialog clientId={clientId} item={sending} onClose={() => setSending(null)} />
      ) : null}

      {linkOpen ? <LinkDialog clientId={clientId} onClose={() => setLinkOpen(false)} /> : null}
    </section>
  );
}

function RequestCard({
  item,
  onSend,
  onEdit,
  onChanged,
}: {
  item: ClientRequest;
  onSend: () => void;
  onEdit: () => void;
  onChanged: () => Promise<unknown>;
}) {
  const [pending, startTransition] = useTransition();
  const cerrado = Boolean(item.closedAt);
  const recibido = item.files.length > 0;
  const vencido = !cerrado && !recibido && item.dueDate !== null && item.dueDate < today();

  const run = (fn: () => Promise<unknown>, ok: string) =>
    startTransition(async () => {
      try {
        await fn();
        toast.success(ok);
        await onChanged();
      } catch (error) {
        toast.error((error as Error).message);
      }
    });

  return (
    <li className={`surface flex flex-col rounded-xl border ${cerrado ? "opacity-70" : ""}`}>
      <div className="flex-1 space-y-2 p-3">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 text-sm font-medium">{item.title}</p>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
              cerrado
                ? "bg-muted text-muted-foreground"
                : recibido
                  ? "bg-primary/12 text-primary"
                  : vencido
                    ? "bg-destructive/12 text-destructive"
                    : "bg-muted text-foreground/80"
            }`}
          >
            {cerrado ? "Cerrado" : recibido ? "Recibido" : vencido ? "Vencido" : "Esperando"}
          </span>
        </div>

        {item.instructions ? (
          <p className="line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">{item.instructions}</p>
        ) : null}

        <p className="text-[11px] text-muted-foreground">
          {item.authorName ? `Pidió ${item.authorName}` : "Pedido"}
          {item.dueDate ? ` · para el ${formatDate(item.dueDate)}` : ""}
        </p>

        {recibido ? (
          <ul className="space-y-1 border-t pt-2">
            {item.files.map((file) => (
              <FileRow key={file.id} file={file} onChanged={onChanged} />
            ))}
          </ul>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1 border-t px-2 py-1.5 text-[11px] text-muted-foreground">
        {!cerrado ? (
          <>
            <CardAction onClick={onSend}>Mandar al cliente</CardAction>
            <CardAction onClick={onEdit}>Editar</CardAction>
          </>
        ) : null}
        <CardAction
          disabled={pending}
          onClick={() =>
            run(
              () => setRequestClosed(item.id, !cerrado),
              cerrado ? "Reabierto: el cliente lo ve otra vez" : "Cerrado",
            )
          }
        >
          {cerrado ? "Reabrir" : "Cerrar"}
        </CardAction>
        <CardAction
          danger
          disabled={pending}
          onClick={() => {
            const aviso = recibido
              ? `¿Borrar "${item.title}" y los ${item.files.length} archivos que subió el cliente? No se puede deshacer.`
              : `¿Borrar "${item.title}"?`;
            if (!window.confirm(aviso)) return;
            run(() => deleteRequest(item.id), "Borrado");
          }}
        >
          Borrar
        </CardAction>
      </div>
    </li>
  );
}

function FileRow({
  file,
  onChanged,
}: {
  file: ClientRequest["files"][number];
  onChanged: () => Promise<unknown>;
}) {
  const [pending, startTransition] = useTransition();

  // La URL firmada dura minutos: se pide al abrir, no al cargar la lista.
  const abrir = (download: boolean) => {
    if (download) {
      openRequestFile(file.id, true)
        .then((url) => {
          window.location.href = url;
        })
        .catch((error: Error) => toast.error(error.message));
      return;
    }
    // La ventana se abre antes del await: si se abre despues, Safari la bloquea.
    const win = window.open("about:blank", "_blank");
    if (win) win.opener = null;
    openRequestFile(file.id)
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
    <li className="flex items-center gap-1 text-xs">
      <button
        type="button"
        onClick={() => abrir(false)}
        className="min-w-0 flex-1 truncate text-left hover:underline"
        title={file.fileName}
      >
        {file.fileName}
      </button>
      <span className="shrink-0 text-[11px] text-muted-foreground">{formatBytes(file.sizeBytes)}</span>
      <button
        type="button"
        onClick={() => abrir(true)}
        className="shrink-0 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        Descargar
      </button>
      <button
        type="button"
        aria-label={`Borrar ${file.fileName}`}
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`¿Borrar "${file.fileName}"? No se puede deshacer.`)) return;
          startTransition(async () => {
            try {
              await deleteRequestFile(file.id);
              await onChanged();
            } catch (error) {
              toast.error((error as Error).message);
            }
          });
        }}
        className="shrink-0 rounded px-1 py-0.5 text-[11px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      >
        ✕
      </button>
    </li>
  );
}

function CardAction({
  onClick,
  disabled,
  danger,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded px-1.5 py-0.5 disabled:opacity-50 ${
        danger ? "hover:bg-destructive/10 hover:text-destructive" : "hover:bg-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function RequestDialog({
  clientId,
  item,
  onClose,
  onSaved,
}: {
  clientId: string;
  item: ClientRequest | null;
  onClose: () => void;
  onSaved: (id: string) => Promise<void>;
}) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [instructions, setInstructions] = useState(item?.instructions ?? "");
  const [dueDate, setDueDate] = useState(item?.dueDate ?? "");
  const [pending, startTransition] = useTransition();

  const guardar = () =>
    startTransition(async () => {
      try {
        const input = { title, instructions, dueDate: dueDate || null };
        let id = item?.id;
        if (id) await updateRequest(id, input);
        else id = await createRequest(clientId, input);
        toast.success(item ? "Guardado" : "Pedido creado");
        await onSaved(id);
      } catch (error) {
        toast.error((error as Error).message);
      }
    });

  const titulo = item ? "Editar pedido" : "Pedir al cliente";

  return (
    <Modal label={titulo} onClose={onClose} canClose={!pending} className="max-w-lg">
      <h2 className="mb-1 text-base font-semibold">{titulo}</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        El cliente lo ve en su link y sube ahí los archivos. Te avisamos cuando lleguen.
      </p>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="pedido-title">Qué necesitas</Label>
          <Input
            id="pedido-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Grabar 3 videos para anuncios"
            maxLength={140}
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pedido-instructions">Instrucciones (opcional)</Label>
          <Textarea
            id="pedido-instructions"
            rows={5}
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            placeholder={"Graba en vertical, con buena luz.\nGuion: …"}
            maxLength={4000}
          />
          <p className="text-xs text-muted-foreground">El cliente lo lee tal cual: escríbele a él.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pedido-due">Para cuándo (opcional)</Label>
          <Input
            id="pedido-due"
            type="date"
            value={dueDate}
            min={item ? undefined : today()}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" disabled={pending} onClick={onClose}>
          Cancelar
        </Button>
        <Button disabled={pending} onClick={guardar}>
          {pending ? "Guardando…" : item ? "Guardar" : "Crear pedido"}
        </Button>
      </div>
    </Modal>
  );
}

/** El link del cliente, cargado al abrir: la primera vez se crea. */
function usePortalLink(clientId: string) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    portalLink(clientId)
      .then(setUrl)
      .catch((error: Error) => toast.error(error.message));
  }, [clientId]);
  return [url, setUrl] as const;
}

async function copiar(texto: string, ok: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success(ok);
  } catch {
    toast.error("No se pudo copiar. Selecciónalo y cópialo a mano.");
  }
}

/** El mensaje listo para mandarle al cliente por WhatsApp o por correo. */
function SendDialog({
  clientId,
  item,
  onClose,
}: {
  clientId: string;
  item: ClientRequest;
  onClose: () => void;
}) {
  const [url] = usePortalLink(clientId);
  const mensaje = url ? mensajeParaCliente({ titulo: item.title, fecha: item.dueDate, url }) : "";

  return (
    <Modal label="Mandar al cliente" onClose={onClose} className="max-w-lg">
      <h2 className="mb-1 text-base font-semibold">Mándaselo al cliente</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Cópialo y mándalo desde tu WhatsApp o tu correo. El link es el mismo para todos sus
        pedidos.
      </p>

      <Textarea
        readOnly
        rows={7}
        value={url ? mensaje : "Preparando el link…"}
        onFocus={(event) => event.currentTarget.select()}
        className="text-sm"
      />

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Listo
        </Button>
        <Button
          variant="outline"
          disabled={!url}
          onClick={() => {
            const win = window.open(`https://wa.me/?text=${encodeURIComponent(mensaje)}`, "_blank");
            if (win) win.opener = null;
          }}
        >
          Abrir WhatsApp
        </Button>
        <Button disabled={!url} onClick={() => copiar(mensaje, "Mensaje copiado")}>
          Copiar mensaje
        </Button>
      </div>
    </Modal>
  );
}

function LinkDialog({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const [url, setUrl] = usePortalLink(clientId);
  const [pending, startTransition] = useTransition();

  return (
    <Modal label="Link del cliente" onClose={onClose} canClose={!pending} className="max-w-lg">
      <h2 className="mb-1 text-base font-semibold">Link del cliente</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Con este link el cliente ve sus pedidos abiertos y sube los archivos. No ve nada más de
        Relevo.
      </p>

      <div className="flex gap-2">
        <Input
          readOnly
          value={url ?? "Cargando…"}
          onFocus={(event) => event.currentTarget.select()}
          className="font-mono text-xs"
        />
        <Button disabled={!url} onClick={() => url && copiar(url, "Link copiado")}>
          Copiar
        </Button>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={pending || !url}
          className="text-muted-foreground"
          onClick={() => {
            if (
              !window.confirm(
                "¿Cambiar el link? El anterior deja de servir y tendrás que mandarle el nuevo al cliente.",
              )
            )
              return;
            startTransition(async () => {
              try {
                setUrl(await portalLink(clientId, true));
                toast.success("Link nuevo listo");
              } catch (error) {
                toast.error((error as Error).message);
              }
            });
          }}
        >
          Cambiar link
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={!url}
            onClick={() => {
              const win = url ? window.open(url, "_blank") : null;
              if (win) win.opener = null;
            }}
          >
            Ver como cliente
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
