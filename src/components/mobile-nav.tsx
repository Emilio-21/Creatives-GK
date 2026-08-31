"use client";

import { useRouter } from "next/navigation";

type Option = { id: string; name: string; count: number };

/**
 * En movil el sidebar no cabe: la navegacion por cliente se vuelve un select
 * que navega al elegir.
 */
export function MobileNav({
  clients,
  activeClientId,
  activeSection,
}: {
  clients: Option[];
  activeClientId?: string | null;
  activeSection?: "biblioteca" | "dashboard";
}) {
  const router = useRouter();
  const value =
    activeSection === "dashboard" ? "/dashboard" : activeClientId ? `/client/${activeClientId}` : "/";

  return (
    <select
      aria-label="Ir a"
      value={value}
      onChange={(event) => router.push(event.target.value)}
      className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:hidden"
    >
      <option value="/">Todos los creativos</option>
      <option value="/dashboard">Resumen</option>
      {clients.length > 0 ? (
        <optgroup label="Clientes">
          {clients.map((client) => (
            <option key={client.id} value={`/client/${client.id}`}>
              {client.name} ({client.count})
            </option>
          ))}
        </optgroup>
      ) : null}
    </select>
  );
}
