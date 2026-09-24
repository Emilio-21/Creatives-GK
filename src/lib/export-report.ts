"use client";

import { adCodeFor } from "@/lib/ad-code";
import { saveBlob } from "@/lib/download";
import { statusOf, STATUS_LABEL } from "@/lib/metrics";
import type { CreativeCard } from "@/lib/creatives";

/**
 * Informe de resultados en CSV, para mandarlo a copy.
 *
 * Se arma en el navegador con los datos que ya estan en pantalla: no hace falta
 * otra consulta al servidor.
 */
export function exportReportCsv(cards: CreativeCard[], filename: string): void {
  const headers = [
    "Creativo",
    "Batch",
    "Código de ad",
    "Estado",
    "Formato",
    "Archivos",
    "Lanzamientos",
    "Gasto",
    "Impresiones",
    "Clics",
    "Resultados",
    "CTR %",
    "CPC",
    "CPA",
    "Primer lanzamiento",
    "Último lanzamiento",
  ];

  const rows = cards.map((card) => [
    card.display_name,
    card.batchName ?? "",
    adCodeFor(card.id),
    STATUS_LABEL[statusOf(card.stats)],
    card.format ?? "",
    [card.aspect, ...card.variants.map((v) => v.aspect)].filter(Boolean).join(" + ") || "",
    card.stats?.launch_count ?? 0,
    card.stats?.total_spend ?? "",
    card.stats?.total_impressions ?? "",
    card.stats?.total_clicks ?? "",
    card.stats?.total_results ?? "",
    card.stats?.ctr ?? "",
    card.stats?.cpc ?? "",
    card.stats?.cpa ?? "",
    card.stats?.first_launched_at ?? "",
    card.stats?.last_launched_at ?? "",
  ]);

  // BOM para que Excel abra los acentos bien; sin el, "Diseño" sale roto.
  const csv =
    "﻿" +
    [headers, ...rows]
      .map((row) => row.map(escapeCell).join(","))
      .join("\r\n");

  saveBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), filename);
}

function escapeCell(value: string | number): string {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
