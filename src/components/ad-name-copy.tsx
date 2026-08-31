"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { adNameFor } from "@/lib/ad-code";

/**
 * El nombre del anuncio lo genera la app, no la persona. Si la convención
 * dependiera de que alguien la recuerde, el match fallaría en silencio y el
 * dashboard quedaría en ceros sin que nadie se entere.
 */
export function AdNameCopy({
  creativeId,
  displayName,
}: {
  creativeId: string;
  displayName: string;
}) {
  const adName = adNameFor(creativeId, displayName);
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-1.5">
      <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        Nombre del anuncio en Meta
      </p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border bg-muted/50 px-2 py-1.5 font-mono text-xs">
          {adName}
        </code>
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(adName);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              toast.error("No se pudo copiar. Selecciónalo a mano.");
            }
          }}
        >
          {copied ? "Copiado" : "Copiar"}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Pégalo tal cual como nombre del ad. El código entre corchetes es lo que jala las
        métricas solo.
      </p>
    </div>
  );
}
