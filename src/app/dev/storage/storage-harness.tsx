"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { uploadToR2 } from "@/lib/upload-xhr";
import {
  removeFile,
  requestDownloadUrl,
  requestPreviewUrl,
  requestUploadUrl,
} from "./actions";

type Uploaded = { path: string; filename: string; mimeType: string; size: number };

export function StorageHarness() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [uploaded, setUploaded] = useState<Uploaded | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleUpload(file: File) {
    setBusy(true);
    setProgress(0);
    setPreviewUrl(null);
    try {
      const { path, uploadUrl } = await requestUploadUrl(file.name, file.type, file.size);
      await uploadToR2(uploadUrl, file, setProgress).promise;
      setUploaded({ path, filename: file.name, mimeType: file.type, size: file.size });
      toast.success("Subido a R2");
    } catch (error) {
      setProgress(null);
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handlePreview() {
    if (!uploaded) return;
    setBusy(true);
    try {
      setPreviewUrl(await requestPreviewUrl(uploaded.path));
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload() {
    if (!uploaded) return;
    setBusy(true);
    try {
      const url = await requestDownloadUrl(uploaded.path, uploaded.filename);
      window.location.href = url;
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!uploaded) return;
    setBusy(true);
    try {
      await removeFile(uploaded.path);
      setUploaded(null);
      setPreviewUrl(null);
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
      toast.success("Borrado de R2");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleUpload(file);
          }}
        />
        <p className="text-xs text-muted-foreground">
          Máximo 100 MB. JPEG, PNG, WebP, MP4 o MOV.
        </p>
      </div>

      {progress !== null ? (
        <div className="space-y-1">
          <div className="h-2 w-full overflow-hidden rounded bg-muted">
            <div
              className="h-full bg-primary transition-[width]"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">{progress}%</p>
        </div>
      ) : null}

      {uploaded ? (
        <div className="space-y-4">
          <dl className="grid gap-1 text-sm">
            <div className="flex gap-2">
              <dt className="w-24 text-muted-foreground">Key</dt>
              <dd className="break-all font-mono text-xs">{uploaded.path}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 text-muted-foreground">Tipo</dt>
              <dd className="font-mono text-xs">
                {uploaded.mimeType} · {(uploaded.size / 1024 / 1024).toFixed(2)} MB
              </dd>
            </div>
          </dl>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={handlePreview}>
              Ver preview
            </Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={handleDownload}>
              Descargar
            </Button>
            <Button variant="destructive" size="sm" disabled={busy} onClick={handleDelete}>
              Borrar
            </Button>
          </div>

          {previewUrl ? (
            uploaded.mimeType.startsWith("video/") ? (
              <video src={previewUrl} controls preload="none" className="w-full rounded border" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt={uploaded.filename} className="w-full rounded border" />
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
