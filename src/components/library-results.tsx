"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CreativeCard } from "@/components/creative-card";
import { Badge } from "@/components/ui/badge";
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
import { requestDownloads } from "@/app/creative/actions";
import { downloadOne, downloadZip } from "@/lib/download";
import type { CreativeCard as Card } from "@/lib/creatives";

export function LibraryResults({
  cards,
  view,
  zipBaseName,
}: {
  cards: Card[];
  view: "grid" | "tabla";
  zipBaseName: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

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
      {view === "grid" ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
          {cards.map((card) => (
            <div key={card.id} className="relative">
              <label className="absolute left-2 top-2 z-10 flex cursor-pointer items-center rounded bg-background/85 p-1 shadow-sm backdrop-blur-sm">
                <Checkbox
                  checked={selected.has(card.id)}
                  onCheckedChange={() => toggle(card.id)}
                  aria-label={`Seleccionar ${card.display_name}`}
                />
              </label>
              <CreativeCard creative={card} />
            </div>
          ))}
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
                <TableHead>Nombre</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Formato</TableHead>
                <TableHead>Subido por</TableHead>
                <TableHead className="text-right">Peso</TableHead>
                <TableHead className="text-right">Subido</TableHead>
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
                    <Badge variant={card.stats?.is_published ? "default" : "secondary"}>
                      {card.stats?.is_published ? "En circulación" : "Sin lanzar"}
                    </Badge>
                  </TableCell>
                  <TableCell>{card.format ?? "—"}</TableCell>
                  <TableCell>{card.uploaderName ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {(card.file_size / 1024 / 1024).toFixed(1)} MB
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

      {selected.size > 0 ? (
        <div className="sticky bottom-4 z-20 mx-auto flex w-fit items-center gap-3 rounded-full border bg-background/95 px-4 py-2 shadow-lg backdrop-blur">
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
