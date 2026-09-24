"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { BriefCard } from "@/components/brief-card";
import { BriefComments } from "@/components/brief-comments";
import { BriefWorkflow } from "@/components/brief-workflow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CHANNELS, CHANNEL_LABEL, docEmbedUrl, docLabel } from "@/lib/brief-flow";
import { UploadDropzone } from "@/app/(app)/upload/upload-dropzone";
import { createBatch as createBatchAction } from "@/app/(app)/client/batch-actions";
import {
  listBriefs as listBriefsAction,
  publishBrief as publishBriefAction,
  saveBrief as saveBriefAction,
  type BriefWithMeta,
} from "@/app/(app)/client/brief-actions";
import { unwrapped } from "@/lib/action-result";
import { onTasksChanged } from "@/lib/task-events";
import { Modal } from "@/components/modal";

// Las acciones regresan el error como dato; esto lo vuelve a lanzar con su mensaje real.
const createBatch = unwrapped(createBatchAction);
const listBriefs = unwrapped(listBriefsAction);
const publishBrief = unwrapped(publishBriefAction);
const saveBrief = unwrapped(saveBriefAction);

/**
 * El brief es el punto de partida: copy escribe, diseño sube ahi mismo, y al
 * publicar los creativos caen en "sin lanzar" con su batch marcado completado.
 */
export function BriefsSection({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName: string;
}) {
  const router = useRouter();
  const [briefs, setBriefs] = useState<BriefWithMeta[] | null>(null);
  // ?brief= abre ese brief: es como llega alguien desde "Mi trabajo" o desde Slack.
  const [openId, setOpenId] = useState<string | null>(useSearchParams().get("brief"));

  const reload = useCallback(
    () =>
      listBriefs(clientId)
        .then(setBriefs)
        .catch(() => setBriefs([])),
    [clientId],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  // Una tarea creada desde la barra lateral: aparece sin recargar la pagina.
  useEffect(() => onTasksChanged(clientId, () => void reload()), [clientId, reload]);

  const open = briefs?.find((brief) => brief.id === openId) ?? null;
  const pending =
    briefs?.filter((brief) => brief.status !== "lanzado").length ?? 0;
  const rail = useRef<HTMLDivElement>(null);

  const scrollBy = (amount: number) =>
    rail.current?.scrollBy({ left: amount, behavior: "smooth" });

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="font-heading font-extralight tracking-tight text-3xl">Tareas</h2>
          {briefs ? (
            <p className="mt-1 flex flex-wrap gap-x-4 text-sm text-muted-foreground">
              <span>
                {briefs.length} tarea{briefs.length === 1 ? "" : "s"}
              </span>
              <span>
                {pending} pendiente{pending === 1 ? "" : "s"}
              </span>
            </p>
          ) : null}
        </div>

        {briefs && briefs.length > 0 ? (
          <div className="flex gap-1">
            <RailButton label="Anterior" onClick={() => scrollBy(-480)}>
              ←
            </RailButton>
            <RailButton label="Siguiente" onClick={() => scrollBy(480)}>
              →
            </RailButton>
          </div>
        ) : null}
      </div>

      {briefs === null ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : briefs.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Sin tareas. Créalas desde &quot;Nueva tarea&quot; en el panel
          izquierdo.
        </p>
      ) : (
        // Carrusel: los briefs se leen en orden, no se comparan en cuadricula.
        <div
          ref={rail}
          className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2"
        >
          {briefs.map((brief) => (
            <div key={brief.id} className="w-60 shrink-0 snap-start">
              <BriefCard brief={brief} onOpen={() => setOpenId(brief.id)} />
            </div>
          ))}
        </div>
      )}

      {open ? (
        <BriefModal
          brief={open}
          clientId={clientId}
          clientName={clientName}
          onClose={() => {
            setOpenId(null);
            // Sin esto, recargar la pagina volveria a abrir el brief.
            if (window.location.search.includes("brief=")) {
              router.replace(`/client/${clientId}`, { scroll: false });
            }
          }}
          onChanged={async () => {
            await reload();
            router.refresh();
          }}
        />
      ) : null}
    </section>
  );
}

function RailButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-8 items-center justify-center rounded-lg border text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}

