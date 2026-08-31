import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DownloadButton } from "@/components/download-button";
import { getDownloadHistory } from "@/app/creative/actions";
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
    supabase.from("creatives").select("*, clients(id, name)").eq("id", id).maybeSingle(),
  ]);

  if (!row) notFound();
  const creative = row as CreativeRow & { clients: { id: string; name: string } | null };

  // Video: preview del archivo, con poster para no descargarlo hasta que le den play.
  const [mediaUrl, posterUrl, history] = await Promise.all([
    getPreviewUrl(creative.storage_path),
    creative.poster_path ? getPreviewUrl(creative.poster_path) : Promise.resolve(null),
    getDownloadHistory(creative.id),
  ]);

  return (
    <AppShell
      profile={(profile as Profile) ?? null}
      email={user.email ?? ""}
      activeClientId={creative.clients?.id}
    >
      <div className="mx-auto max-w-3xl space-y-6">
        <Link
          href={creative.clients ? `/client/${creative.clients.id}` : "/"}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← {creative.clients?.name ?? "Biblioteca"}
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
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <CardTitle className="min-w-0 break-all">{creative.display_name}</CardTitle>
            <DownloadButton creativeId={creative.id} />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              {creative.clients ? (
                <Link href={`/client/${creative.clients.id}`}>
                  <Badge variant="outline">{creative.clients.name}</Badge>
                </Link>
              ) : null}
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
              Edición de metadata y lanzamientos llegan en la fase 5.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Historial de descargas</CardTitle>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nadie lo ha descargado todavía.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {history.map((entry) => (
                  <li key={entry.id} className="flex justify-between gap-4">
                    <span>{entry.userName}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {new Date(entry.downloaded_at).toLocaleString("es-MX")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
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
