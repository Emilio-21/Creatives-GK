"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  ROLES,
  ROLE_HINT,
  ROLE_LABEL,
  setClientMember,
  setRole,
  type Member,
  type Role,
} from "@/app/(app)/team-actions";

/**
 * El equipo, sus roles y sus clientes.
 *
 * El rol no bloquea nada — son tres personas y la agencia se mueve rapido —
 * pero si decide a quien le llegan los avisos, asi que se muestra el efecto
 * junto al selector en vez de dejarlo como una etiqueta sin consecuencia.
 */
export function TeamBoard({
  members,
  clients,
  isAdmin,
}: {
  members: Member[];
  clients: { id: string; name: string }[];
  isAdmin: boolean;
}) {
  const hayMedia = members.some((member) => member.role === "media");

  return (
    <div className="space-y-4">
      {!hayMedia ? (
        <p className="rounded-lg border border-highlight/40 bg-highlight/10 px-3 py-2 text-xs">
          Nadie tiene el rol de <strong>media buying</strong>. Los avisos de «listo para
          lanzar» están cayendo en los admin como respaldo; asígnale el rol a quien lance
          y dejan de depender de eso.
        </p>
      ) : null}

      <ul className="space-y-3">
        {members.map((member) => (
          <MemberRow
            key={member.id}
            member={member}
            clients={clients}
            isAdmin={isAdmin}
          />
        ))}
      </ul>
    </div>
  );
}

function MemberRow({
  member,
  clients,
  isAdmin,
}: {
  member: Member;
  clients: { id: string; name: string }[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [abierto, setAbierto] = useState(false);
  const [suyos, setSuyos] = useState<string[]>(member.clientIds);

  // Cada quien se acomoda sus propios clientes; los admin, los de cualquiera.
  const puedeEditarClientes = isAdmin || member.isMe;

  return (
    <li className="surface rounded-xl border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-medium text-primary">
          {initials(member.name)}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {member.name}
            {member.isMe ? (
              <span className="ml-1.5 font-normal text-muted-foreground">(tú)</span>
            ) : null}
          </p>
          <p className="text-[11px] text-muted-foreground">{ROLE_HINT[member.role]}</p>
        </div>

        {member.openBriefs > 0 ? (
          <span className="shrink-0 rounded-full border border-highlight/40 px-2 py-0.5 text-[10px] text-highlight">
            {member.openBriefs} brief{member.openBriefs === 1 ? "" : "s"} encima
          </span>
        ) : null}

        {isAdmin ? (
          <select
            value={member.role}
            disabled={pending}
            onChange={(event) =>
              startTransition(async () => {
                try {
                  await setRole(member.id, event.target.value as Role);
                  toast.success(`${member.name} ahora es ${ROLE_LABEL[event.target.value as Role]}`);
                  router.refresh();
                } catch (error) {
                  toast.error((error as Error).message);
                }
              })
            }
            className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABEL[role]}
              </option>
            ))}
          </select>
        ) : (
          <span className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">
            {ROLE_LABEL[member.role]}
          </span>
        )}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t pt-2.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Clientes
        </span>
        {suyos.length === 0 ? (
          <span className="text-[11px] text-muted-foreground">todos</span>
        ) : (
          suyos.map((id) => (
            <span
              key={id}
              className="rounded-full border border-primary/30 px-2 py-0.5 text-[10px] text-primary"
            >
              {clients.find((client) => client.id === id)?.name ?? "—"}
            </span>
          ))
        )}

        {puedeEditarClientes ? (
          <Button
            size="xs"
            variant="ghost"
            className="ml-auto"
            onClick={() => setAbierto((v) => !v)}
          >
            {abierto ? "Listo" : "Cambiar"}
          </Button>
        ) : null}
      </div>

      {abierto ? (
        <div className="mt-2 flex flex-wrap gap-1.5 rounded-md border bg-muted/30 p-2">
          {clients.map((client) => {
            const tiene = suyos.includes(client.id);
            return (
              <button
                key={client.id}
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    try {
                      await setClientMember(client.id, member.id, !tiene);
                      setSuyos((prev) =>
                        tiene ? prev.filter((id) => id !== client.id) : [...prev, client.id],
                      );
                      router.refresh();
                    } catch (error) {
                      toast.error((error as Error).message);
                    }
                  })
                }
                className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                  tiene
                    ? "border-primary/60 bg-primary/10 text-primary"
                    : "text-muted-foreground hover:border-primary/40"
                }`}
              >
                {client.name}
              </button>
            );
          })}
          <p className="w-full pt-1 text-[10px] text-muted-foreground">
            Sin clientes marcados se ven todos. Es un filtro de la barra lateral, no un
            permiso.
          </p>
        </div>
      ) : null}
    </li>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
