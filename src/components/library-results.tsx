"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CreativeModal } from "@/components/creative-modal";
import { CreativeTile } from "@/components/creative-tile";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requestDownloads } from "@/app/(app)/creative/actions";
import { quickLaunch } from "@/app/(app)/creative/detail-actions";
import { deleteCreative } from "@/app/(app)/creative/creative-actions";
import { downloadOne, downloadZip } from "@/lib/download";
import { exportReportCsv } from "@/lib/export-report";
import { useRouter } from "next/navigation";
import { formatMoney, formatPercent, statusOf, STATUS_LABEL } from "@/lib/metrics";
import { adCodeFor } from "@/lib/ad-code";
import type { CreativeCard as Card } from "@/lib/creatives";

const STATUS_DOT: Record<ReturnType<typeof statusOf>, string> = {
  // Amarillo solo para "sin lanzar"; morado para lo que ya salio al aire.
  "sin-lanzar": "bg-highlight",
  "en-circulacion": "bg-primary",
  finalizado: "bg-muted-foreground/60",
};

/** El código que enlaza el creativo con su anuncio en Meta. */
function CodeCell({ creativeId }: { creativeId: string }) {
  const code = adCodeFor(creativeId);
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      title="Copiar el código para pegarlo en el nombre del ad"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(`[${code}]`);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error("No se pudo copiar.");
        }
      }}
      className="rounded border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
    >
      {copied ? "copiado" : `[${code}]`}
    </button>
  );
}

