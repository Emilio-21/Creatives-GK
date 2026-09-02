"use client";

import { useState } from "react";
import { BriefDialog } from "@/components/brief-dialog";

export function NewBriefButton({
  clients,
  activeClientId,
}: {
  clients: { id: string; name: string }[];
  activeClientId?: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="brand-gradient flex w-full items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
      >
        <span aria-hidden="true">+</span> Nuevo brief
      </button>
      {/* La clave remonta el formulario al abrir: hereda el cliente actual. */}
      <BriefDialog
        key={open ? `${activeClientId ?? "none"}-abierto` : "cerrado"}
        clients={clients}
        defaultClientId={activeClientId}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
