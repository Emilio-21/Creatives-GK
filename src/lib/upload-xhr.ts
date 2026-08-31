/**
 * PUT directo del navegador a R2 con barra de progreso.
 *
 * Se usa XHR y no fetch porque fetch no expone progreso de subida (§6 /upload).
 * El archivo nunca pasa por Next: Vercel limita el body a ~4.5 MB y un video de
 * Meta pesa 30–100 MB (§3.1).
 */
export type UploadHandle = {
  promise: Promise<void>;
  abort: () => void;
};

export function uploadToR2(
  uploadUrl: string,
  file: Blob,
  onProgress?: (percent: number) => void,
): UploadHandle {
  const xhr = new XMLHttpRequest();

  const promise = new Promise<void>((resolve, reject) => {
    xhr.open("PUT", uploadUrl, true);
    xhr.setRequestHeader("content-type", file.type);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve();
      } else {
        reject(new Error(`R2 respondio ${xhr.status}: ${xhr.responseText.slice(0, 200)}`));
      }
    };

    // Un fallo de CORS llega aca sin detalle: el navegador no lo expone.
    xhr.onerror = () =>
      reject(
        new Error(
          "Error de red o de CORS. Revisa la CORS Policy del bucket (infra/r2-cors.json) " +
            "y que el origen actual este en AllowedOrigins.",
        ),
      );
    xhr.onabort = () => reject(new Error("Subida cancelada."));
    xhr.ontimeout = () => reject(new Error("La subida tardo demasiado."));

    xhr.send(file);
  });

  return { promise, abort: () => xhr.abort() };
}