function BriefModal({
  brief,
  clientId,
  clientName,
  onClose,
  onChanged,
}: {
  brief: BriefWithMeta;
  clientId: string;
  clientName: string;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    title: brief.title,
    angle: brief.angle ?? "",
    docUrl: brief.doc_url ?? "",
    briefDate: brief.brief_date,
    channel: brief.channel,
  });
  const [batchId, setBatchId] = useState(brief.batch_id);
  // El batch se llama como el angulo: es la tanda con la que se prueba ese
  // angulo. Mientras nadie lo escriba a mano, sigue al angulo aunque cambie.
  const [nombreEscrito, setBatchName] = useState<string | null>(null);
  const batchName = nombreEscrito ?? brief.batchName ?? brief.angle ?? brief.title;
  // El canal solo se cambia en copy: despues ya hay etapas que dependen de el.
  const enCopy = brief.status === "borrador";
  const [pending, startTransition] = useTransition();

  const completed = brief.batchCompletedAt !== null;
  // Si pidieron cambios, la tarea regresa a producción con el batch ya
  // cerrado: se tiene que poder publicar otra vez.
  const yaPublicada = completed && brief.status !== "en_produccion";

  return (
    <Modal label={brief.title} onClose={onClose} className={brief.doc_url ? "max-w-5xl" : "max-w-3xl"}>
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute right-3 top-3 flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        ✕
      </button>

      {editing ? (
        <div className="space-y-3 pr-8">
          <Input
            aria-label="Título"
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            maxLength={140}
          />
          <div className="flex flex-wrap gap-2">
            <Input
              aria-label="Ángulo"
              value={draft.angle}
              onChange={(event) => setDraft({ ...draft, angle: event.target.value })}
              placeholder="Ángulo"
              maxLength={80}
              className="min-w-0 flex-1"
            />
            <Input
              aria-label="Fecha"
              type="date"
              value={draft.briefDate}
              onChange={(event) => setDraft({ ...draft, briefDate: event.target.value })}
              className="w-44"
            />
          </div>
          {enCopy ? (
            <div role="radiogroup" aria-label="Canal" className="flex gap-1.5">
              {CHANNELS.map((channel) => (
                <button
                  key={channel}
                  type="button"
                  role="radio"
                  aria-checked={draft.channel === channel}
                  onClick={() => setDraft({ ...draft, channel })}
                  className={`h-8 flex-1 rounded-md border text-sm transition-colors ${
                    draft.channel === channel
                      ? "border-primary bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {CHANNEL_LABEL[channel]}
                </button>
              ))}
            </div>
          ) : null}
          <Input
            aria-label="Link al Google Doc"
            type="url"
            inputMode="url"
            value={draft.docUrl}
            onChange={(event) => setDraft({ ...draft, docUrl: event.target.value })}
            placeholder="Link al Google Doc"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  try {
                    await saveBrief({
                      id: brief.id,
                      clientId,
                      title: draft.title,
                      angle: draft.angle,
                      docUrl: draft.docUrl,
                      briefDate: draft.briefDate,
                      ...(enCopy ? { channel: draft.channel } : {}),
                    });
                    toast.success("Tarea guardada");
                    setEditing(false);
                    await onChanged();
                  } catch (error) {
                    toast.error((error as Error).message);
                  }
                })
              }
            >
              Guardar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditing(false)}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-3 pr-8">
            <h2 className="text-base font-semibold">{brief.title}</h2>
            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
              {clientName} · {brief.brief_date} · {brief.authorName ?? "—"}
              {completed ? " · batch completado" : ""}
            </p>
            {brief.angle ? (
              <p className="mt-1 text-sm">
                <span className="text-muted-foreground">Ángulo:</span> {brief.angle}
              </p>
            ) : null}
          </div>

          {/* Lo que pidio quien la solicito: el punto de partida de copy. */}
          {brief.request_note ? (
            <p className="mb-3 whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">El pedido</span>
              {brief.request_note}
            </p>
          ) : null}

          <div className="mb-3">
            <BriefWorkflow brief={brief} onChanged={onChanged} />
          </div>

          {brief.doc_url ? (
            <DocPanel docUrl={brief.doc_url} />
          ) : brief.body ? (
            // Briefs de antes del Doc: el texto se queda, solo ya no se escribe aqui.
            <p className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm">
              {brief.body}
            </p>
          ) : (
            <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              Sin Google Doc todavía.
            </p>
          )}

          <Button
            size="sm"
            variant="ghost"
            className="mt-2"
            onClick={() => setEditing(true)}
          >
            {enCopy ? "Definir canal, Doc y ángulo" : "Editar"}
          </Button>

          {/* Solo Ads sube a la biblioteca: es la que se mide contra Meta. Un
              email o un mensaje se arma y se lanza fuera; aqui solo se sigue. */}
          {brief.channel === "ads" ? (
            <div className="mt-5 border-t pt-4">
              <h3 className="text-sm font-semibold">Diseños de esta tarea</h3>

              {!batchId ? (
                <div className="mt-2 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Ponle nombre al batch para empezar a subir. Es la tanda
                    con la que se va a probar.
                  </p>
                  <div className="flex gap-2">
                    <Input
                      value={batchName}
                      onChange={(event) => setBatchName(event.target.value)}
                      placeholder="Nombre del batch"
                      maxLength={80}
                    />
                    <Button
                      size="sm"
                      disabled={pending || !batchName.trim()}
                      onClick={() =>
                        startTransition(async () => {
                          try {
                            const id = await createBatch(clientId, batchName);
                            setBatchId(id);
                            await saveBrief({
                              id: brief.id,
                              clientId,
                              batchId: id,
                              title: brief.title,
                              docUrl: brief.doc_url,
                              briefDate: brief.brief_date,
                            });
                            await onChanged();
                          } catch (error) {
                            toast.error((error as Error).message);
                          }
                        })
                      }
                    >
                      Crear batch
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 space-y-4">
                  <p className="font-mono text-[11px] text-muted-foreground">
                    Batch: {brief.batchName ?? batchName} ·{" "}
                    {brief.creativeCount} diseño
                    {brief.creativeCount === 1 ? "" : "s"}
                  </p>

                  <UploadDropzone
                    clients={[{ id: clientId, name: clientName }]}
                    lockedClientId={clientId}
                    lockedBatchId={batchId}
                    onUploaded={onChanged}
                  />

                  <div className="flex items-center gap-3">
                    <Button
                      size="sm"
                      disabled={pending || yaPublicada}
                      onClick={() =>
                        startTransition(async () => {
                          try {
                            const result = await publishBrief(
                              brief.id,
                              batchId,
                            );
                            if (result.handedOff) {
                              toast.success("Publicada y mandada a aprobación.");
                            } else {
                              // Los diseños ya estan arriba; solo falta el relevo.
                              toast.warning(
                                `Diseños publicados, pero la tarea no pasó a aprobación: ${result.reason}`,
                              );
                            }
                            await onChanged();
                            onClose();
                          } catch (error) {
                            toast.error((error as Error).message);
                          }
                        })
                      }
                    >
                      {yaPublicada ? "Ya publicada" : completed ? "Publicar otra vez" : "Publicar diseños"}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Publicar cierra el batch y la manda a que copy y media la aprueben.
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          <BriefComments briefId={brief.id} stamp={`${brief.status}-${brief.updated_at}`} />
        </>
      )}
    </Modal>
  );
}

/**
 * El Doc dentro del brief, para leerlo sin cambiar de pestaña. Google decide
 * quien lo ve con la sesion del navegador: si no hay acceso (o Safari bloquea
 * las cookies de Google dentro del iframe), el marco muestra el aviso de Google,
 * por eso el link para abrirlo aparte siempre esta a la vista.
 */
function DocPanel({ docUrl }: { docUrl: string }) {
  const embedUrl = docEmbedUrl(docUrl);
  return (
    <div className="overflow-hidden rounded-md border">
      <a
        href={docUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-between gap-3 bg-muted/30 px-3 py-2 text-sm transition-colors hover:bg-muted/60"
      >
        <span className="min-w-0 truncate font-medium">
          {embedUrl
            ? `${docLabel(docUrl)} · abrir en otra pestaña`
            : `Abrir ${docLabel(docUrl)}`}
        </span>
        <span aria-hidden className="shrink-0 text-primary">
          ↗
        </span>
      </a>
      {embedUrl ? (
        <iframe
          src={embedUrl}
          title={docLabel(docUrl)}
          loading="lazy"
          className="block h-[70vh] w-full border-t bg-white"
        />
      ) : null}
    </div>
  );
}
