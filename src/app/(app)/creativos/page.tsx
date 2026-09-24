import { redirect } from "next/navigation";

/** "Todos los creativos" se quito: los creativos se consultan dentro de cada cliente. */
export default function CreativosPage() {
  redirect("/clientes");
}
