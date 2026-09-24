import { redirect } from "next/navigation";

/** "Mis pendientes" se fusiono con "Mi trabajo" (/). Los links viejos siguen llegando. */
export default function PendientesPage() {
  redirect("/");
}
