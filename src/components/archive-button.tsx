"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  setArchived as setArchivedAction,
} from "@/app/(app)/creative/creative-actions";
import { unwrapped } from "@/lib/action-result";

// Las acciones regresan el error como dato; esto lo vuelve a lanzar con su mensaje real.
const setArchived = unwrapped(setArchivedAction);

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
