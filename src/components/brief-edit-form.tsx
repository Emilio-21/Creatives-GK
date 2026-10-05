"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  editBrief as editBriefAction,
  listClientOptions as listClientOptionsAction,
  type BriefWithMeta,
} from "@/app/(app)/client/brief-actions";
import { listTeam as listTeamAction, type TeamMember } from "@/app/(app)/client/assignment-actions";
import { unwrapped } from "@/lib/action-result";
import {
  BRIEF_LINKS,
  CHANNEL_LABEL,
  CHANNELS,
  channelFits,
  STATUS_LABEL,
  stagesFor,
  type Channel,
  type OwnerField,
} from "@/lib/brief-flow";
import { roleLabel } from "@/lib/roles";

// Las acciones regresan el error como dato; esto lo vuelve a lanzar con su mensaje real.
const editBrief = unwrapped(editBriefAction);
const listClientOptions = unwrapped(listClientOptionsAction);
const listTeam = unwrapped(listTeamAction);

/**
 * Todo lo de una tarea en un solo lugar: datos, canal, cliente y responsables.
 * Lo que la base no deja (un canal sin la etapa en la que va, mover de cliente
 * una tarea con batch) se apaga aqui con el motivo, y la base lo vuelve a
 * revisar al guardar.
 */
export function BriefEditForm({
  brief,
  onCancel,
  onSaved,
}: {
  brief: BriefWithMeta;
  onCancel: () => void;
  /** `movedTo`: el cliente nuevo, si se movio. */
  onSaved: (movedTo: { id: string; name: string } | null) => Promise<void>;
}) {
  const [draft, setDraft] = useState({
    clientId: brief.client_id,
    title: brief.title,
    angle: brief.angle ?? "",
    docUrl: brief.doc_url ?? "",
    links: {
      reference_url: brief.reference_url ?? "",
      raw_url: brief.raw_url ?? "",
      final_url: brief.final_url ?? "",
    },
    briefDate: brief.brief_date,
    dueDate: brief.due_date ?? "",
    requestNote: brief.request_note ?? "",
    channel: brief.channel,
  });
  const [owners, setOwners] = useState<Record<OwnerField, string>>({
    writer_id: brief.writer_id ?? "",
    reviewer_id: brief.reviewer_id ?? "",
    producer_id: brief.producer_id ?? "",
    launcher_id: brief.launcher_id ?? "",
  });
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    listTeam().then(setTeam).catch(() => setTeam([]));
    listClientOptions().then(setClients).catch(() => setClients([]));
  }, []);

  const set = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  // Los responsables que se piden son los de las etapas del canal elegido.
  const etapas = stagesFor(draft.channel).filter(
    (stage): stage is typeof stage & { field: OwnerField } => stage.field !== null,
  );
  const conBatch = brief.batch_id !== null;

  const guardar = () =>
    startTransition(async () => {
      try {
        await editBrief({
          id: brief.id,
          ...draft,
          owners: {
            writer_id: owners.writer_id || null,
            reviewer_id: owners.reviewer_id || null,
            // Un canal sin producción no la usa: se queda como estaba.
            producer_id: owners.producer_id || null,
            launcher_id: owners.launcher_id || null,
          },
        });
        const movida =
          draft.clientId !== brief.client_id
            ? (clients.find((c) => c.id === draft.clientId) ?? null)
            : null;
        toast.success(movida ? `Tarea movida a ${movida.name}` : "Tarea guardada");
        await onSaved(movida);
      } catch (error) {
        toast.error((error as Error).message);
      }
    });

  return (
    <div className="space-y-4 pr-8">
      <h2 className="text-base font-semibold">Editar tarea</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Título" id="edit-title" className="sm:col-span-2">
          <Input
            id="edit-title"
            value={draft.title}
            onChange={(e) => set("title", e.target.value)}
            maxLength={140}
          />
        </Field>

        <Field label="Canal" className="sm:col-span-2">
          <div role="radiogroup" aria-label="Canal" className="flex flex-wrap gap-1.5">
            {CHANNELS.map((channel) => {
              const cabe = channelFits(channel as Channel, brief.status);
              return (
                <button
                  key={channel}
                  type="button"
                  role="radio"
                  aria-checked={draft.channel === channel}
                  disabled={!cabe}
                  title={
                    cabe
                      ? undefined
                      : `${CHANNEL_LABEL[channel as Channel]} no tiene la etapa "${STATUS_LABEL[brief.status]}"`
                  }
                  onClick={() => set("channel", channel as Channel)}
                  className={`h-8 min-w-16 flex-1 rounded-md border px-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    draft.channel === channel
                      ? "border-primary bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {CHANNEL_LABEL[channel as Channel]}
                </button>
              );
            })}
          </div>
          {CHANNELS.some((c) => !channelFits(c as Channel, brief.status)) ? (
            <p className="text-xs text-muted-foreground">
              Los canales apagados no tienen la etapa en la que va la tarea. Para cambiar a uno de
              ellos, regrésala a revisión primero.
            </p>
          ) : null}
        </Field>

        <Field label="Cliente" id="edit-client">
          <select
            id="edit-client"
            value={draft.clientId}
            disabled={conBatch}
            onChange={(e) => set("clientId", e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm disabled:opacity-60"
          >
            {clients.length === 0 ? <option value={brief.client_id}>…</option> : null}
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {conBatch ? (
            <p className="text-xs text-muted-foreground">Ya tiene batch: se queda en este cliente.</p>
          ) : null}
        </Field>

        <Field label="Ángulo" id="edit-angle">
          <Input
            id="edit-angle"
            value={draft.angle}
            onChange={(e) => set("angle", e.target.value)}
            placeholder="También es el nombre del batch"
            maxLength={80}
          />
        </Field>


        <Field label="Fecha" id="edit-date">
          <Input
            id="edit-date"
            type="date"
            value={draft.briefDate}
            onChange={(e) => set("briefDate", e.target.value)}
          />
        </Field>

        <Field label="Entrega (opcional)" id="edit-due">
          <Input
            id="edit-due"
            type="date"
            value={draft.dueDate}
            onChange={(e) => set("dueDate", e.target.value)}
          />
        </Field>

        <Field label="El pedido (opcional)" id="edit-note" className="sm:col-span-2">
          <Textarea
            id="edit-note"
            rows={3}
            value={draft.requestNote}
            onChange={(e) => set("requestNote", e.target.value)}
            placeholder="Lo que se pidió al principio"
            maxLength={2000}
          />
        </Field>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Links</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {BRIEF_LINKS.map((link) => (
            <Field key={link.field} label={link.label} id={`edit-${link.field}`}>
              <Input
                id={`edit-${link.field}`}
                type="url"
                inputMode="url"
                value={link.field === "doc_url" ? draft.docUrl : draft.links[link.field]}
                onChange={(e) =>
                  link.field === "doc_url"
                    ? set("docUrl", e.target.value)
                    : set("links", { ...draft.links, [link.field]: e.target.value })
                }
                placeholder={link.hint}
              />
            </Field>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Responsables</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {etapas.map((stage) => {
            const actual = stage.status === brief.status;
            return (
              <Field key={stage.field} label={`${stage.label}${actual ? " · ahora" : ""}`} id={`edit-${stage.field}`}>
                <select
                  id={`edit-${stage.field}`}
                  value={owners[stage.field]}
                  onChange={(e) => setOwners((o) => ({ ...o, [stage.field]: e.target.value }))}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                >
                  {/* La etapa en curso necesita a alguien: no se puede dejar vacia. */}
                  <option value="" disabled={actual}>
                    Sin asignar
                  </option>
                  {team.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name} · {roleLabel(member.role)}
                    </option>
                  ))}
                </select>
              </Field>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          A quien entra en la etapa en curso le llega el aviso. En aprobación dan el visto bueno
          revisión (copy) y lanzamiento (media).
        </p>
      </div>

      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={guardar}>
          {pending ? "Guardando…" : "Guardar"}
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  id,
  className = "",
  children,
}: {
  label: string;
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
