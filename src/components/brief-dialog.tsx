"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  requestCopy as requestCopyAction,
  saveBrief as saveBriefAction,
} from "@/app/(app)/client/brief-actions";
import {
  listTeam as listTeamAction,
  moveBrief as moveBriefAction,
  type TeamMember,
} from "@/app/(app)/client/assignment-actions";
import {
  CHANNELS,
  CHANNEL_LABEL,
  hasProduction,
  STATUS_LABEL,
  stagesFor,
  type Channel,
  type OwnerField,
} from "@/lib/brief-flow";
import { roleLabel } from "@/lib/roles";
import { unwrapped } from "@/lib/action-result";
import { today } from "@/lib/dates";
import { announceTasksChanged } from "@/lib/task-events";
import { Modal } from "@/components/modal";

// Las acciones regresan el error como dato; esto lo vuelve a lanzar con su mensaje real.
const requestCopy = unwrapped(requestCopyAction);
const saveBrief = unwrapped(saveBriefAction);
const listTeam = unwrapped(listTeamAction);
const moveBrief = unwrapped(moveBriefAction);

type ClientOption = { id: string; name: string };

/** A donde llega al mandarla: revisión, o la de despues si quien escribe revisa. */
const ETAPA: Partial<Record<string, string>> = {
  en_revision: "revisión",
  en_produccion: "producción",
  en_lanzamiento: "lanzamiento",
};
type Modo = "pedir" | "completa";

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/**
 * Alta de tarea, desde la barra lateral. Dos entradas:
 *
 * - Pedir copy: cualquiera dice que necesita (cliente, que, una nota, a quien).
 *   Copy recibe el pedido y ahi define todo.
 * - Tarea completa: copy la arma directo, con canal, Doc, angulo y responsables.
 *
 * Copy abre en "Tarea completa"; los demas, en "Pedir copy".
 */
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
  const [modoElegido, setModo] = useState<Modo | null>(null);
  const [clientId, setClientId] = useState(defaultClientId ?? "");
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [pending, startTransition] = useTransition();

  // Pedir copy
  const [pedido, setPedido] = useState({ title: "", note: "", dueDate: "", writerId: "" });

  // Tarea completa
  const [draft, setDraft] = useState({
    title: "",
    angle: "",
    briefDate: today(),
    docUrl: "",
    channel: "ads" as Channel,
  });
  const [owners, setOwners] = useState<Record<Exclude<OwnerField, "writer_id">, string>>({
    reviewer_id: "",
    producer_id: "",
    launcher_id: "",
  });

  useEffect(() => {
    if (open) listTeam().then(setTeam).catch(() => setTeam([]));
  }, [open]);

  const yo = team.find((member) => member.isMe);
  const modo: Modo = modoElegido ?? (yo?.role === "copy" ? "completa" : "pedir");
  // A quien se le pide por defecto: la primera persona de copy.
  const writerId = pedido.writerId || team.find((member) => member.role === "copy")?.id || "";

  function terminar() {
    onOpenChange(false);
    // Si ya estas en ese cliente, su lista se recarga sola con la tarea nueva.
    announceTasksChanged(clientId);
    router.push(`/client/${clientId}`);
    router.refresh();
  }

  function pedir() {
    startTransition(async () => {
      if (!clientId) {
        toast.error("Elige el cliente.");
        return;
      }
      try {
        await requestCopy({
          clientId,
          title: pedido.title,
          note: pedido.note || null,
          dueDate: pedido.dueDate || null,
          writerId,
        });
        const quien = team.find((member) => member.id === writerId);
        toast.success(quien && !quien.isMe ? `Pedido a ${quien.name}` : "Pedido creado");
        terminar();
      } catch (error) {
        toast.error((error as Error).message);
      }
    });
  }

  function crear(mandar: boolean) {
    startTransition(async () => {
      if (!clientId) {
        toast.error("Elige el cliente.");
        return;
      }
      try {
        const id = await saveBrief({
          clientId,
          title: draft.title,
          angle: draft.angle,
          docUrl: draft.docUrl,
          briefDate: draft.briefDate,
          channel: draft.channel,
          owners: {
            reviewer_id: owners.reviewer_id || null,
            // Email y mensaje son solo copy: no pasan por producción.
            producer_id: (hasProduction(draft.channel) && owners.producer_id) || null,
            launcher_id: owners.launcher_id || null,
          },
        });

        if (mandar) {
          try {
            // Si revisas tu propio copy, la base se salta la revisión y dice a donde fue.
            const estado = await moveBrief(id, "en_revision");
            toast.success(`Tarea creada y mandada a ${ETAPA[estado] ?? STATUS_LABEL[estado]}`);
          } catch (error) {
            // La tarea ya existe; solo no se movio. Se dice, no se esconde.
            toast.warning(`Tarea creada, sigue en copy: ${(error as Error).message}`);
          }
        } else {
          toast.success("Tarea creada; sigue en copy contigo");
        }
        terminar();
      } catch (error) {
        toast.error((error as Error).message);
      }
    });
  }

  if (!open) return null;

  // Responsables despues de copy (copy es quien la crea). Aprobación no tiene:
  // la dan quien revisa y quien lanza.
  const etapas = stagesFor(draft.channel).flatMap((stage) =>
    stage.field && stage.field !== "writer_id" ? [{ field: stage.field, label: stage.label }] : [],
  );

  const cliente = (
    <div className="space-y-1.5">
      <Label htmlFor="brief-client">
        Cliente <span className="text-destructive">*</span>
      </Label>
      <select
        id="brief-client"
        value={clientId}
        onChange={(event) => setClientId(event.target.value)}
        className={SELECT_CLASS}
      >
        <option value="">Elige un cliente…</option>
        {clients.map((client) => (
          <option key={client.id} value={client.id}>
            {client.name}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <Modal label="Nueva tarea" onClose={() => onOpenChange(false)} className="max-w-2xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Nueva tarea</h2>
        <div role="tablist" className="flex rounded-lg border p-0.5 text-sm">
          {(
            [
              ["pedir", "Pedir copy"],
              ["completa", "Tarea completa"],
            ] as const
          ).map(([valor, texto]) => (
            <button
              key={valor}
              type="button"
              role="tab"
              aria-selected={modo === valor}
              onClick={() => setModo(valor)}
              className={`rounded-md px-3 py-1 transition-colors ${
                modo === valor ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {texto}
            </button>
          ))}
        </div>
      </div>

      {modo === "pedir" ? (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Solo di qué necesitas. Copy define el canal, el Doc, el ángulo y quién sigue.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="pedido-title">¿Qué se necesita?</Label>
            <Input
              id="pedido-title"
              value={pedido.title}
              onChange={(event) => setPedido({ ...pedido, title: event.target.value })}
              placeholder="Copy para la promo de octubre"
              maxLength={140}
              autoFocus
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {cliente}
            <div className="space-y-1.5">
              <Label htmlFor="pedido-writer">¿A quién se lo pides?</Label>
              <select
                id="pedido-writer"
                value={writerId}
                onChange={(event) => setPedido({ ...pedido, writerId: event.target.value })}
                className={SELECT_CLASS}
              >
                <option value="">Elige a alguien…</option>
                {team.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name} · {roleLabel(member.role)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pedido-note">Contexto (opcional)</Label>
            <Textarea
              id="pedido-note"
              rows={3}
              value={pedido.note}
              onChange={(event) => setPedido({ ...pedido, note: event.target.value })}
              placeholder="Para qué es, qué producto, algo que no se deba decir…"
              maxLength={2000}
            />
          </div>

          <div className="space-y-1.5 sm:w-1/2 sm:pr-2">
            <Label htmlFor="pedido-due">Para cuándo (opcional)</Label>
            <Input
              id="pedido-due"
              type="date"
              value={pedido.dueDate}
              onChange={(event) => setPedido({ ...pedido, dueDate: event.target.value })}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="brief-title">Título</Label>
            <Input
              id="brief-title"
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              placeholder="Promo de octubre"
              maxLength={140}
              autoFocus
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {cliente}
            <div className="space-y-1.5">
              <Label htmlFor="brief-angle">Ángulo</Label>
              <Input
                id="brief-angle"
                value={draft.angle}
                onChange={(event) => setDraft({ ...draft, angle: event.target.value })}
                placeholder="Dolor de espalda"
                maxLength={80}
              />
            </div>
          </div>

          {/* Cinco canales: el selector toma el ancho y la fecha se queda angosta. */}
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_11rem]">
            <div className="space-y-1.5">
              <Label>Canal</Label>
              <div role="radiogroup" aria-label="Canal" className="flex flex-wrap gap-1.5">
                {CHANNELS.map((channel) => (
                  <button
                    key={channel}
                    type="button"
                    role="radio"
                    aria-checked={draft.channel === channel}
                    onClick={() => setDraft({ ...draft, channel })}
                    className={`h-9 min-w-16 flex-1 rounded-md border px-2 text-sm transition-colors ${
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
              Las instrucciones viven en el Doc, con tu plantilla. Revisa que diseño tenga acceso
              para verlo.
            </p>
          </div>

          {/* Quien sigue se dice de entrada: asi cada relevo avisa solo, sin
              que nadie tenga que acordarse de etiquetar a la siguiente persona. */}
          <div className="space-y-1.5">
            <Label>¿Quién sigue?</Label>
            <div className={`grid gap-2 ${etapas.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
              {etapas.map(({ field, label }) => (
                <label key={field} className="space-y-1">
                  <span className="block text-xs text-muted-foreground">{label}</span>
                  <select
                    value={owners[field as keyof typeof owners]}
                    onChange={(event) => setOwners({ ...owners, [field]: event.target.value })}
                    className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                  >
                    <option value="">Sin asignar</option>
                    {team.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name} · {roleLabel(member.role)}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {owners.reviewer_id && owners.reviewer_id === yo?.id
                ? "Revisas tu propio copy: la revisión se salta y pasa directo a la siguiente etapa."
                : hasProduction(draft.channel)
                  ? "Los avisos van en orden: quien revisa, quien produce, copy y media aprueban los diseños, y al final quien lanza."
                  : "Los avisos van en orden: primero a quien revisa; al aprobar, a quien lanza."}
            </p>
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>
          Cancelar
        </Button>
        {modo === "pedir" ? (
          <Button disabled={pending || !pedido.title.trim() || !writerId} onClick={pedir}>
            {pending ? "Mandando…" : "Pedir copy"}
          </Button>
        ) : (
          <>
            {/* Con quien revisa elegido, crear ya es mandarlo: el primer aviso sale
                al crear, no cuando alguien se acuerde de volver a picarle. */}
            {owners.reviewer_id ? (
              <Button variant="outline" disabled={pending} onClick={() => crear(false)}>
                Crear sin mandar
              </Button>
            ) : null}
            <Button disabled={pending} onClick={() => crear(!!owners.reviewer_id)}>
              {pending ? "Guardando…" : owners.reviewer_id ? "Crear y mandar" : "Crear tarea"}
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}
