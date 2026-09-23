"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * "Mis pendientes" en la barra lateral, junto a Avisos. El aviso dice que algo
 * llego; esto dice lo que sigue en tus manos, aunque ya hayas leido el aviso.
 */
export function TasksLink({ count }: { count: number }) {
  const active = usePathname().startsWith("/pendientes");

  return (
    <Link
      href="/pendientes"
      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted ${
        active || count > 0 ? "text-foreground" : "text-muted-foreground hover:text-foreground"
      } ${active ? "bg-muted" : ""}`}
    >
      <svg viewBox="0 0 24 24" className="size-4 shrink-0" aria-hidden="true">
        <path
          d="M9 11l3 3 8-8M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="flex-1">Mis pendientes</span>
      {count > 0 ? (
        <span className="flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-medium text-primary-foreground">
          {count > 9 ? "9+" : count}
        </span>
      ) : null}
    </Link>
  );
}