function StatusPill({ status }: { status: ReturnType<typeof statusOf> }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
      <span className={`size-1.5 rounded-full ${STATUS_DOT[status]}`} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function LibraryResults({
  cards,
  view,
  zipBaseName,
  reportName,
}: {
  cards: Card[];
  view: "tablero" | "tabla";
  reportName: string;
  zipBaseName: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allSelected = cards.length > 0 && cards.every((card) => selected.has(card.id));
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(cards.map((card) => card.id)));

  async function downloadOneById(id: string) {
    setBusy(true);
    try {
      const [target] = await requestDownloads([id]);
      if (target) downloadOne(target);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function markLaunched(id: string) {
    setBusy(true);
    try {
      await quickLaunch(id);
      toast.success("Marcado como lanzado. Captura las métricas cuando las tengas.");
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function removeCreative(card: Card) {
    const launched = statusOf(card.stats) !== "sin-lanzar";
    const warning = launched
      ? `\n\nOjo: también se borran sus ${card.stats?.launch_count} lanzamiento${
          card.stats?.launch_count === 1 ? "" : "s"
        } con sus métricas.`
      : "";

    if (
      !confirm(
        `¿Borrar "${card.display_name}"?\n\nSe borra el archivo de R2 y no se puede deshacer.${warning}\n\nSi solo quieres sacarlo de la biblioteca, archívalo desde el detalle.`,
      )
    ) {
      return;
    }

    setBusy(true);
    try {
      await deleteCreative(card.id);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(card.id);
        return next;
      });
      toast.success("Creativo borrado");
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    const ids = [...selected];
    if (ids.length === 0) return;

    setBusy(true);
    try {
      const targets = await requestDownloads(ids);
      if (targets.length === 1) {
        downloadOne(targets[0]);
      } else {
        const toastId = toast.loading(`Armando el zip… 0/${targets.length}`);
        await downloadZip(
          targets,
          `${zipBaseName}-${new Date().toISOString().slice(0, 10)}.zip`,
          (done, total) => toast.loading(`Armando el zip… ${done}/${total}`, { id: toastId }),
        );
        toast.success(`${targets.length} archivos descargados`, { id: toastId });
      }
      setSelected(new Set());
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {view === "tablero" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <BoardColumn
            title="Sin lanzar"
            hint="Inventario que nunca salió al aire"
            accent
            cards={cards.filter((card) => statusOf(card.stats) === "sin-lanzar")}
            selected={selected}
            onToggle={toggle}
            onOpen={setOpenId}
            onDownload={downloadOneById}
            onLaunch={markLaunched}
            onDelete={removeCreative}
            busy={busy}
          />
          <BoardColumn
            title="Lanzados"
            hint="En circulación o ya finalizados"
            cards={cards.filter((card) => statusOf(card.stats) !== "sin-lanzar")}
            selected={selected}
            onToggle={toggle}
            onOpen={setOpenId}
            onDownload={downloadOneById}
            onLaunch={markLaunched}
            onDelete={removeCreative}
            busy={busy}
          />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleAll}
                    aria-label="Seleccionar todos"
                  />
                </TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Nombre</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Código de ad</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Estado</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Formato</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wider">Gasto</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wider">CTR</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wider">CPA</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wider">Subido</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cards.map((card) => (
                <TableRow key={card.id}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(card.id)}
                      onCheckedChange={() => toggle(card.id)}
                      aria-label={`Seleccionar ${card.display_name}`}
                    />
                  </TableCell>
                  <TableCell className="max-w-xs truncate font-medium">
                    <Link href={`/creative/${card.id}`} className="hover:underline">
                      {card.display_name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <CodeCell creativeId={card.id} />
                  </TableCell>
                  <TableCell>
                    <StatusPill status={statusOf(card.stats)} />
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {card.format ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(card.stats?.total_spend ?? null)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPercent(card.stats?.ctr ?? null)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(card.stats?.cpa ?? null)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {new Date(card.created_at).toLocaleDateString("es-MX")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}


      <div className="flex justify-end">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            const scope = selected.size > 0 ? cards.filter((c) => selected.has(c.id)) : cards;
            exportReportCsv(
              scope,
              `${reportName}-${new Date().toISOString().slice(0, 10)}.csv`,
            );
            toast.success(`Informe de ${scope.length} creativos exportado`);
          }}
        >
          Exportar informe
        </Button>
      </div>

      {openId ? (
        <CreativeModal
          creativeId={openId}
          open
          onOpenChange={(next) => (next ? null : setOpenId(null))}
          onDownload={downloadOneById}
          onDeleted={() => setOpenId(null)}
        />
      ) : null}

      {selected.size > 0 ? (
        <div className="glass sticky bottom-4 z-20 mx-auto flex w-fit items-center gap-3 rounded-full border px-4 py-2 shadow-lg">
          <span className="text-sm">
            {selected.size} seleccionado{selected.size === 1 ? "" : "s"}
          </span>
          <Button size="sm" disabled={busy} onClick={download}>
            {busy ? "Preparando…" : selected.size === 1 ? "Descargar" : "Descargar zip"}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setSelected(new Set())}>
            Limpiar
          </Button>
        </div>
      ) : null}
    </>
  );
}

function BoardColumn({
  title,
  hint,
  accent,
  cards,
  selected,
  onToggle,
  onOpen,
  onDownload,
  onLaunch,
  onDelete,
  busy,
}: {
  title: string;
  hint: string;
  accent?: boolean;
  cards: Card[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
  onDownload: (id: string) => void;
  onLaunch: (id: string) => void;
  onDelete: (card: Card) => void;
  busy: boolean;
}) {
  return (
    <section
      className={`rounded-xl border p-4 ${accent ? "border-highlight/40" : "border-primary/25"}`}
    >
      <header className="mb-3 flex items-baseline justify-between gap-2 px-1">
        <h3 className="text-base font-medium">
          {title}
          <span
            className={`ml-2 font-mono text-xs font-normal ${
              accent ? "text-highlight" : "text-muted-foreground"
            }`}
          >
            {cards.length}
          </span>
        </h3>
        <p className="truncate text-[11px] text-muted-foreground">{hint}</p>
      </header>

      {cards.length === 0 ? (
        <p className="px-1 py-6 text-center text-xs text-muted-foreground">
          Nada aquí.
        </p>
      ) : (
        <div className="space-y-4">
          {groupByBatch(cards).map((group) => (
            <div key={group.key} className="space-y-2">
              {/* Los creativos se prueban por tandas: la agrupacion es la unidad
                  con la que el equipo decide, no un adorno. */}
              <p className="flex items-baseline gap-2 px-1 text-xs">
                <span className="font-medium">{group.name}</span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {group.cards.length}
                </span>
                {group.completed ? (
                  <span className="rounded-full border border-primary/40 px-1.5 py-0.5 text-[10px] text-primary">
                    Completado
                  </span>
                ) : null}
              </p>
              <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-3">
                {group.cards.map((card) => (
                  <CreativeTile
                    key={card.id}
                    creative={card}
                    selected={selected.has(card.id)}
                    onToggle={() => onToggle(card.id)}
                    onOpen={() => onOpen(card.id)}
                    onDownload={() => onDownload(card.id)}
                    onLaunch={() => onLaunch(card.id)}
                    onDelete={() => onDelete(card)}
                    busy={busy}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** Agrupa por batch conservando el orden de la lista; lo suelto va al final. */
function groupByBatch(
  cards: Card[],
): { key: string; name: string; completed: boolean; cards: Card[] }[] {
  const groups = new Map<
    string,
    { key: string; name: string; completed: boolean; cards: Card[] }
  >();

  for (const card of cards) {
    const key = card.batch_id ?? "__sin_batch__";
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        name: card.batchName ?? "Sin batch",
        completed: card.batchCompletedAt !== null,
        cards: [],
      });
    }
    groups.get(key)!.cards.push(card);
  }

  const list = [...groups.values()];
  const loose = list.findIndex((group) => group.key === "__sin_batch__");
  if (loose >= 0) list.push(...list.splice(loose, 1));
  return list;
}
