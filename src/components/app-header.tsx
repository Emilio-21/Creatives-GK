import Link from "next/link";
import { logout } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import type { Profile } from "@/lib/supabase/server";

export function AppHeader({ profile, email }: { profile: Profile | null; email: string }) {
  const name = profile?.full_name ?? email;

  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-6">
        <Link href="/" className="font-semibold">
          Creativos
        </Link>
        <nav className="flex items-center gap-4 text-sm text-muted-foreground">
          <Link href="/">Biblioteca</Link>
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">
            {name}
            {profile?.role === "admin" ? " · admin" : ""}
          </span>
          <form action={logout}>
            <Button type="submit" variant="outline" size="sm">
              Salir
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
