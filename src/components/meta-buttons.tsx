"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setMetaAdAccount, syncClientNow } from "@/app/(app)/client/meta-actions";
import type { SyncReport } from "@/lib/meta-sync";

/**
 * Dos botones separados, como el diseño: META abre la configuración de la
 * cuenta y el rango; SYNC jala. Lo que se configura poco no debe ocupar
 * espacio permanente en la pantalla.
 */
export function MetaButtons({
  clientId,
  adAccountId,
  syncedAt,
}: {
  clientId: string;
  adAccountId: string | null;
  syncedAt: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(adAccountId ?? "");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [report, setReport] = useState<SyncReport | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function runSync() {
    startTransition(async () => {
      try {
        const result = await syncClientNow(
          clientId,
          since && until ? { since, until } : undefined,
        );
        setReport(result);
        if (result.error) toast.error(result.error);
        else
          toast.success(
            `${result.matched} anuncio${result.matched === 1 ? "" : "s"} enlazado${
              result.matched === 1 ? "" : "s"
            }`,
          );
        router.refresh();
      } catch (error) {
        toast.error((error as Error).message);
      }
    });
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          META
        </Button>
        <button
          type="button"
          disabled={pending || !adAccountId}
          onClick={runSync}
          title={adAccountId ? undefined : "Configura el ad account en META primero"}
          className="brand-gradient rounded-lg px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {pending ? "SYNC…" : "SYNC"}
        </button>
      </div>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Configuración de Meta"
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:p-8"
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className="w-full max-w-lg rounded-xl border bg-card p-5 shadow-2xl">
            <h2 className="text-base font-semibold">Cuenta de Meta</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              El token vive en el servidor. Aquí solo va el ad account, que no es secreto.
            </p>

            <div className="mt-4 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="ad-account">Ad account id</Label>
                <Input
                  id="ad-account"
                  value={value}
                  placeholder="act_123456789012345"
                  onChange={(event) => setValue(event.target.value)}
                  className="font-mono text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="since">Desde</Label>
                  <Input
                    id="since"
                    type="date"
                    value={since}
                    onChange={(event) => setSince(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="until">Hasta</Label>
                  <Input
                    id="until"
                    type="date"
                    value={until}
                    onChange={(event) => setUntil(event.target.value)}
                  />
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                {since && until
                  ? `SYNC va a jalar del ${since} al ${until}.`
                  : "Sin fechas, SYNC jala todo el histórico. Cada rango queda como su propio periodo, así que no los encimes."}
                {syncedAt
                  ? ` Último sync: ${new Date(syncedAt).toLocaleString("es-MX")}.`
                  : " Nunca sincronizado."}
              </p>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cerrar
              </Button>
              <Button
                disabled={pending || value === (adAccountId ?? "")}
                onClick={() =>
                  startTransition(async () => {
                    try {
                      await setMetaAdAccount(clientId, value);
                      toast.success("Cuenta guardada");
                      router.refresh();
                    } catch (error) {
                      toast.error((error as Error).message);
                    }
                  })
                }
              >
                Guardar
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {report ? (
        <div className="fixed bottom-4 right-4 z-40 max-w-sm rounded-xl border bg-card p-3 text-xs shadow-lg">
          <p className="text-muted-foreground">
            {report.range ? `${report.range.since} → ${report.range.until} · ` : "Histórico · "}
            {report.adsFound} anuncios · {report.matched} enlazados · {report.withMetrics} con
            métricas
          </p>
          {report.adsWithoutCode.length > 0 ? (
            <details className="mt-1">
              <summary className="cursor-pointer text-highlight">
                {report.adsWithoutCode.length} sin código en el nombre
              </summary>
              <ul className="mt-1 space-y-0.5 font-mono text-[11px] text-muted-foreground">
                {report.adsWithoutCode.map((name) => (
                  <li key={name} className="truncate">
                    {name}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          <button
            type="button"
            onClick={() => setReport(null)}
            className="mt-2 text-muted-foreground underline"
          >
            Cerrar
          </button>
        </div>
      ) : null}
    </>
  );
}
