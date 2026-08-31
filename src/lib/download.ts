"use client";

import JSZip from "jszip";
import type { DownloadTarget } from "@/app/creative/actions";

/** Descarga simple: el navegador se encarga, la URL ya trae Content-Disposition. */
export function downloadOne(target: DownloadTarget) {
  const anchor = document.createElement("a");
  anchor.href = target.url;
  anchor.download = target.filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/**
 * Zip armado en el navegador a partir de las presigned URLs.
 * Nunca en el servidor: Vercel Hobby corta a los 10 s (§8).
 */
export async function downloadZip(
  targets: DownloadTarget[],
  zipName: string,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const zip = new JSZip();
  const used = new Set<string>();
  let done = 0;

  for (const target of targets) {
    const response = await fetch(target.url);
    if (!response.ok) {
      throw new Error(`No se pudo bajar ${target.filename} (${response.status}).`);
    }
    zip.file(uniqueName(target.filename, used), await response.blob());
    done += 1;
    onProgress?.(done, targets.length);
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = zipName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    // Darle al navegador tiempo de arrancar la descarga antes de soltar el blob.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

/** Dos creativos pueden tener el mismo nombre original: el zip no puede. */
function uniqueName(filename: string, used: Set<string>): string {
  if (!used.has(filename)) {
    used.add(filename);
    return filename;
  }
  const dot = filename.lastIndexOf(".");
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  const ext = dot > 0 ? filename.slice(dot) : "";
  let index = 2;
  while (used.has(`${base} (${index})${ext}`)) index += 1;
  const name = `${base} (${index})${ext}`;
  used.add(name);
  return name;
}
