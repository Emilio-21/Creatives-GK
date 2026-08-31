"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setArchived } from "@/app/creative/creative-actions";

export function ArchiveButton({
  creativeId,
  archived,
}: {
  creativeId: string;
  archived: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() => {
        if (
          !archived &&
          !confirm("¿Archivar? Sale de la biblioteca y de los KPIs, pero no se borra nada.")
        ) {
          return;
        }
        startTransition(async () => {
          try {
            await setArchived(creativeId, !archived);
            toast.success(archived ? "Restaurado" : "Archivado");
            router.refresh();
          } catch (error) {
            toast.error((error as Error).message);
          }
        });
      }}
    >
      {archived ? "Restaurar" : "Archivar"}
    </Button>
  );
}
