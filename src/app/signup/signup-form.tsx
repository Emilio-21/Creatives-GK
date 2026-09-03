"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ALLOWED_EMAIL_DOMAIN, ROLES, SIGNUP_ROLES } from "@/lib/roles";
import { signup, type SignupState } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Creando…" : "Crear cuenta"}
    </Button>
  );
}

export function SignupForm() {
  const [state, formAction] = useActionState<SignupState, FormData>(signup, {
    error: null,
    check: false,
  });

  if (state.check) {
    return (
      <div className="space-y-3 text-sm">
        <p>Cuenta creada. Te llegó un correo para confirmarla.</p>
        <p className="text-muted-foreground">
          Ábrelo y sigue el enlace; después entra desde el login.
        </p>
        <Link href="/login" className="inline-block underline">
          Ir al login
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="fullName">Nombre</Label>
        <Input id="fullName" name="fullName" required placeholder="Emilio Morán" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Correo</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder={`tu@${ALLOWED_EMAIL_DOMAIN}`}
        />
        <p className="text-xs text-muted-foreground">
          Solo correos @{ALLOWED_EMAIL_DOMAIN}.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="role">Área</Label>
        <select
          id="role"
          name="role"
          required
          defaultValue=""
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <option value="" disabled>
            Elige tu área…
          </option>
          {SIGNUP_ROLES.map((role) => (
            <option key={role} value={role}>
              {ROLES[role]}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Contraseña</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
        />
        <p className="text-xs text-muted-foreground">Mínimo 10 caracteres.</p>
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <Submit />

      <p className="text-xs text-muted-foreground">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="underline">
          Entra aquí
        </Link>
        .
      </p>
    </form>
  );
}
