"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resendConfirmation, type ResendState } from "./actions";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending}>
      {pending ? "Mandando…" : label}
    </Button>
  );
}

/** Reenvia el correo de confirmacion. Con `email` fijo solo muestra el boton. */
export function ResendForm({ email, label = "Reenviar correo" }: { email?: string; label?: string }) {
  const [state, formAction] = useActionState<ResendState, FormData>(resendConfirmation, {
    error: null,
    sent: false,
  });

  return (
    <form action={formAction} className="space-y-2">
      {email ? (
        <input type="hidden" name="email" value={email} />
      ) : (
        <Input name="email" type="email" autoComplete="email" required placeholder="tu@growthkingdom.com" />
      )}
      <Submit label={state.sent ? "Mandar otro" : label} />
      {state.sent ? (
        <p role="status" className="text-xs text-muted-foreground">
          Listo, te mandamos otro. Puede tardar un par de minutos.
        </p>
      ) : null}
      {state.error ? (
        <p role="alert" className="text-xs text-destructive">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
