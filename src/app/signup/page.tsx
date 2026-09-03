import { SignupForm } from "./signup-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Crear cuenta · Creativos" };

export default function SignupPage() {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <div className="app-aura" aria-hidden="true" />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Crear cuenta</CardTitle>
          <CardDescription>Para el equipo de Growth Kingdom.</CardDescription>
        </CardHeader>
        <CardContent>
          <SignupForm />
        </CardContent>
      </Card>
    </main>
  );
}
