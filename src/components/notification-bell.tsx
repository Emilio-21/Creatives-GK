"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import {
  listNotifications,
  markAllRead,
  markRead,
  type Notification,
} from "@/app/(app)/notification-actions";

const KIND_DOT: Record<string, string> = {
  asignado: "bg-highlight",
  listo: "bg-primary",
  devuelto: "bg-destructive",
};

/**
 * La campanita del shell.
 *
 * Se recarga al cambiar de ruta y no con un intervalo: el equipo navega
 * constantemente, y un poll cada 30 s seria una consulta por persona por
 * minuto todo el dia para enterarse de algo que pasa tres veces al dia.
 */
export function NotificationBell() {
  const pathname = usePathname();
  const [items, setItems] = useState<Notification[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [, startTransition] = useTransition();

  const cargar = useCallback(() => {
    listNotifications(20)
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  useEffect(cargar, [cargar, pathname]);

  useEffect(() => {
    if (!abierto) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAbierto(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [abierto]);

  const sinLeer = items.filter((item) => item.read_at === null);

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`Avisos${sinLeer.length ? `: ${sinLeer.length} sin leer` : ""}`}
        onClick={() => setAbierto((v) => !v)}
        className="relative flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <path
            d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 21a2 2 0 0 1-3.4 0"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {sinLeer.length > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-medium text-white">
            {sinLeer.length > 9 ? "9+" : sinLeer.length}
          </span>
        ) : null}
      </button>

      {abierto ? (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setAbierto(false)}
            aria-hidden="true"
          />
          <div className="absolute bottom-full left-0 z-50 mb-2 w-80 rounded-xl border bg-card p-2 shadow-2xl">
            <div className="flex items-center justify-between px-1.5 pb-1.5">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Avisos
              </p>
              {sinLeer.length > 0 ? (
                <button
                  type="button"
                  className="text-[11px] text-muted-foreground hover:text-foreground"
                  onClick={() =>
                    startTransition(async () => {
                      try {
                        await markAllRead();
                        cargar();
                      } catch (error) {
                        toast.error((error as Error).message);
                      }
                    })
                  }
                >
                  Marcar todo leído
                </button>
              ) : null}
            </div>

            {items.length === 0 ? (
              <p className="px-1.5 py-6 text-center text-xs text-muted-foreground">
                Nada por ahora.
              </p>
            ) : (
              <ul className="max-h-96 space-y-0.5 overflow-y-auto">
                {items.map((item) => {
                  const destino = item.client_id ? `/client/${item.client_id}` : "/";
                  return (
                    <li key={item.id}>
                      <Link
                        href={destino}
                        onClick={() => {
                          setAbierto(false);
                          if (!item.read_at) {
                            startTransition(async () => {
                              await markRead([item.id]).catch(() => {});
                              cargar();
                            });
                          }
                        }}
                        className={`flex gap-2 rounded-lg px-1.5 py-2 transition-colors hover:bg-muted ${
                          item.read_at ? "opacity-55" : ""
                        }`}
                      >
                        <span
                          className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
                            KIND_DOT[item.kind] ?? "bg-muted-foreground"
                          }`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-medium leading-snug">
                            {item.title}
                          </span>
                          {item.body ? (
                            <span className="mt-0.5 block line-clamp-2 text-[11px] text-muted-foreground">
                              {item.body}
                            </span>
                          ) : null}
                          <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">
                            {cuandoFue(item.created_at)}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

function cuandoFue(iso: string): string {
  const minutos = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutos < 1) return "ahora";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias === 1) return "ayer";
  if (dias < 7) return `hace ${dias} días`;
  return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
}
