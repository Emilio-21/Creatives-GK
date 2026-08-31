"use client";

import { useState } from "react";
import Link from "next/link";
import { ProductionChart } from "@/components/production-chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney, formatPercent } from "@/lib/metrics";
import type { MonthlyProduction, StaleEntry, TopEntry } from "@/lib/dashboard";

/**
 * Los mismos bloques del resumen general, pero del cliente. Van plegados: la
 * pantalla del cliente es para ver archivos, los numeros son el segundo paso.
 */
export function ClientInsights({
  topByCpa,
  topByCtr,
  stale,
  monthly,
}: {
  topByCpa: TopEntry[];
  topByCtr: TopEntry[];
  stale: StaleEntry[];
  monthly: MonthlyProduction[];
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Ver detalle del cliente
      </Button>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <TopList
          title="Mejor CPA"
          description="Los más baratos por resultado."
          entries={topByCpa}
          format={formatMoney}
        />
        <TopList
          title="Mejor CTR"
          description="Los que más clics sacan por impresión."
          entries={topByCtr}
          format={formatPercent}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Producción por mes</CardTitle>
            <CardDescription>Últimos 12 meses de este cliente.</CardDescription>
          </CardHeader>
          <CardContent>
            <ProductionChart data={monthly} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Más de 30 días sin lanzarse</CardTitle>
            <CardDescription>Inventario olvidado de este cliente.</CardDescription>
          </CardHeader>
          <CardContent>
            {stale.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nada olvidado.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {stale.map((entry) => (
                  <li key={entry.id} className="flex items-baseline gap-3">
                    <Link
                      href={`/creative/${entry.id}`}
                      className="min-w-0 flex-1 truncate hover:underline"
                      title={entry.displayName}
                    >
                      {entry.displayName}
                    </Link>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {entry.lastLaunchedAt
                        ? `${entry.daysIdle} d sin relanzarse`
                        : `${entry.daysIdle} d sin estrenarse`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
        Ocultar detalle
      </Button>
    </div>
  );
}

function TopList({
  title,
  description,
  entries,
  format,
}: {
  title: string;
  description: string;
  entries: TopEntry[];
  format: (value: number | null) => string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no hay lanzamientos con esta métrica.
          </p>
        ) : (
          <ol className="space-y-2 text-sm">
            {entries.map((entry, index) => (
              <li key={entry.id} className="flex items-baseline gap-3">
                <span className="w-4 shrink-0 text-xs tabular-nums text-muted-foreground">
                  {index + 1}
                </span>
                <Link
                  href={`/creative/${entry.id}`}
                  className="min-w-0 flex-1 truncate hover:underline"
                  title={entry.displayName}
                >
                  {entry.displayName}
                </Link>
                <span className="shrink-0 tabular-nums">{format(entry.value)}</span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
