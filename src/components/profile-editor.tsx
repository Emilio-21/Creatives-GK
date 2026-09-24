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
  setBackground as setBackgroundAction,
  updateName as updateNameAction,
} from "@/app/(app)/profile-actions";
import { unwrapped } from "@/lib/action-result";
import { auraStyle, BACKGROUNDS, DEFAULT_BACKGROUND } from "@/lib/backgrounds";
import { uploadToR2 } from "@/lib/upload-xhr";

// Las acciones regresan el error como dato; esto lo vuelve a lanzar con su mensaje real.
const removeAvatar = unwrapped(removeAvatarAction);
const requestAvatarUpload = unwrapped(requestAvatarUploadAction);
const setAvatar = unwrapped(setAvatarAction);
const setBackground = unwrapped(setBackgroundAction);
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

/** Pinta el fondo ya, en el shell: la respuesta del servidor llega despues. */
function pintarFondo(id: string) {
  const aura = document.querySelector<HTMLElement>("[data-aura]");
  if (!aura) return;
  for (const [variable, valor] of Object.entries(auraStyle(id))) {
    aura.style.setProperty(variable, valor);
  }
}

export function ProfileEditor({
  name,
  avatarUrl,
  background,
}: {
  name: string;
  avatarUrl: string | null;
  background: string | null;
}) {
  const router = useRouter();
  const [fondo, setFondo] = useState(background ?? DEFAULT_BACKGROUND);
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

  const elegirFondo = (id: string) => {
    const anterior = fondo;
    setFondo(id);
    pintarFondo(id);
    startTransition(async () => {
      try {
        await setBackground(id);
        router.refresh();
      } catch (error) {
        toast.error((error as Error).message);
        setFondo(anterior);
        pintarFondo(anterior);
      }
    });
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

      {/* El fondo es de cada quien: se guarda en su perfil y lo sigue en cualquier equipo. */}
      <div className="w-full border-t pt-3">
        <p id="perfil-fondo" className="mb-2 text-xs text-muted-foreground">
          Tu fondo
        </p>
        <div role="radiogroup" aria-labelledby="perfil-fondo" className="flex flex-wrap gap-2">
          {BACKGROUNDS.map((bg) => (
            <button
              key={bg.id}
              type="button"
              role="radio"
              aria-checked={fondo === bg.id}
              aria-label={bg.label}
              title={bg.label}
              onClick={() => fondo !== bg.id && elegirFondo(bg.id)}
              className={`group flex flex-col items-center gap-1 rounded-lg p-1 text-[11px] transition-colors ${
                fondo === bg.id ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/fondos/mini/${bg.id}.webp`}
                alt=""
                width={72}
                height={47}
                className={`h-[47px] w-[72px] rounded-md object-cover ring-offset-2 ring-offset-background transition ${
                  fondo === bg.id ? "ring-2 ring-primary" : "ring-1 ring-border group-hover:ring-foreground/40"
                }`}
                style={{ backgroundColor: bg.color }}
              />
              {bg.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
