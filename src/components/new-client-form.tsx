"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClientRecord, type ClientFormState } from "@/app/client/actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Creando…" : "Crear"}
    </Button>
  );
}

export function NewClientForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ClientFormState, FormData>(createClientRecord, {
    error: null,
  });

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        + Nuevo cliente
      </Button>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <Input name="name" placeholder="Nombre del cliente" autoFocus maxLength={60} />
      {state.error ? <p className="text-xs text-destructive">{state.error}</p> : null}
      <div className="flex gap-2">
        <Submit />
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
