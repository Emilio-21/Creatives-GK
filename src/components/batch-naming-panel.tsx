"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getBatchCreatives,
  getBatchNaming,
  setBatchNaming,
  type BatchNamingInput,
} from "@/app/(app)/client/batch-actions";
import { adName, adsetName, campaignName } from "@/lib/naming";

type Creativo = { id: string; displayName: string };

/**
 * Los tres nombres de Meta, listos para copiar.
 *
 * El consecutivo del anuncio lo lleva la app sobre el orden de alta de los
 * creativos, no sobre el orden de la vista: si dependiera del filtro de
 * pantalla, cambiar de "mas recientes" a "nombre" renumeraria los anuncios.
 */
export function BatchNamingPanel({
  batchId,
  onClose,
}: {
  batchId: string;
  onClose: () => void;
}) {
  const [naming, setNaming] = useState<(BatchNamingInput & { name: string }) | null>(null);
  const [creativos, setCreativos] = useState<Creativo[]>([]);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    Promise.all([getBatchNaming(batchId), getBatchCreatives(batchId)])
      .then(([n, c]) => {
        setNaming(n);
        setCreativos(c);
      })
      .catch((error: Error) => {
        toast.error(error.message);
        onClose();
      });
  }, [batchId, onClose]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const campaña = naming ? campaignName(naming) : null;
  const adset = naming ? adsetName(naming) : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Nomenclatura del batch"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:p-8"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-3xl rounded-xl border bg-card p-5 shadow-2xl">
        <button
          type="button"
          aria-label="Cerrar"
          onClick={onClose}
          className="absolute right-3 top-3 flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          ✕
        </button>

        {!naming ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>
        ) : (
          <>
            <h2 className="pr-8 text-base font-semibold">Nomenclatura · {naming.name}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Un batch es un ad set. Llena esto una vez y copia los nombres de los tres
              niveles.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field
                label="Código de campaña"
                placeholder="C020"
                value={naming.campaignCode ?? ""}
                onChange={(v) => setNaming({ ...naming, campaignCode: v })}
              />
              <Field
                label="Código de ad set"
                placeholder="A01"
                value={naming.adsetCode ?? ""}
                onChange={(v) => setNaming({ ...naming, adsetCode: v })}
              />
              <Field
                label="Resto del nombre de campaña"
                placeholder="VSL | Testing | Broad | CBO"
                value={naming.campaignLabel ?? ""}
                onChange={(v) => setNaming({ ...naming, campaignLabel: v })}
              />
              <Field
                label="Resto del nombre de ad set"
                placeholder="Broad | MF | 30-65+ | USA | FB-IG-NoAN"
                value={naming.adsetLabel ?? ""}
                onChange={(v) => setNaming({ ...naming, adsetLabel: v })}
              />
              <div className="sm:col-span-2">
                <Field
                  label="Resto del nombre de los anuncios"
                  placeholder="VSL | Copy 01.1 | Intro 1.1"
                  value={naming.adLabel ?? ""}
                  onChange={(v) => setNaming({ ...naming, adLabel: v })}
                />
              </div>
            </div>

            <Button
              size="sm"
              className="mt-3"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  try {
                    await setBatchNaming(batchId, naming);
                    toast.success("Nomenclatura guardada");
                  } catch (error) {
                    toast.error((error as Error).message);
                  }
                })
              }
            >
              {pending ? "Guardando…" : "Guardar"}
            </Button>

            <div className="mt-6 space-y-4 border-t pt-4">
              <Copiable etiqueta="Campaña" valor={campaña} />
              <Copiable etiqueta="Ad set" valor={adset} />

              <div>
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                    Anuncios · {creativos.length}
                  </p>
                  {creativos.length > 0 ? (
                    <CopiarTodos
                      lineas={creativos.map((c, i) => adName(naming, c.id, i))}
                    />
                  ) : null}
                </div>

                {creativos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Este batch todavía no tiene creativos.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {creativos.map((creativo, index) => (
                      <li key={creativo.id}>
                        <Copiable
                          etiqueta={creativo.displayName}
                          valor={adName(naming, creativo.id, index)}
                          compacta
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="font-mono text-sm"
      />
    </div>
  );
}

function Copiable({
  etiqueta,
  valor,
  compacta,
}: {
  etiqueta: string;
  valor: string | null;
  compacta?: boolean;
}) {
  const [copiado, setCopiado] = useState(false);

  return (
    <div className={compacta ? "" : "space-y-1.5"}>
      {!compacta ? (
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          {etiqueta}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <code
          className="min-w-0 flex-1 truncate rounded-md border bg-muted/40 px-2 py-1.5 font-mono text-xs"
          title={compacta ? etiqueta : undefined}
        >
          {valor ?? "Falta el código de campaña"}
        </code>
        <Button
          size="sm"
          variant="outline"
          disabled={!valor}
          onClick={async () => {
            if (!valor) return;
            try {
              await navigator.clipboard.writeText(valor);
              setCopiado(true);
              setTimeout(() => setCopiado(false), 1500);
            } catch {
              toast.error("No se pudo copiar.");
            }
          }}
        >
          {copiado ? "Copiado" : "Copiar"}
        </Button>
      </div>
    </div>
  );
}

function CopiarTodos({ lineas }: { lineas: string[] }) {
  const [copiado, setCopiado] = useState(false);

  return (
    <Button
      size="xs"
      variant="ghost"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(lineas.join("\n"));
          setCopiado(true);
          setTimeout(() => setCopiado(false), 1500);
        } catch {
          toast.error("No se pudo copiar.");
        }
      }}
    >
      {copiado ? "Copiados" : "Copiar todos"}
    </Button>
  );
}
