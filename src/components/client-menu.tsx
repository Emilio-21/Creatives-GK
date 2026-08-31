"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { archiveClient, renameClient } from "@/app/client/actions";

export function ClientMenu({ id, name }: { id: string; name: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [pending, startTransition] = useTransition();

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="h-8 w-44"
          maxLength={60}
          autoFocus
        />
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              try {
                await renameClient(id, value);
                setEditing(false);
                toast.success("Cliente renombrado");
              } catch (error) {
                toast.error((error as Error).message);
              }
            })
          }
        >
          Guardar
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setValue(name);
            setEditing(false);
          }}
        >
          Cancelar
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
        Renombrar
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => {
          if (!confirm(`¿Archivar "${name}"? Sus creativos siguen guardados.`)) return;
          startTransition(async () => {
            try {
              await archiveClient(id);
            } catch (error) {
              toast.error((error as Error).message);
            }
          });
        }}
      >
        Archivar
      </Button>
    </div>
  );
}
