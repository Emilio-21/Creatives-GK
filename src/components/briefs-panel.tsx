"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  archiveBrief,
  listBriefs,
  saveBrief,
  type BriefWithMeta,
} from "@/app/client/brief-actions";

type BatchOption = { id: string; name: string };

/**
 * Instrucciones de copywriting. Vivian en Google Docs sueltos; aqui quedan
 * junto al batch al que pertenecen, que es lo que diseño necesita ver.
 */
export function BriefsPanel({
  clientId,
  batches,
}: {
  clientId: string;
  batches: BatchOption[];
}) {
  const router = useRouter();
  const [briefs, setBriefs] = useState<BriefWithMeta[] | null>(null);
  const [editing, setEditing] = useState<string | "nuevo" | null>(null);
  const [draft, setDraft] = useState({ title: "", body: "", batchId: "" });
  const [pending, startTransition] = useTransition();

  const reload = () => listBriefs(clientId).then(setBriefs).catch(() => setBriefs([]));

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  function startNew() {
    setDraft({ title: "", body: "", batchId: "" });
    setEditing("nuevo");
  }

  function startEdit(brief: BriefWithMeta) {
    setDraft({ title: brief.title, body: brief.body, batchId: brief.batch_id ?? "" });
    setEditing(brief.id);
  }

  function save() {
    startTransition(async () => {
      try {
        await saveBrief({
          id: editing && editing !== "nuevo" ? editing : undefined,
          clientId,
          batchId: draft.batchId || null,
          title: draft.title,
          body: draft.body,
        });
        toast.success("Brief guardado");
        setEditing(null);
        await reload();
        router.refresh();
      } catch (error) {
        toast.error((error as Error).message);
      }
    });
  }

  return (
    <section className="rounded-xl border p-4">
      <header className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Briefs de copy</h2>
          <p className="text-xs text-muted-foreground">
            Las instrucciones para diseñar los ads, junto a su batch.
          </p>
        </div>
        {editing === null ? (
          <Button size="sm" variant="outline" onClick={startNew}>
            Nuevo brief
          </Button>
        ) : null}
      </header>

      {editing !== null ? (
        <div className="space-y-3">
          <Input
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            placeholder="Título del brief"
            maxLength={140}
            autoFocus
          />

          <select
            value={draft.batchId}
            onChange={(event) => setDraft({ ...draft, batchId: event.target.value })}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <option value="">Sin batch (lineamiento general)</option>
            {batches.map((batch) => (
              <option key={batch.id} value={batch.id}>
                {batch.name}
              </option>
            ))}
          </select>

          <Textarea
            rows={14}
            value={draft.body}
            onChange={(event) => setDraft({ ...draft, body: event.target.value })}
            placeholder={"Ángulo, promesa, hooks, CTA, referencias…\n\nLo que diseño necesita para producir el batch."}
            className="font-mono text-sm"
          />

          <div className="flex gap-2">
            <Button size="sm" disabled={pending} onClick={save}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setEditing(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : briefs === null ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : briefs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no hay briefs. El primero reemplaza al Google Doc.
        </p>
      ) : (
        <ul className="divide-y">
          {briefs.map((brief) => (
            <li key={brief.id} className="py-3 first:pt-0 last:pb-0">
              <details>
                <summary className="flex cursor-pointer items-baseline gap-2 text-sm">
                  <span className="font-medium">{brief.title}</span>
                  {brief.batchName ? (
                    <span className="rounded border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                      {brief.batchName}
                    </span>
                  ) : null}
                  <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                    {brief.authorName ?? "—"} ·{" "}
                    {new Date(brief.updated_at).toLocaleDateString("es-MX")}
                  </span>
                </summary>

                <p className="mt-2 whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm">
                  {brief.body || "Sin contenido."}
                </p>

                <div className="mt-2 flex gap-2">
                  <Button size="xs" variant="ghost" onClick={() => startEdit(brief)}>
                    Editar
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => {
                      if (!confirm(`¿Archivar "${brief.title}"?`)) return;
                      startTransition(async () => {
                        try {
                          await archiveBrief(brief.id);
                          await reload();
                        } catch (error) {
                          toast.error((error as Error).message);
                        }
                      });
                    }}
                  >
                    Archivar
                  </Button>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
