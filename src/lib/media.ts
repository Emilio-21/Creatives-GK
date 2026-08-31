/**
 * Extraccion de metadata y poster frame — todo en el cliente.
 *
 * En Vercel Hobby el servidor tiene 10s de timeout y el body limitado a ~4.5 MB,
 * asi que nada de esto puede vivir del otro lado (§8).
 */

export type MediaMetadata = {
  mediaType: "image" | "video";
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  /** Solo video: primer frame decente en JPEG. R2 no genera thumbnails (§3.6). */
  poster: Blob | null;
};

export function mediaTypeOf(mimeType: string): "image" | "video" | null {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  return null;
}

export async function extractMetadata(file: File): Promise<MediaMetadata> {
  const kind = mediaTypeOf(file.type);
  if (kind === "image") return extractImageMetadata(file);
  if (kind === "video") return extractVideoMetadata(file);
  throw new Error(`Tipo de archivo no soportado: ${file.type}`);
}

async function extractImageMetadata(file: File): Promise<MediaMetadata> {
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    return {
      mediaType: "image",
      width: image.naturalWidth || null,
      height: image.naturalHeight || null,
      durationSeconds: null,
      poster: null,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function extractVideoMetadata(file: File): Promise<MediaMetadata> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  try {
    await once(video, "loadedmetadata");
    const duration = Number.isFinite(video.duration) ? video.duration : null;

    // Seek a ~1s: el frame 0 suele ser negro o un fundido.
    const target = duration && duration > 1.2 ? 1 : (duration ?? 0) / 2;
    let poster: Blob | null = null;
    try {
      video.currentTime = target;
      await once(video, "seeked");
      poster = await drawPoster(video);
    } catch {
      // Codec que el navegador no puede pintar (algunos MOV). Se sube sin poster.
      poster = null;
    }

    return {
      mediaType: "video",
      width: video.videoWidth || null,
      height: video.videoHeight || null,
      durationSeconds: duration,
      poster,
    };
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute("src");
    video.load();
  }
}

async function drawPoster(video: HTMLVideoElement): Promise<Blob | null> {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return null;

  // Un poster de grid no necesita mas de 720px de lado largo.
  const scale = Math.min(1, 720 / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);

  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.85);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("No se pudo leer la imagen."));
    image.src = src;
  });
}

function once(element: HTMLMediaElement, event: string, timeoutMs = 15_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      element.removeEventListener(event, onEvent);
      element.removeEventListener("error", onError);
      clearTimeout(timer);
    };
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("El navegador no pudo leer este video."));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout esperando "${event}".`));
    }, timeoutMs);

    element.addEventListener(event, onEvent);
    element.addEventListener("error", onError);
  });
}
