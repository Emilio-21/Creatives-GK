"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
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
      <Button
        variant="outline"
        size="sm"
        className="w-full justify-start"
        onClick={() => setOpen(true)}
      >
        + Nuevo brief
      </Button>
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
