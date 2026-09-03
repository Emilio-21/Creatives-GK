"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateMetadata } from "@/app/(app)/creative/creative-actions";

const FORMATS = ["reel", "story", "feed", "1x1", "9x16"];

export function MetadataEditor({
  creativeId,
  displayName,
  concept,
  format,
  tags,
  notes,
  onDone,
}: {
  creativeId: string;
  displayName: string;
  concept: string | null;
  format: string | null;
  tags: string[];
  notes: string | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState({
    displayName,
    concept: concept ?? "",
    format: format ?? "",
    tags: tags.join(", "),
    notes: notes ?? "",
  });
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Nombre</Label>
        <Input
          value={draft.displayName}
          onChange={(event) => setDraft({ ...draft, displayName: event.target.value })}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Concepto</Label>
          <Input
            value={draft.concept}
            onChange={(event) => setDraft({ ...draft, concept: event.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Formato</Label>
          <select
            value={draft.format}
            onChange={(event) => setDraft({ ...draft, format: event.target.value })}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <option value="">—</option>
            {FORMATS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Tags (separados por coma)</Label>
        <Input
          value={draft.tags}
          onChange={(event) => setDraft({ ...draft, tags: event.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Notas</Label>
        <Textarea
          rows={3}
          value={draft.notes}
          onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
        />
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              try {
                await updateMetadata({
                  creativeId,
                  displayName: draft.displayName,
                  concept: draft.concept.trim() || null,
                  format: draft.format || null,
                  tags: [
                    ...new Set(
                      draft.tags
                        .split(",")
                        .map((tag) => tag.trim().toLowerCase())
                        .filter(Boolean),
                    ),
                  ],
                  notes: draft.notes.trim() || null,
                });
                toast.success("Guardado");
                onDone();
                router.refresh();
              } catch (error) {
                toast.error((error as Error).message);
              }
            })
          }
        >
          {pending ? "Guardando…" : "Guardar"}
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
