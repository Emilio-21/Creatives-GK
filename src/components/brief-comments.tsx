"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/user-avatar";
import {
  addComment as addCommentAction,
  deleteComment as deleteCommentAction,
  listComments as listCommentsAction,
  type BriefComment,
} from "@/app/(app)/client/comment-actions";
import { elapsed } from "@/lib/brief-flow";
import { unwrapped } from "@/lib/action-result";

// Las acciones regresan el error como dato; esto lo vuelve a lanzar con su mensaje real.
const addComment = unwrapped(addCommentAction);
const deleteComment = unwrapped(deleteCommentAction);
const listComments = unwrapped(listCommentsAction);

/**
 * El hilo de la tarea: dudas, cambios y vistos buenos en un solo lugar, en
 * orden. Cada comentario le avisa a quienes estan en la tarea.
 *
 * `stamp` cambia cuando la tarea se mueve (aprobar, pedir cambios): el hilo se
 * vuelve a leer para mostrar lo que el flujo escribio.
 */
export function BriefComments({ briefId, stamp }: { briefId: string; stamp: string }) {
  const [comments, setComments] = useState<BriefComment[] | null>(null);
  const [texto, setTexto] = useState("");
  const [pending, startTransition] = useTransition();

  const reload = useCallback(
    () =>
      listComments(briefId)
        .then(setComments)
        .catch(() => setComments([])),
    [briefId],
  );

  useEffect(() => {
    void reload();
  }, [reload, stamp]);

  const mandar = () =>
    startTransition(async () => {
      try {
        await addComment(briefId, texto);
        setTexto("");
        await reload();
      } catch (error) {
        toast.error((error as Error).message);
      }
    });

  const borrar = (id: string) =>
    startTransition(async () => {
      try {
        await deleteComment(id);
        await reload();
      } catch (error) {
        toast.error((error as Error).message);
      }
    });

  return (
    <section className="mt-5 border-t pt-4">
      <h3 className="text-sm font-semibold">
        Comentarios
        {comments && comments.length > 0 ? (
          <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
            {comments.length}
          </span>
        ) : null}
      </h3>

      {comments === null ? (
        <p className="mt-2 text-xs text-muted-foreground">Cargando…</p>
      ) : comments.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Sin comentarios. Lo que escribas aquí le llega a quienes están en la tarea.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {comments.map((comment) => (
            <li key={comment.id} className="flex gap-2.5">
              <UserAvatar
                name={comment.authorName}
                url={comment.authorAvatarUrl}
                className="size-7 text-[11px]"
              />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2 text-xs">
                  <span className="font-medium">{comment.authorName}</span>
                  {comment.kind === "aprobado" ? (
                    <span className="text-foreground">✓ dio el visto bueno</span>
                  ) : comment.kind === "cambios" ? (
                    <span className="text-destructive">pidió cambios</span>
                  ) : null}
                  <span className="text-muted-foreground">{elapsed(comment.createdAt)}</span>
                  {comment.mine && comment.kind === "comentario" ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => borrar(comment.id)}
                      className="ml-auto text-muted-foreground hover:text-destructive"
                    >
                      Borrar
                    </button>
                  ) : null}
                </p>
                {comment.body ? (
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">{comment.body}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <form
        className="mt-3 space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (texto.trim()) mandar();
        }}
      >
        <label htmlFor={`comentario-${briefId}`} className="sr-only">
          Escribe un comentario
        </label>
        <Textarea
          id={`comentario-${briefId}`}
          rows={2}
          value={texto}
          maxLength={4000}
          onChange={(event) => setTexto(event.target.value)}
          onKeyDown={(event) => {
            // ⌘/Ctrl + Enter manda, como en Slack con varias lineas.
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && texto.trim()) {
              event.preventDefault();
              mandar();
            }
          }}
          placeholder="Escribe un comentario o un cambio que haga falta…"
          className="text-sm"
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">⌘ + Enter para mandar</p>
          <Button type="submit" size="sm" disabled={pending || !texto.trim()}>
            {pending ? "Mandando…" : "Comentar"}
          </Button>
        </div>
      </form>
    </section>
  );
}
