"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { requestDownloads } from "@/app/creative/actions";
import { downloadOne } from "@/lib/download";

export function DownloadButton({ creativeId }: { creativeId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <Button
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const [target] = await requestDownloads([creativeId]);
          if (!target) throw new Error("No se pudo generar la descarga.");
          downloadOne(target);
          // La descarga queda en el historial de abajo.
          router.refresh();
        } catch (error) {
          toast.error((error as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "Preparando…" : "Descargar"}
    </Button>
  );
}
