"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * Ventana sobre la pagina: fondo oscuro, se cierra con Escape o con un clic
 * afuera. `canClose` en false la deja fija mientras algo se guarda o sube.
 *
 * Portal a <body>: un ancestro con filtro o transform se vuelve el marco de los
 * `fixed`, y la ventana se abriria metida en el sidebar o en una tarjeta.
 */
export function Modal({
  label,
  onClose,
  canClose = true,
  className,
  children,
}: {
  label: string;
  onClose: () => void;
  canClose?: boolean;
  /** Para el panel: el ancho (`max-w-…`) y lo que cambie. */
  className?: string;
  children: React.ReactNode;
}) {
  // El portal necesita document: en el render del servidor no existe.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!canClose) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [canClose, onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:p-8"
      onClick={(event) => {
        if (event.target === event.currentTarget && canClose) onClose();
      }}
    >
      <div className={cn("relative w-full rounded-xl border bg-card p-5 shadow-2xl", className)}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
