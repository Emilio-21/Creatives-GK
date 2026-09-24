"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  groupAsAd as groupAsAdAction,
} from "@/app/(app)/client/variant-actions";
import { isBaseName, suggestPairs } from "@/lib/pairing";
import type { CreativeCard } from "@/lib/creatives";
import { unwrapped } from "@/lib/action-result";
import { Modal } from "@/components/modal";

// Las acciones regresan el error como dato; esto lo vuelve a lanzar con su mensaje real.
const groupAsAd = unwrapped(groupAsAdAction);

/**
 * Junta los archivos seleccionados en un solo anuncio.
 *
 * El punto de la pantalla es elegir el PRINCIPAL: es el que se queda con el
 * codigo [GK-xxxx], con las metricas y con la tarjeta del tablero. Por defecto
 * se propone la version cuadrada, que es la que suele ir de feed.
 */
export function VariantGroupPanel({
  cards,
  onClose,
  onDone,
}: {
  cards: CreativeCard[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [parentId, setParentId] = useState<string>(() => sugerirPrincipal(cards));
  const [pending, startTransition] = useTransition();

  // Si lo seleccionado son varios pares distintos, agruparlos todos en un solo
  // anuncio seria un error: se avisa en vez de dejar que pase.
  const pares = useMemo(
    () => suggestPairs(cards, (card) => card.original_filename),
    [cards],
  );
  const pareceVariosAnuncios = pares.length > 1;

  const conLanzamientos = cards.filter(
    (card) => card.id !== parentId && (card.stats?.launch_count ?? 0) > 0,
  );

  return (
    <Modal label="Agrupar como un anuncio" onClose={onClose} className="max-w-lg">
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute right-3 top-3 flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        ✕
      </button>

      <h2 className="pr-8 text-base font-semibold">Agrupar como un anuncio</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {cards.length} archivos en un solo anuncio de Meta. Elige cuál es el principal:
        se queda con el código y con las métricas.
      </p>

      {pareceVariosAnuncios ? (
        <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-xs">
          Por los nombres, esto parecen {pares.length} anuncios distintos (
          {pares.map((par) => par.key).join(", ")}). Si es así, agrúpalos de uno en
          uno.
        </p>
      ) : null}

      {conLanzamientos.length > 0 ? (
        <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-xs">
          {conLanzamientos.map((card) => card.display_name).join(", ")} ya tiene
          lanzamientos con métricas. Hazlo el principal, o desvincula sus lanzamientos
          antes de agrupar.
        </p>
      ) : null}

      <ul className="mt-4 space-y-1.5">
        {cards.map((card) => (
          <li key={card.id}>
            <button
              type="button"
              onClick={() => setParentId(card.id)}
              className={`flex w-full items-center gap-2.5 rounded-md border p-2 text-left transition-colors ${
                parentId === card.id
                  ? "border-primary/60 bg-primary/10"
                  : "hover:border-primary/40"
              }`}
            >
              <span className="size-10 shrink-0 overflow-hidden rounded bg-muted">
                {card.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={card.previewUrl} alt="" className="size-full object-cover" />
                ) : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{card.display_name}</span>
                <span className="block font-mono text-[11px] text-muted-foreground">
                  {card.aspect ?? "sin dimensiones"}
                </span>
              </span>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                {parentId === card.id ? "principal" : "formato"}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-5 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onClose} disabled={pending}>
          Cancelar
        </Button>
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              try {
                const movidos = await groupAsAd(
                  parentId,
                  cards.map((card) => card.id),
                );
                if (movidos === 0) {
                  toast.error("No se agrupó nada. Revisa las advertencias de arriba.");
                  return;
                }
                toast.success(
                  `Un anuncio con ${movidos + 1} archivos. El código es el de ${
                    cards.find((card) => card.id === parentId)?.display_name ?? "el principal"
                  }.`,
                );
                onDone();
              } catch (error) {
                toast.error((error as Error).message);
              }
            })
          }
        >
          {pending ? "Agrupando…" : "Agrupar"}
        </Button>
      </div>
    </Modal>
  );
}

/**
 * El principal por defecto es el archivo sin sufijo: "AD-PM2-9" y no
 * "AD-PM2-9.2". Es el nombre con el que el equipo llama al anuncio, y es el que
 * va a quedar en la tarjeta del tablero y en el informe de copy.
 *
 * Un archivo que ya tiene lanzamientos gana sobre esa regla: sus metricas ya
 * existen y convertirlo en variante las dejaria fuera del tablero.
 */
function sugerirPrincipal(cards: CreativeCard[]): string {
  const conMetricas = cards.find((card) => (card.stats?.launch_count ?? 0) > 0);
  if (conMetricas) return conMetricas.id;

  const base = cards.find((card) => isBaseName(card.original_filename));
  return (base ?? cards[0]).id;
}
