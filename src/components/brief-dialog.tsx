"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  saveBrief as saveBriefAction,
} from "@/app/(app)/client/brief-actions";
import {
  listTeam as listTeamAction,
  moveBrief as moveBriefAction,
  type TeamMember,
} from "@/app/(app)/client/assignment-actions";
import { CHANNELS, CHANNEL_LABEL, STAGES, type Channel, type OwnerField } from "@/lib/brief-flow";
import { ROLE_LABEL, type Role } from "@/lib/team";
import { unwrapped } from "@/lib/action-result";

// Las acciones regresan el error como dato; esto lo vuelve a lanzar con su mensaje real.
const saveBrief = unwrapped(saveBriefAction);
const listTeam = unwrapped(listTeamAction);
const moveBrief = unwrapped(moveBriefAction);

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
    docUrl: "",
    channel: "ads" as Channel,
  });
  const [owners, setOwners] = useState<Record<OwnerField, string>>({
    reviewer_id: "",
    producer_id: "",
    launcher_id: "",
  });
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (open) listTeam().then(setTeam).catch(() => setTeam([]));
  }, [open]);

  function crear(mandarARevision: boolean) {
    startTransition(async () => {
      if (!draft.clientId) {
        toast.error("Elige el cliente.");
        return;
      }
      try {
        const id = await saveBrief({
          clientId: draft.clientId,
          title: draft.title,
          docUrl: draft.docUrl,
          briefDate: draft.briefDate,
          channel: draft.channel,
          owners: {
            reviewer_id: owners.reviewer_id || null,
            producer_id: owners.producer_id || null,
            launcher_id: owners.launcher_id || null,
          },
        });

        if (mandarARevision) {
          try {
            await moveBrief(id, "en_revision");
            toast.success("Tarea creada y enviada a revisión");
          } catch (error) {
            // El brief ya existe; solo no se movio. Se dice, no se esconde.
            toast.warning(`Tarea creada en borrador: ${(error as Error).message}`);
          }
        } else {
          toast.success("Tarea guardada como borrador");
        }

        onOpenChange(false);
        router.push(`/client/${draft.clientId}`);
        router.refresh();
      } catch (error) {
        toast.error((error as Error).message);
      }
    });
  }

  if (!open) return null;

  // Portal: el sidebar tiene backdrop-blur, y un ancestro con filtro se vuelve
  // el marco de los `fixed`. Sin esto el dialogo se abre metido en el sidebar.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Nueva tarea"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:p-8"
      onClick={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
    >
      <div className="w-full max-w-2xl rounded-xl border bg-card p-5 shadow-2xl">
        <h2 className="mb-4 text-base font-semibold">Nueva tarea</h2>

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
            <Label>Canal</Label>
            <div role="radiogroup" className="flex gap-1.5">
              {CHANNELS.map((channel) => (
                <button
                  key={channel}
                  type="button"
                  role="radio"
                  aria-checked={draft.channel === channel}
                  onClick={() => setDraft({ ...draft, channel })}
                  className={`h-8 flex-1 rounded-md border text-sm transition-colors ${
                    draft.channel === channel
                      ? "border-primary bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {CHANNEL_LABEL[channel]}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="brief-doc">Link al Google Doc</Label>
            <Input
              id="brief-doc"
              type="url"
              inputMode="url"
              value={draft.docUrl}
              onChange={(event) => setDraft({ ...draft, docUrl: event.target.value })}
              placeholder="https://docs.google.com/document/d/…"
            />
            <p className="text-xs text-muted-foreground">
              Las instrucciones viven en el Doc, con tu plantilla. Revisa que diseño
              tenga acceso para verlo.
            </p>
          </div>

          {/* Quien sigue se dice de entrada: asi cada relevo avisa solo, sin
              que nadie tenga que acordarse de etiquetar a la siguiente persona. */}
          <div className="space-y-1.5">
            <Label>¿Quién se encarga?</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              {STAGES.map((stage) => (
                <label key={stage.field} className="space-y-1">
                  <span className="block text-xs text-muted-foreground">{stage.label}</span>
                  <select
                    value={owners[stage.field]}
                    onChange={(event) =>
                      setOwners({ ...owners, [stage.field]: event.target.value })
                    }
                    className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                  >
                    <option value="">Sin asignar</option>
                    {team.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name} · {ROLE_LABEL[member.role as Role] ?? member.role}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Los avisos van en orden: primero a quien revisa; al aprobar, a quien
              produce; al terminar, a quien lanza.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          {/* Con quien revisa elegido, crear ya es mandarlo: el primer aviso sale
              al crear, no cuando alguien se acuerde de volver a picarle. */}
          {owners.reviewer_id ? (
            <Button variant="outline" disabled={pending} onClick={() => crear(false)}>
              Guardar como borrador
            </Button>
          ) : null}
          <Button disabled={pending} onClick={() => crear(!!owners.reviewer_id)}>
            {pending ? "Guardando…" : owners.reviewer_id ? "Crear y mandar a revisión" : "Crear tarea"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
