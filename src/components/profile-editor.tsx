"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/user-avatar";
import {
  removeAvatar as removeAvatarAction,
  requestAvatarUpload as requestAvatarUploadAction,
  setAvatar as setAvatarAction,
  updateName as updateNameAction,
} from "@/app/(app)/profile-actions";
import { unwrapped } from "@/lib/action-result";
import { uploadToR2 } from "@/lib/upload-xhr";

// Las acciones regresan el error como dato; esto lo vuelve a lanzar con su mensaje real.
const removeAvatar = unwrapped(removeAvatarAction);
const requestAvatarUpload = unwrapped(requestAvatarUploadAction);
const setAvatar = unwrapped(setAvatarAction);
const updateName = unwrapped(updateNameAction);

const LADO = 256;

/**
 * Recorta al centro y reduce a 256×256 JPEG en el navegador. Una foto de
 * celular pesa 3–8 MB; el avatar se ve a 36 px. Subir el original seria gastar
 * R2 y ancho de banda en cada carga de pagina.
 */
async function toSquareJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const lado = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = LADO;
  canvas.height = LADO;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Tu navegador no pudo procesar la foto.");
  ctx.drawImage(
    bitmap,
    (bitmap.width - lado) / 2,
    (bitmap.height - lado) / 2,
    lado,
    lado,
    0,
    0,
    LADO,
    LADO,
  );
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("No se pudo procesar la foto."))),
      "image/jpeg",
      0.85,
    ),
  );
}

export function ProfileEditor({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const router = useRouter();
  const [nombre, setNombre] = useState(name);
  const [preview, setPreview] = useState<string | null>(avatarUrl);
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  function run(action: () => Promise<unknown>, done: string) {
    startTransition(async () => {
      try {
        await action();
        toast.success(done);
        router.refresh();
      } catch (error) {
        toast.error((error as Error).message);
        setPreview(avatarUrl);
      }
    });
  }

  const cambiarFoto = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Elige una imagen.");
      return;
    }
    run(async () => {
      const jpeg = await toSquareJpeg(file);
      setPreview(URL.createObjectURL(jpeg));
      const { path, uploadUrl } = await requestAvatarUpload();
      await uploadToR2(uploadUrl, jpeg, undefined, "image/jpeg").promise;
      await setAvatar(path);
    }, "Foto actualizada");
  };

  return (
    <section className="surface flex flex-wrap items-center gap-4 rounded-xl border p-4">
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={pending}
        className="group relative rounded-full"
        aria-label="Cambiar foto de perfil"
      >
        <UserAvatar name={nombre || name} url={preview} className="size-16 text-lg" />
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/55 text-[11px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
          Cambiar
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) cambiarFoto(file);
          event.target.value = "";
        }}
      />

      <form
        className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          run(() => updateName(nombre), "Nombre actualizado");
        }}
      >
        <label htmlFor="perfil-nombre" className="w-full text-xs text-muted-foreground">
          Tu nombre, como lo ve el equipo
        </label>
        <Input
          id="perfil-nombre"
          value={nombre}
          onChange={(event) => setNombre(event.target.value)}
          maxLength={80}
          className="h-9 min-w-0 flex-1 sm:max-w-xs"
        />
        <Button size="sm" type="submit" disabled={pending || nombre.trim() === name}>
          Guardar
        </Button>
        {preview ? (
          <Button
            size="sm"
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              run(async () => {
                setPreview(null);
                await removeAvatar();
              }, "Foto quitada")
            }
          >
            Quitar foto
          </Button>
        ) : null}
      </form>
    </section>
  );
}
