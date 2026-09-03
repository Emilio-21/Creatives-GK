/** Roles por area. 'admin' no se auto-asigna: se otorga desde la pantalla de equipo. */
export const ROLES = {
  admin: "Admin",
  media: "Media buying",
  copy: "Copywriting",
  design: "Diseño",
  member: "Sin área",
} as const;

export type Role = keyof typeof ROLES;

/** Los que alguien puede elegir al registrarse. */
export const SIGNUP_ROLES: Role[] = ["media", "copy", "design"];

export const ALLOWED_EMAIL_DOMAIN = "growthkingdom.com";

export function roleLabel(role: string | null | undefined): string {
  return ROLES[(role ?? "member") as Role] ?? ROLES.member;
}
