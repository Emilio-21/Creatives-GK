"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BriefCard } from "@/components/brief-card";
import { BriefWorkflow } from "@/components/brief-workflow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { docEmbedUrl, docLabel } from "@/lib/brief-flow";
import { UploadDropzone } from "@/app/(app)/upload/upload-dropzone";
import { createBatch } from "@/app/(app)/client/batch-actions";
import {
  listBriefs,
  publishBrief,
  saveBrief,
  type BriefWithMeta,
} from "@/app/(app)/client/brief-actions";

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
  const [openId, setOpenId] = useState<string | null>(null);

  const reload = () =>
    listBriefs(clientId)
      .then(setBriefs)
      .catch(() => setBriefs([]));

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

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
          <h2 className="text-2xl font-semibold">Briefs</h2>
          {briefs ? (
            <p className="mt-1 flex flex-wrap gap-x-4 text-sm text-muted-foreground">
              <span>
                {briefs.length} brief{briefs.length === 1 ? "" : "s"}
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
          Sin briefs. Créalos desde &quot;Nuevo brief&quot; en el panel
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
          onClose={() => setOpenId(null)}
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
    docUrl: brief.doc_url ?? "",
    briefDate: brief.brief_date,
  });
  const [batchId, setBatchId] = useState(brief.batch_id);
  const [batchName, setBatchName] = useState(brief.batchName ?? brief.title);
  const [pending, startTransition] = useTransition();

  const completed = brief.batchCompletedAt !== null;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={brief.title}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:p-8"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`relative w-full ${brief.doc_url ? "max-w-5xl" : "max-w-3xl"} rounded-xl border bg-card p-5 shadow-2xl`}
      >
        <button
          type="button"
          aria-label="Cerrar"
          onClick={onClose}
          className="absolute right-3 top-3 flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          ✕
        </button>

        {editing ? (
          <div className="space-y-3">
            <Input
              value={draft.title}
              onChange={(event) =>
                setDraft({ ...draft, title: event.target.value })
              }
              maxLength={140}
            />
            <Input
              type="date"
              value={draft.briefDate}
              onChange={(event) =>
                setDraft({ ...draft, briefDate: event.target.value })
              }
              className="w-44"
            />
            <Input
              type="url"
              inputMode="url"
              value={draft.docUrl}
              onChange={(event) =>
                setDraft({ ...draft, docUrl: event.target.value })
              }
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
                        docUrl: draft.docUrl,
                        briefDate: draft.briefDate,
                      });
                      toast.success("Brief guardado");
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
            </div>

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
              {brief.doc_url ? "Editar" : "Pegar link del Doc"}
            </Button>

            {/* Solo Ads sube a la biblioteca: es la que se mide contra Meta. Un
                email o un SMS se produce y se lanza fuera; aqui solo se sigue. */}
            {brief.channel === "ads" ? (
              <div className="mt-5 border-t pt-4">
                <h3 className="text-sm font-semibold">Diseños de este brief</h3>

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
                        disabled={pending || completed}
                        onClick={() =>
                          startTransition(async () => {
                            try {
                              const result = await publishBrief(
                                brief.id,
                                batchId,
                              );
                              if (result.handedOff) {
                                toast.success(
                                  "Publicado y mandado a lanzamiento.",
                                );
                              } else {
                                // Los diseños ya estan arriba; solo falta el relevo.
                                toast.warning(
                                  `Diseños publicados, pero no pasó a lanzamiento: ${result.reason}`,
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
                        {completed ? "Ya publicado" : "Publicar diseños"}
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        Publicar cierra el batch y le avisa a quien lanza.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
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
