import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ProductionChart } from "@/components/production-chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getDashboard,
  R2_LIMIT_BYTES,
  R2_WARN_BYTES,
  type StaleEntry,
  type TopEntry,
} from "@/lib/dashboard";
import { formatMoney, formatPercent } from "@/lib/metrics";
import { createClient, type Profile } from "@/lib/supabase/server";

export const metadata = { title: "Resumen · Creativos" };

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, data] = await Promise.all([
    supabase.from("profiles").select("id, full_name, role, created_at").eq("id", user.id).single(),
    getDashboard(),
  ]);

  return (
    <AppShell profile={(profile as Profile) ?? null} email={user.email ?? ""} activeSection="dashboard">
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Resumen</h1>
          <p className="text-sm text-muted-foreground">
            Qué hay, qué se quemó y qué nunca salió al aire.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi label="Creativos" value={String(data.kpis.total)} />
          <Kpi
            label="Lanzados"
            value={`${data.kpis.launchedPercent}%`}
            hint={`${data.kpis.launched} de ${data.kpis.total}`}
          />
          <Kpi
            label="Sin lanzar"
            value={String(data.kpis.unlaunched)}
            hint="Inventario que nunca salió"
            emphasis
          />
          <Kpi
            label="Gasto del mes"
            value={formatMoney(data.kpis.monthSpend)}
            hint="Lanzamientos iniciados este mes"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Producción por mes</CardTitle>
              <CardDescription>Creativos subidos en los últimos 12 meses.</CardDescription>
            </CardHeader>
            <CardContent>
              <ProductionChart data={data.monthly} />
            </CardContent>
          </Card>

          <StorageCard usage={data.storage} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <TopCard
            title="Mejor CPA"
            description="Los 10 más baratos por resultado."
            entries={data.topByCpa}
            format={(value) => formatMoney(value)}
          />
          <TopCard
            title="Mejor CTR"
            description="Los 10 que más clics sacan por impresión."
            entries={data.topByCtr}
            format={(value) => formatPercent(value)}
          />
        </div>

        <StaleCard entries={data.stale} />
      </div>
    </AppShell>
  );
}

function Kpi({
  label,
  value,
  hint,
  emphasis,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
}) {
  return (
    <Card className={emphasis ? "border-foreground/25" : undefined}>
      <CardContent className="pt-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function StorageCard({ usage }: { usage: { bytes: number; objects: number } | null }) {
  if (!usage) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Uso de R2</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No se pudo leer el bucket.</p>
        </CardContent>
      </Card>
    );
  }

  const gb = usage.bytes / 1024 ** 3;
  // Con 900 MB, "0.00 GB" se lee como si el bucket estuviera vacio.
  const used =
    gb >= 1 ? `${gb.toFixed(2)} GB` : `${(usage.bytes / 1024 ** 2).toFixed(0)} MB`;
  const percent = Math.min(100, (usage.bytes / R2_LIMIT_BYTES) * 100);
  const warning = usage.bytes >= R2_WARN_BYTES;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Uso de R2</CardTitle>
        <CardDescription>{usage.objects} objetos almacenados.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-3xl font-semibold tabular-nums">
          {used}
          <span className="text-base font-normal text-muted-foreground"> / 10 GB</span>
        </p>
        <div
          className="h-2 w-full overflow-hidden rounded bg-muted"
          role="meter"
          aria-valuenow={Number(percent.toFixed(1))}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Uso del bucket de R2"
        >
          <div
            className={`h-full ${warning ? "bg-destructive" : "bg-primary"}`}
            style={{ width: `${Math.max(percent, 0.5)}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {warning
            ? "Atención: pasaste los 8 GB. Archiva creativos viejos o considera pagar (100 GB ≈ $1.50/mes)."
            : `${percent.toFixed(1)}% del free tier. El límite es acumulado, no mensual.`}
        </p>
      </CardContent>
    </Card>
  );
}

function TopCard({
  title,
  description,
  entries,
  format,
}: {
  title: string;
  description: string;
  entries: TopEntry[];
  format: (value: number) => string;
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
                  {entry.clientName ? (
                    <span className="text-muted-foreground"> · {entry.clientName}</span>
                  ) : null}
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

function StaleCard({ entries }: { entries: StaleEntry[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Más de 30 días sin lanzarse</CardTitle>
        <CardDescription>
          Inventario olvidado: nunca salió, o su último lanzamiento ya tiene rato.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nada olvidado. Buen síntoma.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-baseline gap-3">
                <Link
                  href={`/creative/${entry.id}`}
                  className="min-w-0 flex-1 truncate hover:underline"
                  title={entry.displayName}
                >
                  {entry.displayName}
                  {entry.clientName ? (
                    <span className="text-muted-foreground"> · {entry.clientName}</span>
                  ) : null}
                </Link>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {entry.lastLaunchedAt
                    ? `${entry.daysIdle} días sin relanzarse`
                    : `${entry.daysIdle} días sin estrenarse`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
