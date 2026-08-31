import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPreviewUrl } from "@/lib/storage";
import { createClient, type Profile } from "@/lib/supabase/server";
import type { CreativeRow } from "@/lib/creatives";

export default async function CreativeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: row }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, role, created_at").eq("id", user.id).single(),
    supabase.from("creatives").select("*").eq("id", id).maybeSingle(),
  ]);

  if (!row) notFound();
  const creative = row as CreativeRow;

  // Video: preview del archivo, con poster para no descargarlo hasta que le den play.
  const [mediaUrl, posterUrl] = await Promise.all([
    getPreviewUrl(creative.storage_path),
    creative.poster_path ? getPreviewUrl(creative.poster_path) : Promise.resolve(null),
  ]);

  return (
    <>
      <AppHeader profile={(profile as Profile) ?? null} email={user.email ?? ""} />
      <main className="mx-auto max-w-4xl space-y-6 p-6">
        <Link href="/" className="text-sm text-muted-foreground hover:underline">
          ← Biblioteca
        </Link>

        <div className="overflow-hidden rounded-lg border bg-muted">
          {creative.media_type === "video" ? (
            <video
              src={mediaUrl}
              poster={posterUrl ?? undefined}
              controls
              preload="none"
              className="max-h-[70vh] w-full"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mediaUrl}
              alt={creative.display_name}
              className="max-h-[70vh] w-full object-contain"
            />
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="break-all">{creative.display_name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              {creative.client ? <Badge variant="outline">{creative.client}</Badge> : null}
              {creative.format ? <Badge variant="outline">{creative.format}</Badge> : null}
              {creative.tags.map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </div>

            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <Field label="Archivo original" value={creative.original_filename} />
              <Field label="Tipo" value={creative.mime_type} />
              <Field
                label="Peso"
                value={`${(creative.file_size / 1024 / 1024).toFixed(2)} MB`}
              />
              <Field
                label="Dimensiones"
                value={creative.width ? `${creative.width}×${creative.height}` : "—"}
              />
              <Field
                label="Duración"
                value={
                  creative.duration_seconds ? `${creative.duration_seconds.toFixed(1)} s` : "—"
                }
              />
              <Field
                label="Subido"
                value={new Date(creative.created_at).toLocaleString("es-MX")}
              />
            </dl>

            <p className="text-xs text-muted-foreground">
              Descarga, edición de metadata y lanzamientos llegan en las fases 4 y 5.
            </p>
          </CardContent>
        </Card>

        <Link href="/" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Volver
        </Link>
      </main>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-36 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="break-all font-mono text-xs">{value}</dd>
    </div>
  );
}
