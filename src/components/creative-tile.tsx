"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { formatMoney, formatPercent, statusOf, STATUS_LABEL } from "@/lib/metrics";
import type { CreativeCard } from "@/lib/creatives";

/**
 * Tarjeta del tablero. Chica a proposito: el thumbnail identifica, no luce.
 * Las acciones viven en el hover para no llenar la tarjeta de botones.
 */
export function CreativeTile({
  creative,
  selected,
  onToggle,
  onOpen,
  onDownload,
  onLaunch,
  busy,
}: {
  creative: CreativeCard;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onDownload: () => void;
  onLaunch: () => void;
  busy: boolean;
}) {
  const status = statusOf(creative.stats);
  const launched = status !== "sin-lanzar";
  const stats = creative.stats;

  return (
    <div className="group relative overflow-hidden rounded-lg border bg-card transition-colors hover:border-primary/40">
      {/* Un boton dentro de otro boton es HTML invalido y el parser lo saca de
          lugar: el area de abrir es una capa absoluta, no un wrapper. */}
      <div>
        <div className="relative aspect-[4/3] bg-muted">
          {creative.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={creative.previewUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              sin póster
            </div>
          )}

          {creative.media_type === "video" && creative.duration_seconds ? (
            <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1 py-0.5 font-mono text-[10px] text-white">
              {formatDuration(creative.duration_seconds)}
            </span>
          ) : null}

          {/* Acciones al pasar el cursor. En tactil no hay hover: el modal las repite. */}
          <div className="absolute inset-x-0 bottom-0 z-20 flex justify-end gap-1 bg-gradient-to-t from-black/75 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <TileAction
              label="Descargar"
              disabled={busy}
              onClick={onDownload}
              icon={
                <path
                  d="M12 3v12m0 0 4-4m-4 4-4-4M4 19h16"
                  stroke="currentColor"
                  strokeWidth="2"
                  fill="none"
                  strokeLinecap="round"
                />
              }
            />
            {!launched ? (
              <TileAction
                label="Marcar como lanzado"
                disabled={busy}
                onClick={onLaunch}
                icon={
                  <path
                    d="M5 12.5 10 17.5 19 6.5"
                    stroke="currentColor"
                    strokeWidth="2"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                }
              />
            ) : null}
          </div>
        </div>

        <div className="space-y-1.5 p-2.5">
          <p className="truncate text-xs font-medium" title={creative.display_name}>
            {creative.display_name}
          </p>

          {launched && stats ? (
            <dl className="flex items-baseline justify-between gap-2 font-mono text-[10px] text-muted-foreground">
              <QuickStat label="CTR" value={formatPercent(stats.ctr)} />
              <QuickStat label="Gasto" value={formatMoney(stats.total_spend)} />
              <QuickStat label="Clics" value={formatCount(stats.total_clicks)} />
            </dl>
          ) : (
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {creative.format ?? STATUS_LABEL[status]}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onOpen}
          aria-label={`Abrir ${creative.display_name}`}
          className="absolute inset-0 z-10 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
      </div>

      <label className="absolute left-2 top-2 z-20 flex cursor-pointer items-center rounded-md border border-white/15 bg-black/55 p-1 backdrop-blur-sm">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          aria-label={`Seleccionar ${creative.display_name}`}
        />
      </label>
    </div>
  );
}

function QuickStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="uppercase tracking-wider opacity-70">{label}</dt>
      <dd className="truncate tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

function TileAction({
  label,
  icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={(event) => {
        // La tarjeta entera abre el modal: no dejar que burbujee.
        event.stopPropagation();
        event.preventDefault();
        onClick();
      }}
      className="flex size-7 items-center justify-center rounded-md border border-white/20 bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80 disabled:opacity-50"
    >
      <svg viewBox="0 0 24 24" className="size-3.5" aria-hidden="true">
        {icon}
      </svg>
    </button>
  );
}

function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function formatCount(value: number | null): string {
  return value === null ? "—" : new Intl.NumberFormat("es-MX").format(value);
}
