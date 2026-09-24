import Link from "next/link";
import { CircleCheck, MailWarning } from "lucide-react";
import { RelevoBrand } from "@/components/relevo-brand";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/supabase/server";
import { ResendForm } from "@/app/signup/resend-form";

export const metadata = { title: "Confirmación · Relevo" };

export default async function ConfirmadoPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const { estado } = await searchParams;
  const user = await getCurrentUser();
  const caducado = estado === "caducado" && !user;

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            <RelevoBrand size="lg" tone="brand" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div
            className={
              caducado
                ? "flex size-11 items-center justify-center rounded-full bg-destructive/12 text-destructive"
                : "flex size-11 items-center justify-center rounded-full bg-primary/12 text-primary"
            }
          >
            {caducado ? (
              <MailWarning className="size-5" aria-hidden="true" />
            ) : (
              <CircleCheck className="size-5" aria-hidden="true" />
            )}
          </div>

          {caducado ? (
            <>
              <div className="space-y-1.5">
                <h1 className="font-heading text-xl font-extralight tracking-tight">
                  Ese enlace ya no sirve
                </h1>
                <p className="text-muted-foreground">
                  Caducó o ya se usó. Si ya confirmaste tu cuenta, solo entra. Si no, escribe tu
                  correo y te mandamos uno nuevo.
                </p>
              </div>
              <ResendForm label="Mandar enlace nuevo" />
              <Link href="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                Ir al login
              </Link>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <h1 className="font-heading text-xl font-extralight tracking-tight">
                  Correo confirmado
                </h1>
                <p className="text-muted-foreground">
                  {user
                    ? "Tu cuenta está lista. Ya eres parte del equipo en Relevo."
                    : "Tu cuenta está lista. Entra con tu correo y la contraseña que elegiste."}
                </p>
              </div>
              <Link href={user ? "/" : "/login"} className={buttonVariants({ className: "w-full" })}>
                {user ? "Entrar a Relevo" : "Ir al login"}
              </Link>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
