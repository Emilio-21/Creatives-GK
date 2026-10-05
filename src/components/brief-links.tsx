"use client";

import { useState, useTransition } from "react";
import { ExternalLink, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  setBriefLink as setBriefLinkAction,
  type BriefWithMeta,
} from "@/app/(app)/client/brief-actions";
import { unwrapped } from "@/lib/action-result";
import { BRIEF_LINKS, docLabel, type BriefLinkField } from "@/lib/brief-flow";

// Las acciones regresan el error como dato; esto lo vuelve a lanzar con su mensaje real.
const setBriefLink = unwrapped(setBriefLinkAction);

/**
 * El recorrido del creativo en links: referencias, copy, raw clips y la pieza
 * final. Cada quien llena el suyo aqui mismo, sin abrir "Editar tarea": quien
 * graba pega la carpeta de clips, quien edita pega el video para revisar.
 */
export function BriefLinks({
  brief,
  onChanged,
}: {
  brief: BriefWithMeta;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<BriefLinkField | null>(null);

  return (
    <section aria-label="Links de la tarea" className="rounded-lg border">
      <ul className="divide-y">
        {BRIEF_LINKS.map((link) => (
          <LinkRow
            key={link.field}
            briefId={brief.id}
            field={link.field}
            label={link.label}
            hint={link.hint}
            url={brief[link.field]}
            editing={editing === link.field}
            onEdit={() => setEditing(link.field)}
            onDone={async (changed) => {
              setEditing(null);
              if (changed) await onChanged();
            }}
          />
        ))}
      </ul>
    </section>
  );
}

function LinkRow({
  briefId,
  field,
  label,
  hint,
  url,
  editing,
  onEdit,
  onDone,
}: {
  briefId: string;
  field: BriefLinkField;
  label: string;
  hint: string;
  url: string | null;
  editing: boolean;
  onEdit: () => void;
  onDone: (changed: boolean) => Promise<void>;
}) {
  const [value, setValue] = useState(url ?? "");
  const [pending, startTransition] = useTransition();

  const guardar = () =>
    startTransition(async () => {
      try {
        await setBriefLink(briefId, field, value);
        toast.success(value.trim() ? `${label}: link guardado` : `${label}: link quitado`);
        await onDone(true);
      } catch (error) {
        toast.error((error as Error).message);
      }
    });

  return (
    <li className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 text-sm">
      <span className="w-24 shrink-0 text-xs font-medium text-muted-foreground">{label}</span>

      {editing ? (
        <form
          className="flex min-w-0 flex-1 basis-64 gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            guardar();
          }}
        >
          {/* Texto y no "url": el navegador rechaza en silencio un link pegado sin
              https://, y el servidor ya lo completa (normalizeDocUrl). */}
          <Input
            type="text"
            inputMode="url"
            autoComplete="off"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={hint}
            autoFocus
            className="h-8 min-w-0 flex-1"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                setValue(url ?? "");
                void onDone(false);
              }
            }}
          />
          <Button type="submit" size="sm" disabled={pending}>
            Guardar
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              setValue(url ?? "");
              void onDone(false);
            }}
          >
            Cancelar
          </Button>
        </form>
      ) : url ? (
        <>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            title={url}
            className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-foreground hover:underline"
          >
            <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate">{docLabel(url)}</span>
          </a>
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Cambiar link de ${label}`}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Pencil className="size-3.5" />
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={onEdit}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-muted-foreground hover:text-foreground"
        >
          <Plus className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">Agregar link</span>
          <span className="hidden truncate text-xs text-muted-foreground/70 sm:inline">· {hint}</span>
        </button>
      )}
    </li>
  );
}
