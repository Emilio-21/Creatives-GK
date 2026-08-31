"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MonthlyProduction } from "@/lib/dashboard";

/**
 * Una sola serie: un solo color, sin leyenda (el titulo la nombra). El color es
 * --primary, que es casi negro en claro y casi blanco en oscuro, asi que
 * contrasta en los dos temas; los tokens --chart-* de este tema no se invierten.
 */
export function ProductionChart({ data }: { data: MonthlyProduction[] }) {
  const max = Math.max(...data.map((entry) => entry.count), 0);

  return (
    <div className="space-y-3">
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 16, right: 4, bottom: 0, left: -20 }}>
            <CartesianGrid
              vertical={false}
              stroke="var(--border)"
              strokeDasharray="3 3"
            />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              width={40}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)" }}
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                color: "var(--popover-foreground)",
                fontSize: 12,
              }}
              labelFormatter={(label) => `Mes de ${label}`}
              formatter={(value) => {
                const count = Number(value ?? 0);
                return [`${count} creativo${count === 1 ? "" : "s"}`, "Producción"];
              }}
            />
            <Bar dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={36}>
              {/* Etiqueta solo en el mes mas alto, no un numero sobre cada barra. */}
              <LabelList
                dataKey="count"
                position="top"
                fill="var(--muted-foreground)"
                fontSize={11}
                formatter={(value) => {
                  const count = Number(value ?? 0);
                  return count === max && count > 0 ? String(count) : "";
                }}
              />
              {data.map((entry) => (
                <Cell key={entry.month} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-xs text-muted-foreground">
          Ver los datos como tabla
        </summary>
        <table className="mt-2 w-full text-xs">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 font-medium">Mes</th>
              <th className="py-1 text-right font-medium">Creativos</th>
            </tr>
          </thead>
          <tbody>
            {data.map((entry) => (
              <tr key={entry.month}>
                <td className="py-0.5">{entry.month}</td>
                <td className="py-0.5 text-right tabular-nums">{entry.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
