/**
 * Roles del equipo. Fuera del archivo de acciones por la misma razon que
 * brief-flow: "use server" solo exporta funciones async.
 *
 * El rol no bloquea nada — son tres personas y la agencia se mueve rapido —
 * pero decide a quien le llegan los avisos.
 */
export const ROLES = ["admin", "media", "copy", "design", "member"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  media: "Media buying",
  copy: "Copy",
  design: "Diseño",
  member: "Equipo",
};

export const ROLE_HINT: Record<Role, string> = {
  admin: "Puede borrar y administrar el equipo",
  media: "Lanza las campañas",
  copy: "Escribe los briefs y elige quién sigue",
  design: "Sube los diseños",
  member: "Sin área asignada",
};

export type Member = {
  id: string;
  name: string;
  role: Role;
  clientIds: string[];
  isMe: boolean;
  openBriefs: number;
};
