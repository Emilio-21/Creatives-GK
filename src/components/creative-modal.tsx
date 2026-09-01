"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AdNameCopy } from "@/components/ad-name-copy";
import { ArchiveButton } from "@/components/archive-button";
import { LaunchDialog } from "@/components/launch-dialog";
import { MetadataEditor } from "@/components/metadata-editor";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { deleteLaunch } from "@/app/creative/launch-actions";
import { deleteCreative } from "@/app/creative/creative-actions";
import { getCreativeDetail, type CreativeDetail } from "@/app/creative/detail-actions";
import { derive, formatMoney, formatPercent, statusOf, STATUS_LABEL } from "@/lib/metrics";
import { formatCount } from "@/lib/metrics";

/**
 * El detalle vive en un modal: abrir un creativo no debe costar una navegación.
 * El estado de apertura es interno y va con su DialogTrigger, igual que
 * LaunchDialog: controlarlo desde fuera no monta el popup en esta versión.
 */
export function CreativeModal({
  creativeId,
  open,
  onOpenChange,
  onDownload,
  onDeleted,
}: {
  creativeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDownload: (id: string) => void;
  onDeleted: () => void;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<CreativeDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) {
      setEditing(false);
      return;
    }
    let cancelled = false;
    getCreativeDetail(creativeId)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((error: Error) => {
        toast.error(error.message);
        onOpenChange(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, creativeId, onOpenChange]);

  const reload = () => {
    getCreativeDetail(creativeId).then(setDetail).catch(() => {});
    router.refresh();
  };

  // Cerrar con Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Detalle del creativo"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:p-8"
      onClick={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
    >
      <div className="relative w-full max-w-4xl rounded-xl border bg-card p-5 shadow-2xl">
        <button
          type="button"
          aria-label="Cerrar"
          onClick={() => onOpenChange(false)}
          className="absolute right-3 top-3 z-10 flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          ✕
        </button>
        {!detail ? (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            Cargando…
          </div>
        ) : (
          <>
            <h2 className="mb-4 break-all pr-8 text-base font-semibold">
              {detail.creative.display_name}
            </h2>

            <div className="grid gap-5 md:grid-cols-[minmax(0,320px)_1fr]">
              <div className="space-y-3">
                <div className="overflow-hidden rounded-lg border bg-muted">
                  {detail.creative.media_type === "video" ? (
                    <video
                      src={detail.mediaUrl}
                      poster={detail.posterUrl ?? undefined}
                      controls
                      preload="none"
                      className="max-h-[46vh] w-full"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={detail.mediaUrl}
                      alt={detail.creative.display_name}
                      className="max-h-[46vh] w-full object-contain"
                    />
                  )}
                </div>

                <AdNameCopy
                  creativeId={detail.creative.id}
                  displayName={detail.creative.display_name}
                />

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => onDownload(detail.creative.id)}>
                    Descargar
                  </Button>
                  <LaunchDialog
                    creativeId={detail.creative.id}
                    trigger={
                      <Button size="sm" variant="outline">
                        Registrar lanzamiento
                      </Button>
                    }
                  />
                  <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)}>
                    {editing ? "Cancelar" : "Editar"}
                  </Button>
                  <ArchiveButton
                    creativeId={detail.creative.id}
                    archived={detail.creative.archived_at !== null}
                  />
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={pending}
                    onClick={() => {
                      const count = detail.launches.length;
                      const warning =
                        count > 0
                          ? `\n\nOjo: también se borran sus ${count} lanzamiento${
                              count === 1 ? "" : "s"
                            } con sus métricas.`
                          : "";
                      if (
                        !confirm(
                          `¿Borrar "${detail.creative.display_name}"?\n\nSe borra el archivo de R2 y no se puede deshacer.${warning}\n\nSi solo quieres sacarlo de la biblioteca, archívalo.`,
                        )
                      ) {
                        return;
                      }
                      startTransition(async () => {
                        try {
                          await deleteCreative(detail.creative.id);
                          toast.success("Creativo borrado");
                          onDeleted();
                          router.refresh();
                        } catch (error) {
                          toast.error((error as Error).message);
                        }
                      });
                    }}
                  >
                    Borrar
                  </Button>
                </div>
              </div>

              <div className="min-w-0 space-y-5">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full border px-2 py-0.5 text-muted-foreground">
                    {STATUS_LABEL[statusOf(detail.stats)]}
                  </span>
                  {detail.clientName ? (
                    <span className="rounded-full border px-2 py-0.5 text-muted-foreground">
                      {detail.clientName}
                    </span>
                  ) : null}
                  {detail.creative.format ? (
                    <span className="rounded-full border px-2 py-0.5 font-mono text-muted-foreground">
                      {detail.creative.format}
                    </span>
                  ) : null}
                  {detail.creative.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border px-2 py-0.5 text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                {editing ? (
                  <MetadataEditor
                    creativeId={detail.creative.id}
                    displayName={detail.creative.display_name}
                    concept={detail.creative.concept}
                    format={detail.creative.format}
                    tags={detail.creative.tags}
                    notes={detail.creative.notes}
                    onDone={() => {
                      setEditing(false);
                      reload();
                    }}
                  />
                ) : (
                  <>
                    {detail.stats && detail.stats.launch_count > 0 ? (
                      <div>
                        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                          Acumulado · {detail.stats.launch_count} lanzamiento
                          {detail.stats.launch_count === 1 ? "" : "s"}
                        </p>
                        <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
                          <Metric label="Gasto" value={formatMoney(detail.stats.total_spend)} />
                          <Metric label="CPA" value={formatMoney(detail.stats.cpa)} />
                          <Metric label="CTR" value={formatPercent(detail.stats.ctr)} />
                          <Metric label="Clics" value={formatCount(detail.stats.total_clicks)} />
                        </div>
                      </div>
                    ) : null}

                    {detail.creative.notes ? (
                      <p className="whitespace-pre-wrap text-sm">{detail.creative.notes}</p>
                    ) : null}

                    <div>
                      <p className="mb-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                        Lanzamientos
                      </p>
                      {detail.launches.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Nunca se ha lanzado.
                        </p>
                      ) : (
                        <div className="overflow-x-auto rounded-lg border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs uppercase tracking-wider">
                                  Periodo
                                </TableHead>
                                <TableHead className="text-xs uppercase tracking-wider">
                                  Campaña
                                </TableHead>
                                <TableHead className="text-right text-xs uppercase tracking-wider">
                                  Gasto
                                </TableHead>
                                <TableHead className="text-right text-xs uppercase tracking-wider">
                                  CTR
                                </TableHead>
                                <TableHead />
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {detail.launches.map((launch) => (
                                <TableRow key={launch.id}>
                                  <TableCell className="whitespace-nowrap text-xs">
                                    {formatDate(launch.launched_at)} →{" "}
                                    {launch.ended_at ? (
                                      formatDate(launch.ended_at)
                                    ) : (
                                      <span className="text-muted-foreground">al aire</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="max-w-32 truncate text-xs">
                                    {launch.campaign_name ?? "—"}
                                  </TableCell>
                                  <TableCell className="text-right text-xs tabular-nums">
                                    {formatMoney(launch.spend)}
                                  </TableCell>
                                  <TableCell className="text-right text-xs tabular-nums">
                                    {formatPercent(
                                      derive({
                                        spend: launch.spend,
                                        impressions: launch.impressions,
                                        clicks: launch.clicks,
                                        results: launch.results,
                                      }).ctr,
                                    )}
                                  </TableCell>
                                  <TableCell className="whitespace-nowrap text-right">
                                    <LaunchDialog
                                      creativeId={detail.creative.id}
                                      launch={launch}
                                      trigger={
                                        <Button size="xs" variant="ghost">
                                          Editar
                                        </Button>
                                      }
                                    />
                                    <Button
                                      size="xs"
                                      variant="ghost"
                                      disabled={pending}
                                      onClick={() => {
                                        if (!confirm("¿Borrar este lanzamiento?")) return;
                                        startTransition(async () => {
                                          try {
                                            await deleteLaunch(launch.id, detail.creative.id);
                                            toast.success("Lanzamiento borrado");
                                            reload();
                                          } catch (error) {
                                            toast.error((error as Error).message);
                                          }
                                        });
                                      }}
                                    >
                                      Borrar
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

const formatDate = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString("es-MX");
