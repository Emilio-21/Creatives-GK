"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  assignCreativesToBatch as assignCreativesToBatchAction,
  createBatch as createBatchAction,
  listBatches as listBatchesAction,
} from "@/app/(app)/client/batch-actions";
import { unwrapped } from "@/lib/action-result";

// Las acciones regresan el error como dato; esto lo vuelve a lanzar con su mensaje real.
const assignCreativesToBatch = unwrapped(assignCreativesToBatchAction);
const createBatch = unwrapped(createBatchAction);
const listBatches = unwrapped(listBatchesAction);

type Batch = { id: string; name: string };

const SIN_BATCH = "__sin_batch__";

/**
 * Agrupa creativos sueltos en un batch, o crea el batch en el momento.
 *
 * El batch nace aqui sin pasar por un brief: no toda tanda viene de un pedido
 * de copy, a veces son archivos que ya estaban en la biblioteca y hasta ahora
 * se decide probarlos juntos.
 */
export function BatchAssignPanel({
  clientId,
  creativeIds,
  onClose,
  onDone,
}: {
  clientId: string;
  creativeIds: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    listBatches(clientId)
      .then(setBatches)
      .catch((error: Error) => {
        toast.error(error.message);
        setBatches([]);
      });
  }, [clientId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const total = creativeIds.length;

  function mover(batchId: string | null, nombre: string) {
    startTransition(async () => {
      try {
        const movidos = await assignCreativesToBatch(creativeIds, batchId);
        if (movidos === 0) {
          toast.error("No se movió nada: revisa que los creativos sean de este cliente.");
          return;
        }
        toast.success(
          movidos < total
            ? `${movidos} de ${total} movidos a ${nombre}. El resto es de otro cliente.`
            : `${movidos} creativo${movidos === 1 ? "" : "s"} en ${nombre}`,
        );
        onDone();
      } catch (error) {
        toast.error((error as Error).message);
      }
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Mover a batch"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:p-8"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-md rounded-xl border bg-card p-5 shadow-2xl">
        <button
          type="button"
          aria-label="Cerrar"
          onClick={onClose}
          className="absolute right-3 top-3 flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          ✕
        </button>

        <h2 className="pr-8 text-base font-semibold">Mover a batch</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {total} creativo{total === 1 ? "" : "s"} seleccionado{total === 1 ? "" : "s"}. Un
          batch es un ad set.
        </p>

        <div className="mt-4 space-y-3">
          <div className="space-y-1.5">
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              Batch nuevo
            </p>
            <div className="flex gap-2">
              <Input
                value={nuevo}
                placeholder="Nombre del batch"
                maxLength={80}
                onChange={(event) => setNuevo(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && nuevo.trim()) crearYMover();
                }}
              />
              <Button size="sm" disabled={pending || !nuevo.trim()} onClick={crearYMover}>
                Crear y mover
              </Button>
            </div>
          </div>

          <div className="space-y-1.5 border-t pt-3">
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              Batch existente
            </p>

            {batches === null ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Cargando…</p>
            ) : batches.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">
                Este cliente todavía no tiene batches. Crea el primero arriba.
              </p>
            ) : (
              <ul className="max-h-56 space-y-1 overflow-y-auto">
                {batches.map((batch) => (
                  <li key={batch.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(batch.id)}
                      className={`w-full truncate rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors ${
                        selectedId === batch.id
                          ? "border-primary/60 bg-primary/10"
                          : "hover:border-primary/40"
                      }`}
                    >
                      {batch.name}
                    </button>
                  </li>
                ))}
                <li>
                  <button
                    type="button"
                    onClick={() => setSelectedId(SIN_BATCH)}
                    className={`w-full rounded-md border border-dashed px-2.5 py-1.5 text-left text-sm text-muted-foreground transition-colors ${
                      selectedId === SIN_BATCH ? "border-primary/60 bg-primary/10" : ""
                    }`}
                  >
                    Sacar del batch
                  </button>
                </li>
              </ul>
            )}
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button
            size="sm"
            disabled={pending || !selectedId}
            onClick={() => {
              if (!selectedId) return;
              if (selectedId === SIN_BATCH) {
                mover(null, "ningún batch");
                return;
              }
              const batch = batches?.find((item) => item.id === selectedId);
              mover(selectedId, batch?.name ?? "el batch");
            }}
          >
            {pending ? "Moviendo…" : "Mover"}
          </Button>
        </div>
      </div>
    </div>
  );

  function crearYMover() {
    const nombre = nuevo.trim();
    if (!nombre) return;
    startTransition(async () => {
      try {
        const id = await createBatch(clientId, nombre);
        setBatches((prev) => [{ id, name: nombre }, ...(prev ?? [])]);
        setNuevo("");
        const movidos = await assignCreativesToBatch(creativeIds, id);
        toast.success(
          `Batch "${nombre}" creado con ${movidos} creativo${movidos === 1 ? "" : "s"}`,
        );
        onDone();
      } catch (error) {
        toast.error((error as Error).message);
      }
    });
  }
}
