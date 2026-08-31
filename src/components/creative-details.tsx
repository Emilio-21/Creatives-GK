"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArchiveButton } from "@/components/archive-button";
import { DownloadButton } from "@/components/download-button";
import { MetadataEditor } from "@/components/metadata-editor";
import type { CreativeRow } from "@/lib/creatives";

export function CreativeDetails({ creative }: { creative: CreativeRow }) {
  const [editing, setEditing] = useState(false);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <CardTitle className="min-w-0 break-all">{creative.display_name}</CardTitle>
        <div className="flex shrink-0 gap-2">
          {!editing ? (
            <>
              <ArchiveButton
                creativeId={creative.id}
                archived={creative.archived_at !== null}
              />
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                Editar
              </Button>
            </>
          ) : null}
          <DownloadButton creativeId={creative.id} />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {editing ? (
          <MetadataEditor
            creativeId={creative.id}
            displayName={creative.display_name}
            concept={creative.concept}
            format={creative.format}
            tags={creative.tags}
            notes={creative.notes}
            onDone={() => setEditing(false)}
          />
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {creative.format ? <Badge variant="outline">{creative.format}</Badge> : null}
              {creative.concept ? <Badge variant="outline">{creative.concept}</Badge> : null}
              {creative.tags.map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </div>

            {creative.notes ? (
              <p className="whitespace-pre-wrap text-sm">{creative.notes}</p>
            ) : null}

            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <Field label="Archivo original" value={creative.original_filename} />
              <Field label="Subido" value={new Date(creative.created_at).toLocaleString("es-MX")} />
            </dl>
          </>
        )}
      </CardContent>
    </Card>
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
