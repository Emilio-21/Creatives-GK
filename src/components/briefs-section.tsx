"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BriefCard } from "@/components/brief-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { UploadDropzone } from "@/app/upload/upload-dropzone";
import { createBatch } from "@/app/client/batch-actions";
import {
  listBriefs,
  publishBrief,
  saveBrief,
  type BriefWithMeta,
} from "@/app/client/brief-actions";

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

  const reload = () => listBriefs(clientId).then(setBriefs).catch(() => setBriefs([]));

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const open = briefs?.find((brief) => brief.id === openId) ?? null;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">
        Briefs
        {briefs ? (
          <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
            {briefs.length}
          </span>
        ) : null}
      </h2>

      {briefs === null ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : briefs.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Sin briefs. Créalos desde &quot;Nuevo brief&quot; en el panel izquierdo.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {briefs.map((brief) => (
            <BriefCard key={brief.id} brief={brief} onOpen={() => setOpenId(brief.id)} />
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
    body: brief.body,
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
      <div className="relative w-full max-w-3xl rounded-xl border bg-card p-5 shadow-2xl">
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
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              maxLength={140}
            />
            <Input
              type="date"
              value={draft.briefDate}
              onChange={(event) => setDraft({ ...draft, briefDate: event.target.value })}
              className="w-44"
            />
            <Textarea
              rows={14}
              value={draft.body}
              onChange={(event) => setDraft({ ...draft, body: event.target.value })}
              className="font-mono text-sm"
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
                        body: draft.body,
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
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
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

            <p className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm">
              {brief.body || "Sin instrucciones."}
            </p>

            <Button
              size="sm"
              variant="ghost"
              className="mt-2"
              onClick={() => setEditing(true)}
            >
              Editar instrucciones
            </Button>

            <div className="mt-5 border-t pt-4">
              <h3 className="text-sm font-semibold">Diseños de este brief</h3>

              {!batchId ? (
                <div className="mt-2 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Ponle nombre al batch para empezar a subir. Es la tanda con la que se
                    va a probar.
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
                              body: brief.body,
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
                    Batch: {brief.batchName ?? batchName} · {brief.creativeCount} diseño
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
                            await publishBrief(brief.id, batchId);
                            toast.success(
                              "Publicado. Los diseños están en Sin lanzar con su batch.",
                            );
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
                      Publicar marca el batch como completado.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
