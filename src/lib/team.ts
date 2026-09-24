import type { Role } from "@/lib/roles";

export type Member = {
  id: string;
  name: string;
  role: Role;
  clientIds: string[];
  isMe: boolean;
  openBriefs: number;
  /** Ya se encontro su usuario de Slack (por correo, al mandarle el primer aviso). */
  slackLinked: boolean;
  slackNotify: boolean;
  /** Foto firmada (dura una hora) o null: se pintan las iniciales. */
  avatarUrl: string | null;
};
