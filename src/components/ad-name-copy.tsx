"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { adCodeFor, adNameFor } from "@/lib/ad-code";

/**
 * El nombre del anuncio lo genera la app, no la persona. Si la convención
 * dependiera de que alguien la recuerde, el match fallaría en silencio y el
 * dashboard quedaría en ceros sin que nadie se entere.
 *
 * El código va aparte porque el nombre completo es largo: muchas veces el ad
 * ya tiene su nombre en Meta y solo hace falta agregarle el código. Se copia
 * con corchetes porque así es como el sync lo reconoce (extractAdCode).
 */
export function AdNameCopy({
  creativeId,
  displayName,
}: {
  creativeId: string;
  displayName: string;
}) {
  return (
    <div className="space-y-1.5">
      <p className="font-mono text-xs text-muted-foreground">Nombre del anuncio en Meta</p>
      <CopyRow value={adNameFor(creativeId, displayName)} label="Copiar nombre completo" />
      <p className="pt-1 font-mono text-xs text-muted-foreground">Solo el código</p>
      <CopyRow value={`[${adCodeFor(creativeId)}]`} label="Copiar código" compact />
      <p className="text-[11px] text-muted-foreground">
        Pega el nombre completo, o agrega solo el código al nombre que ya tiene el ad. El código
        entre corchetes es lo que jala las métricas solo.
      </p>
    </div>
  );
}

function CopyRow({ value, label, compact = false }: { value: string; label: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <code
        className={`min-w-0 truncate rounded-md border bg-muted/50 px-2 py-1.5 font-mono text-xs ${
          compact ? "" : "flex-1"
        }`}
        title={value}
      >
        {value}
      </code>
      <Button
        size="sm"
        variant="outline"
        aria-label={label}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
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
  );
}
