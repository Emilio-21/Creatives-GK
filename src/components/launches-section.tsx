"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LaunchDialog } from "@/components/launch-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { deleteLaunch } from "@/app/creative/launch-actions";
import { derive, formatCount, formatMoney, formatPercent } from "@/lib/metrics";
import type { LaunchRow } from "@/lib/launches";

export function LaunchesSection({
  creativeId,
  launches,
}: {
  creativeId: string;
  launches: LaunchRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">
          Lanzamientos{launches.length > 0 ? ` (${launches.length})` : ""}
        </CardTitle>
        <LaunchDialog
          creativeId={creativeId}
          trigger={<Button size="sm">Registrar lanzamiento</Button>}
        />
      </CardHeader>

      <CardContent>
        {launches.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Este creativo nunca se ha lanzado.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Periodo</TableHead>
                  <TableHead>Campaña</TableHead>
                  <TableHead className="text-right">Gasto</TableHead>
                  <TableHead className="text-right">Impr.</TableHead>
                  <TableHead className="text-right">Clics</TableHead>
                  <TableHead className="text-right">CTR</TableHead>
                  <TableHead className="text-right">CPA</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {launches.map((launch) => {
                  const metrics = derive({
                    spend: launch.spend,
                    impressions: launch.impressions,
                    clicks: launch.clicks,
                    results: launch.results,
                  });
                  const active = !launch.ended_at || launch.ended_at >= today();

                  return (
                    <TableRow key={launch.id}>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(launch.launched_at)} →{" "}
                        {launch.ended_at ? (
                          formatDate(launch.ended_at)
                        ) : (
                          <span className="text-muted-foreground">al aire</span>
                        )}
                        {active ? null : (
                          <span className="ml-2 text-xs text-muted-foreground">terminado</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-40 truncate">
                        {launch.campaign_name ?? "—"}
                        {launch.adset_name ? (
                          <span className="block truncate text-xs text-muted-foreground">
                            {launch.adset_name}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(launch.spend)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCount(launch.impressions)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCount(launch.clicks)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPercent(metrics.ctr)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(metrics.cpa)}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <LaunchDialog
                          creativeId={creativeId}
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
                                await deleteLaunch(launch.id, creativeId);
                                toast.success("Lanzamiento borrado");
                                router.refresh();
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
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const today = () => new Date().toISOString().slice(0, 10);
const formatDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString("es-MX");
