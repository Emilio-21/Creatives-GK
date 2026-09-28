import type { Metadata } from "next";
import { LinkIcon } from "lucide-react";
import { RelevoMark } from "@/components/relevo-brand";
import { loadPortal } from "../portal";
import { PortalRequestCard } from "./portal-request";

export const metadata: Metadata = {
  title: "Entregas",
  // El link es secreto: que ningun buscador lo guarde.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

// Siempre fresco: lo que el equipo pide o cierra tiene que verse al recargar.
export const dynamic = "force-dynamic";

export default async function EntregasPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await loadPortal(token);

  if (!portal) {
    return (
      <Shell>
        <div className="surface space-y-3 rounded-2xl border p-6 text-center">
          <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <LinkIcon className="size-5" aria-hidden="true" />
          </div>
          <h1 className="font-heading text-2xl font-extralight tracking-tight">Este link ya no sirve</h1>
          <p className="text-sm text-muted-foreground">
            Puede que lo hayan cambiado. Pídele el link nuevo a tu contacto de la agencia.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell agency={portal.orgName}>
      <header className="space-y-1">
        <h1 className="font-heading text-4xl font-extralight tracking-tight">{portal.clientName}</h1>
        <p className="text-sm text-muted-foreground">
          {portal.requests.length > 0
            ? "Esto es lo que necesitamos de ti. Sube los archivos en cada pedido; no necesitas cuenta."
            : "Por ahora no te pedimos nada. Cuando necesitemos algo, aparecerá aquí mismo."}
        </p>
      </header>

      <div className="space-y-4">
        {portal.requests.map((request) => (
          <PortalRequestCard key={request.id} token={token} request={request} />
        ))}
      </div>
    </Shell>
  );
}

function Shell({ agency, children }: { agency?: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-xl flex-col gap-6 px-4 py-8 sm:py-12">
      {agency ? (
        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <RelevoMark className="size-4 text-[#BE3D0D]" />
          {agency}
        </p>
      ) : null}
      {children}
    </main>
  );
}
