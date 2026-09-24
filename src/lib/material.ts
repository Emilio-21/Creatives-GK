/**
 * Como se nombra y se muestra cada material. Modulo aparte (no el de acciones)
 * porque "use server" solo puede exportar funciones async.
 */

/** "Presentación", "PDF", "Imagen"…: lo que es, no la extension. */
export function materialKindLabel(fileName: string | null, mimeType: string | null): string {
  const ext = (fileName?.split(".").pop() ?? "").toLowerCase();
  const mime = mimeType ?? "";
  if (mime === "application/pdf" || ext === "pdf") return "PDF";
  if (mime.startsWith("image/")) return "Imagen";
  if (mime.startsWith("video/")) return "Video";
  if (mime.startsWith("audio/")) return "Audio";
  if (["ppt", "pptx", "key", "odp"].includes(ext)) return "Presentación";
  if (["doc", "docx", "pages", "odt", "rtf", "txt", "md"].includes(ext)) return "Documento";
  if (["xls", "xlsx", "csv", "numbers", "ods"].includes(ext)) return "Hoja de cálculo";
  if (["psd", "ai", "fig", "sketch", "xd", "indd", "eps", "svg"].includes(ext)) return "Diseño";
  if (["zip", "rar", "7z"].includes(ext)) return "Comprimido";
  if (["ttf", "otf", "woff", "woff2"].includes(ext)) return "Fuente";
  return ext ? ext.toUpperCase() : "Archivo";
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/** El nombre sin extension, como titulo por defecto al subir. */
export function titleFromFileName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || fileName;
}
