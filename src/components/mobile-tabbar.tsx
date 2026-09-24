"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Barra inferior en movil. El header no alcanza para las secciones. */
export function MobileTabBar() {
  const pathname = usePathname();

  const tabs = [
    { href: "/", label: "Mi trabajo", match: (p: string) => p === "/" },
    {
      href: "/clientes",
      label: "Clientes",
      match: (p: string) => p.startsWith("/client"),
    },
    { href: "/upload", label: "Subir", match: (p: string) => p.startsWith("/upload") },
    { href: "/equipo", label: "Equipo", match: (p: string) => p.startsWith("/equipo") },
  ];

  return (
    <nav className="glass fixed inset-x-0 bottom-0 z-40 flex border-t pb-[env(safe-area-inset-bottom)] md:hidden">
      {tabs.map((tab) => {
        const active = tab.match(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex-1 py-3 text-center text-xs transition-colors ${
              active ? "font-medium text-primary" : "text-muted-foreground"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
