"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setMetaAdAccount, syncClientNow } from "@/app/client/meta-actions";
import type { SyncReport } from "@/lib/meta-sync";

export function MetaPanel({
  clientId,
  adAccountId,
  syncedAt,
}: {
  clientId: string;
  adAccountId: string | null;
  syncedAt: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(adAccountId ?? "");
  const [report, setReport] = useState<SyncReport | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="rounded-xl border p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1 space-y-1.5">
          <label htmlFor="ad-account" className="text-xs text-muted-foreground">
            Ad account de Meta
          </label>
          <Input
            id="ad-account"
            value={value}
            placeholder="act_123456789012345"
            onChange={(event) => setValue(event.target.value)}
            className="font-mono text-sm"
          />
        </div>

        <Button
          size="sm"
          variant="outline"
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

        <Button
          size="sm"
          disabled={pending || !adAccountId}
          onClick={() =>
            startTransition(async () => {
              try {
                const result = await syncClientNow(clientId);
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
            })
          }
        >
          {pending ? "Sincronizando…" : "Sincronizar ahora"}
        </Button>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        {syncedAt
          ? `Último sync: ${new Date(syncedAt).toLocaleString("es-MX")}. `
          : "Nunca sincronizado. "}
        El token vive en el servidor, no aquí.
      </p>

      {report ? (
        <div className="mt-3 space-y-2 border-t pt-3 text-xs">
          <p className="text-muted-foreground">
            {report.adsFound} anuncios en la cuenta · {report.matched} enlazados ·{" "}
            {report.withMetrics} con métricas · {report.launchesWritten} lanzamientos
            escritos
          </p>
          {report.matched > report.withMetrics ? (
            <p className="text-muted-foreground">
              {report.matched - report.withMetrics} enlazado
              {report.matched - report.withMetrics === 1 ? "" : "s"} sin métricas todavía:
              son anuncios que aún no gastan.
            </p>
          ) : null}

          {report.adsWithoutCode.length > 0 ? (
            <details>
              <summary className="cursor-pointer text-highlight">
                {report.adsWithoutCode.length} anuncio
                {report.adsWithoutCode.length === 1 ? "" : "s"} sin código en el nombre
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

          {report.unknownCodes.length > 0 ? (
            <p className="text-muted-foreground">
              Códigos sin creativo aquí: {report.unknownCodes.join(", ")}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
