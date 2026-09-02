"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveBrief } from "@/app/client/brief-actions";

type ClientOption = { id: string; name: string };

/** Alta de brief. Vive en el sidebar: copy no entra por un cliente, entra a escribir. */
export function BriefDialog({
  clients,
  defaultClientId,
  open,
  onOpenChange,
}: {
  clients: ClientOption[];
  defaultClientId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState({
    title: "",
    clientId: defaultClientId ?? "",
    briefDate: new Date().toISOString().slice(0, 10),
    body: "",
  });
  const [pending, startTransition] = useTransition();

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Nuevo brief"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:p-8"
      onClick={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
    >
      <div className="w-full max-w-2xl rounded-xl border bg-card p-5 shadow-2xl">
        <h2 className="mb-4 text-base font-semibold">Nuevo brief</h2>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="brief-title">Título</Label>
            <Input
              id="brief-title"
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              placeholder="Ángulo dolor de espalda — septiembre"
              maxLength={140}
              autoFocus
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="brief-client">
                Cliente <span className="text-destructive">*</span>
              </Label>
              <select
                id="brief-client"
                value={draft.clientId}
                onChange={(event) => setDraft({ ...draft, clientId: event.target.value })}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <option value="">Elige un cliente…</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="brief-date">Fecha</Label>
              <Input
                id="brief-date"
                type="date"
                value={draft.briefDate}
                onChange={(event) => setDraft({ ...draft, briefDate: event.target.value })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="brief-body">Instrucciones</Label>
            <Textarea
              id="brief-body"
              rows={14}
              value={draft.body}
              onChange={(event) => setDraft({ ...draft, body: event.target.value })}
              placeholder={"Ángulo, promesa, hooks, CTA, referencias…\n\nLo que diseño necesita para producir el batch."}
              className="font-mono text-sm"
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                if (!draft.clientId) {
                  toast.error("Elige el cliente.");
                  return;
                }
                try {
                  await saveBrief({
                    clientId: draft.clientId,
                    title: draft.title,
                    body: draft.body,
                    briefDate: draft.briefDate,
                  });
                  toast.success("Brief creado");
                  onOpenChange(false);
                  router.push(`/client/${draft.clientId}`);
                  router.refresh();
                } catch (error) {
                  toast.error((error as Error).message);
                }
              })
            }
          >
            {pending ? "Guardando…" : "Crear brief"}
          </Button>
        </div>
      </div>
    </div>
  );
}
