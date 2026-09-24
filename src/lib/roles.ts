/**
 * Roles por area. Modulo aparte de las acciones porque "use server" solo puede
 * exportar funciones async.
 *
 * El rol no bloquea nada salvo lo de admin — son pocas personas y la agencia se
 * mueve rapido — pero decide a quien se le ofrece cada etapa. 'admin' no se
 * auto-asigna: se otorga desde la pantalla de equipo.
 */
export const ROLES = ["admin", "media", "copy", "design", "member"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  media: "Media buying",
  copy: "Copy",
  design: "Diseño",
  member: "Sin área",
};

export const ROLE_HINT: Record<Role, string> = {
  admin: "Puede borrar y administrar el equipo",
  media: "Lanza las campañas",
  copy: "Escribe las tareas y elige quién sigue",
  design: "Sube los diseños",
  member: "Sin área asignada",
};

/** Los que alguien puede elegir al registrarse. */
export const SIGNUP_ROLES: Role[] = ["media", "copy", "design"];

export const ALLOWED_EMAIL_DOMAIN = "growthkingdom.com";

export function roleLabel(role: string | null | undefined): string {
  return ROLE_LABEL[(role ?? "member") as Role] ?? ROLE_LABEL.member;
}
