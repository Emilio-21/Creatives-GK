/**
 * CTR, CPM, CPC y CPA se calculan, nunca se capturan (§3.4). Estas son las
 * mismas formulas de la vista `creative_stats`, para poder mostrarlas en vivo
 * mientras se escribe el formulario.
 */
export type BaseMetrics = {
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  results: number | null;
};

export type DerivedMetrics = {
  ctr: number | null;
  cpm: number | null;
  cpc: number | null;
  cpa: number | null;
};

export function derive({ spend, impressions, clicks, results }: BaseMetrics): DerivedMetrics {
  return {
    ctr: impressions && impressions > 0 && clicks !== null ? (clicks / impressions) * 100 : null,
    cpm: impressions && impressions > 0 && spend !== null ? (spend / impressions) * 1000 : null,
    cpc: clicks && clicks > 0 && spend !== null ? spend / clicks : null,
    cpa: results && results > 0 && spend !== null ? spend / results : null,
  };
}

export function formatPercent(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(2)}%`;
}

export function formatMoney(value: number | null): string {
  return value === null
    ? "—"
    : new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "MXN",
        maximumFractionDigits: 2,
      }).format(value);
}

export function formatCount(value: number | null): string {
  return value === null ? "—" : new Intl.NumberFormat("es-MX").format(value);
}

export type CreativeStatus =
  | "sin-lanzar"
  | "en-circulacion"
  | "pausado"
  | "finalizado";

/**
 * Pausado va antes que finalizado, y en circulacion antes que pausado.
 *
 * Un creativo puede tener varios lanzamientos a la vez: si alguno sigue
 * gastando, el creativo esta en circulacion aunque otro este apagado. Solo
 * cuando NINGUNO gasta y queda al menos uno pausado, el creativo es "pausado":
 * dejo de entregar pero no termino, y se puede reanudar.
 */
export function statusOf(stats: {
  launch_count?: number | null;
  active_launch_count?: number | null;
  paused_launch_count?: number | null;
} | null): CreativeStatus {
  if (!stats || !stats.launch_count) return "sin-lanzar";
  if ((stats.active_launch_count ?? 0) > 0) return "en-circulacion";
  if ((stats.paused_launch_count ?? 0) > 0) return "pausado";
  return "finalizado";
}

export const STATUS_LABEL: Record<CreativeStatus, string> = {
  "sin-lanzar": "Sin lanzar",
  "en-circulacion": "En circulación",
  pausado: "Pausado",
  finalizado: "Finalizado",
};
