"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, CircleCheck, FileUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  portalDeliver as portalDeliverAction,
  portalUploadUrl as portalUploadUrlAction,
} from "../actions";
import { unwrapped } from "@/lib/action-result";
import { fechaLarga, MAX_REQUEST_FILE_BYTES } from "@/lib/client-requests";
import { formatBytes } from "@/lib/material";
import { uploadToR2 } from "@/lib/upload-xhr";
import type { PortalRequest } from "../portal";

// Las acciones regresan el error como dato; esto lo vuelve a lanzar con su mensaje real.
const portalDeliver = unwrapped(portalDeliverAction);
const portalUploadUrl = unwrapped(portalUploadUrlAction);

/**
 * Un pedido en el link del cliente: que se pide, para cuando, lo que ya subio
 * y donde subir mas. Pensado para el celular: ahi graban.
 */
export function PortalRequestCard({ token, request }: { token: string; request: PortalRequest }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recibidos, setRecibidos] = useState<number | null>(null);
  const subiendo = progress !== null;

  // Cerrar la pestaña a medio subir pierde el archivo: el navegador pregunta antes.
  useEffect(() => {
    if (!subiendo) return;
    const avisar = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [subiendo]);

  const elegir = (lista: FileList | null) => {
    setError(null);
    setRecibidos(null);
    const nuevos = [...(lista ?? [])];
    const pesado = nuevos.find((f) => f.size > MAX_REQUEST_FILE_BYTES);
    if (pesado) setError(`"${pesado.name}" pesa más de 1 GB. Mándalo por otro medio a tu contacto.`);
    setFiles((antes) => [...antes, ...nuevos.filter((f) => f.size <= MAX_REQUEST_FILE_BYTES)]);
    if (input.current) input.current.value = "";
  };

  const subir = async () => {
    setError(null);
    const total = files.reduce((sum, f) => sum + f.size, 0) || 1;
    let listos = 0;
    setProgress(0);
    try {
      const firmas = await portalUploadUrl(
        token,
        request.id,
        files.map((f) => ({ name: f.name, type: f.type, size: f.size })),
      );
      // Uno por uno: en datos del celular, varios a la vez se estorban.
      for (const [i, file] of files.entries()) {
        const { uploadUrl, contentType } = firmas[i];
        await uploadToR2(
          uploadUrl,
          file,
          (p) => setProgress(Math.round(((listos + (file.size * p) / 100) / total) * 100)),
          contentType,
        ).promise;
        listos += file.size;
      }
      const n = await portalDeliver(
        token,
        request.id,
        files.map((f, i) => ({ path: firmas[i].path, name: f.name })),
      );
      setFiles([]);
      setRecibidos(n);
      router.refresh();
    } catch (e) {
      setError(
        (e as Error).message.startsWith("Error de red")
          ? "Se cortó la conexión. Revisa tu internet y vuelve a intentarlo."
          : (e as Error).message,
      );
    } finally {
      setProgress(null);
    }
  };

  return (
    <article className="surface space-y-4 rounded-2xl border p-5">
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold leading-snug">{request.title}</h2>
        {request.dueDate ? (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarDays className="size-4" aria-hidden="true" />
            Para el {fechaLarga(request.dueDate)}
          </p>
        ) : null}
        {request.instructions ? (
          <p className="whitespace-pre-wrap pt-1 text-sm">{request.instructions}</p>
        ) : null}
      </div>

      {request.files.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            Ya recibimos {request.files.length} {request.files.length === 1 ? "archivo" : "archivos"}
          </p>
          <ul className="space-y-1 text-sm">
            {request.files.map((f, i) => (
              <li key={i} className="flex items-center gap-2">
                <CircleCheck className="size-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(f.size)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {recibidos !== null ? (
        <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">
          ¡Listo! Recibimos {recibidos === 1 ? "tu archivo" : `tus ${recibidos} archivos`}. Ya le
          avisamos al equipo. Si falta algo, puedes subir más.
        </p>
      ) : null}

      <input
        ref={input}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => elegir(event.target.files)}
      />

      {files.length > 0 ? (
        <ul className="space-y-1.5 rounded-lg border p-3 text-sm">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(f.size)}</span>
              {!subiendo ? (
                <button
                  type="button"
                  aria-label={`Quitar ${f.name}`}
                  onClick={() => setFiles((antes) => antes.filter((_, j) => j !== i))}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {subiendo ? (
        <div className="space-y-1.5">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">
            Subiendo {progress}% · no cierres esta página hasta que termine
          </p>
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          variant={files.length > 0 ? "outline" : "default"}
          size="lg"
          className="sm:flex-1"
          disabled={subiendo}
          onClick={() => input.current?.click()}
        >
          <FileUp className="size-4" aria-hidden="true" />
          {files.length > 0 ? "Agregar más" : request.files.length > 0 ? "Subir más archivos" : "Elegir archivos"}
        </Button>
        {files.length > 0 ? (
          <Button size="lg" className="sm:flex-1" disabled={subiendo} onClick={subir}>
            {subiendo ? "Subiendo…" : `Enviar ${files.length} ${files.length === 1 ? "archivo" : "archivos"}`}
          </Button>
        ) : null}
      </div>
    </article>
  );
}
