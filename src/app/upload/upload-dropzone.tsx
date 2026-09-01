"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ALLOWED_MIME_TYPES, MAX_FILE_BYTES } from "@/lib/env";
import { extractMetadata, type MediaMetadata } from "@/lib/media";
import { uploadToR2 } from "@/lib/upload-xhr";
import { confirmUpload, findDuplicateNames, requestUploadUrls } from "./actions";

const FORMATS = ["reel", "story", "feed", "1x1", "9x16"];
const ACCEPT = ALLOWED_MIME_TYPES.join(",");

type Status = "leyendo" | "listo" | "subiendo" | "guardando" | "hecho" | "error";

type Item = {
  key: string;
  file: File;
  status: Status;
  progress: number;
  error: string | null;
  metadata: MediaMetadata | null;
  duplicate: boolean;
  /** objectURL de la imagen o del poster, para la miniatura de la cola. */
  thumbUrl: string | null;
};

type ClientOption = { id: string; name: string };

export function UploadDropzone({
  clients,
  defaultClientId,
}: {
  clients: ClientOption[];
  defaultClientId?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [clientId, setClientId] = useState(defaultClientId ?? "");
  const [format, setFormat] = useState<string>("");
  const [tagsText, setTagsText] = useState("");
  const [dragging, setDragging] = useState(false);
  const [running, setRunning] = useState(false);

  const update = useCallback((key: string, patch: Partial<Item>) => {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }, []);

  const addFiles = useCallback(
    async (files: File[]) => {
      const accepted: Item[] = [];
      for (const file of files) {
        if (!ALLOWED_MIME_TYPES.includes(file.type as (typeof ALLOWED_MIME_TYPES)[number])) {
          toast.error(`${file.name}: tipo no permitido (${file.type || "desconocido"}).`);
          continue;
        }
        if (file.size > MAX_FILE_BYTES) {
          toast.error(`${file.name}: ${(file.size / 1024 / 1024).toFixed(1)} MB, máximo 100 MB.`);
          continue;
        }
        accepted.push({
          key: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
          file,
          status: "leyendo",
          progress: 0,
          error: null,
          metadata: null,
          duplicate: false,
          thumbUrl: null,
        });
      }
      if (accepted.length === 0) return;
      setItems((prev) => [...prev, ...accepted]);

      // Metadata y poster: en paralelo, uno a uno para no ahogar el decoder.
      for (const item of accepted) {
        try {
          const metadata = await extractMetadata(item.file);
          const thumbSource = metadata.poster ?? (metadata.mediaType === "image" ? item.file : null);
          update(item.key, {
            metadata,
            status: "listo",
            thumbUrl: thumbSource ? URL.createObjectURL(thumbSource) : null,
          });
        } catch (error) {
          update(item.key, { status: "error", error: (error as Error).message });
        }
      }

      try {
        const duplicates = new Set(await findDuplicateNames(accepted.map((i) => i.file.name)));
        setItems((prev) =>
          prev.map((item) =>
            duplicates.has(item.file.name) ? { ...item, duplicate: true } : item,
          ),
        );
      } catch {
        // La advertencia de duplicados no es critica.
      }
    },
    [update],
  );

  async function uploadOne(item: Item) {
    const metadata = item.metadata;
    if (!metadata) throw new Error("Sin metadata.");

    update(item.key, { status: "subiendo", progress: 0, error: null });

    const ticket = await requestUploadUrls(item.file.name, item.file.type, item.file.size);
    await uploadToR2(ticket.uploadUrl, item.file, (percent) =>
      update(item.key, { progress: percent }),
    ).promise;

    let posterPath: string | null = null;
    if (metadata.poster && ticket.posterUploadUrl && ticket.posterPath) {
      try {
        await uploadToR2(ticket.posterUploadUrl, metadata.poster).promise;
        posterPath = ticket.posterPath;
      } catch {
        // Sin poster el grid muestra un placeholder; no vale tumbar la subida.
      }
    }

    update(item.key, { status: "guardando", progress: 100 });

    await confirmUpload({
      storagePath: ticket.storagePath,
      posterPath,
      originalFilename: item.file.name,
      mimeType: item.file.type,
      mediaType: metadata.mediaType,
      width: metadata.width,
      height: metadata.height,
      durationSeconds: metadata.durationSeconds,
      clientId,
      format: format || null,
      tags: parseTags(tagsText),
    });

    update(item.key, { status: "hecho" });
  }

  /** Reintento de un solo archivo, sin tocar el resto de la cola. */
  async function retryOne(item: Item) {
    if (!clientId) {
      toast.error("Elige un cliente antes de subir.");
      return;
    }
    setRunning(true);
    try {
      await uploadOne(item);
      router.refresh();
    } catch (error) {
      update(item.key, { status: "error", error: (error as Error).message });
    } finally {
      setRunning(false);
    }
  }

  /** Solo sube lo pendiente: reintentar no vuelve a subir lo que ya paso (§6). */
  async function runUpload() {
    if (!clientId) {
      toast.error("Elige un cliente antes de subir.");
      return;
    }
    const pending = items.filter((item) => item.status === "listo" || item.status === "error");
    if (pending.length === 0) return;

    setRunning(true);
    let done = 0;
    for (const item of pending) {
      try {
        await uploadOne(item);
        done += 1;
      } catch (error) {
        update(item.key, { status: "error", error: (error as Error).message });
      }
    }
    setRunning(false);

    if (done > 0) {
      toast.success(`${done} creativo${done === 1 ? "" : "s"} en la biblioteca.`);
      router.refresh();
    }
  }

  const pendingCount = items.filter(
    (item) => item.status === "listo" || item.status === "error",
  ).length;
  const failedCount = items.filter((item) => item.status === "error").length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="client">
            Cliente <span className="text-destructive">*</span>
          </Label>
          <select
            id="client"
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
            disabled={running}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
          >
            <option value="">Elige un cliente…</option>
            {clients.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
          {clients.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Crea un cliente primero desde el panel izquierdo.
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="format">Formato</Label>
          <Select value={format} onValueChange={(value) => setFormat(value ?? "")} disabled={running}>
            <SelectTrigger id="format" className="w-full">
              <SelectValue placeholder="Opcional" />
            </SelectTrigger>
            <SelectContent>
              {FORMATS.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="tags">Tags</Label>
          <Input
            id="tags"
            value={tagsText}
            onChange={(event) => setTagsText(event.target.value)}
            placeholder="testimonial, ugc"
            disabled={running}
          />
        </div>
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void addFiles(Array.from(event.dataTransfer.files));
        }}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed p-10 text-center transition-colors ${
          dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25"
        }`}
      >
        <p className="text-sm font-medium">Arrastra archivos o haz clic</p>
        <p className="text-xs text-muted-foreground">
          JPEG, PNG, WebP, MP4 o MOV. Máximo 100 MB por archivo.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(event) => {
            void addFiles(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
      </div>

      {items.length > 0 ? (
        <div className="space-y-2">
          {items.map((item) => (
            <FileRow
              key={item.key}
              item={item}
              disabled={running}
              onRetry={() => void retryOne(item)}
            />
          ))}
        </div>
      ) : null}

      {items.length > 0 ? (
        <div className="flex items-center gap-3">
          <Button onClick={runUpload} disabled={running || pendingCount === 0}>
            {running
              ? "Subiendo…"
              : failedCount > 0 && failedCount === pendingCount
                ? `Reintentar ${failedCount}`
                : `Subir ${pendingCount} archivo${pendingCount === 1 ? "" : "s"}`}
          </Button>
          <Button
            variant="ghost"
            disabled={running}
            onClick={() =>
              setItems((prev) =>
                prev.filter((item) => {
                  if (item.status !== "hecho") return true;
                  // Soltar el objectURL de la miniatura al sacarla de la cola.
                  if (item.thumbUrl) URL.revokeObjectURL(item.thumbUrl);
                  return false;
                }),
              )
            }
          >
            Limpiar completados
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function FileRow({
  item,
  disabled,
  onRetry,
}: {
  item: Item;
  disabled: boolean;
  onRetry: () => void;
}) {
  const size = `${(item.file.size / 1024 / 1024).toFixed(1)} MB`;
  const dimensions = item.metadata?.width
    ? `${item.metadata.width}×${item.metadata.height}`
    : null;
  const duration = item.metadata?.durationSeconds
    ? `${item.metadata.durationSeconds.toFixed(1)}s`
    : null;

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
          {item.thumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.thumbUrl} alt="" className="size-full object-cover" />
          ) : (
            <span className="font-mono text-[9px] uppercase text-muted-foreground">
              {extensionOf(item.file.name)}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{item.file.name}</p>
          {item.status === "error" ? (
            <p className="truncate text-xs text-destructive">{item.error}</p>
          ) : (
            <p className="truncate text-xs text-muted-foreground">
              {[size, dimensions, duration].filter(Boolean).join(" · ")}
            </p>
          )}
          {item.status === "subiendo" ? (
            <Progress value={item.progress} className="mt-1.5 h-1" />
          ) : null}
        </div>

        {item.status === "error" ? (
          <Button size="sm" variant="outline" disabled={disabled} onClick={onRetry}>
            Reintentar
          </Button>
        ) : (
          <StatusLabel item={item} />
        )}
      </div>

      {item.duplicate && item.status !== "hecho" ? (
        <p className="mt-2 text-xs text-highlight">
          Ya existe un creativo con este nombre. ¿Es una versión nueva? Se sube igual.
        </p>
      ) : null}
    </div>
  );
}

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(dot + 1, dot + 5) : "?";
}

function StatusLabel({ item }: { item: Item }) {
  const label: Record<Status, string> = {
    leyendo: "Leyendo…",
    listo: "Listo",
    subiendo: `${item.progress}%`,
    guardando: "Guardando…",
    hecho: "✓",
    error: "Error",
  };
  const tone =
    item.status === "hecho"
      ? "text-emerald-600 dark:text-emerald-500"
      : item.status === "error"
        ? "text-destructive"
        : "text-muted-foreground";

  return <span className={`shrink-0 text-xs ${tone}`}>{label[item.status]}</span>;
}

function parseTags(text: string): string[] {
  return [
    ...new Set(
      text
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}
