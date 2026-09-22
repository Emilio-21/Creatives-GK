/**
 * Los estados del brief y lo que sigue desde cada uno.
 *
 * Viven aqui y no junto a las acciones porque un archivo "use server" solo
 * puede exportar funciones async: exportar una constante desde ahi rompe el
 * build en cuanto un componente de servidor lo importa.
 *
 * Las transiciones validas de verdad las decide transition_brief en la base.
 * Esto es el orden en que se ofrecen en pantalla.
 */
export const BRIEF_STATUSES = ["borrador", "asignado", "en_diseno", "listo"] as const;
export type BriefStatus = (typeof BRIEF_STATUSES)[number];

export const STATUS_LABEL: Record<BriefStatus, string> = {
  borrador: "Borrador",
  asignado: "Asignado",
  en_diseno: "En diseño",
  listo: "Listo para lanzar",
};

export const NEXT_STEPS: Record<BriefStatus, { to: BriefStatus; label: string }[]> = {
  borrador: [{ to: "asignado", label: "Asignar a diseño" }],
  asignado: [
    { to: "en_diseno", label: "Empezar diseño" },
    { to: "borrador", label: "Volver a borrador" },
  ],
  en_diseno: [
    { to: "listo", label: "Marcar listo para lanzar" },
    { to: "asignado", label: "Reasignar" },
  ],
  listo: [{ to: "en_diseno", label: "Devolver a diseño" }],
};
