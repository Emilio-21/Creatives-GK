/**
 * Por que las acciones regresan el error en vez de lanzarlo.
 *
 * En produccion Next.js reemplaza el mensaje de cualquier error lanzado desde
 * una accion de servidor por "An error occurred in the Server Components
 * render…". Todos los "Falta elegir quién se encarga…" o "Para regresar un
 * brief hay que escribir el motivo" llegaban asi: en local se veian bien, en
 * produccion eran ese texto. Un valor regresado no se toca.
 *
 * Del lado del servidor, `attempt` convierte el error en dato. Del lado del
 * cliente, `unwrapped` lo vuelve a lanzar como Error normal, asi que las
 * pantallas siguen haciendo try/catch + toast como siempre.
 */
import { unstable_rethrow } from "next/navigation";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function attempt<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    // redirect() (p. ej. sesion vencida → /login) se lanza como error: sigue su camino.
    unstable_rethrow(error);
    const message = error instanceof Error ? error.message : String(error);
    console.error("[accion]", message);
    return { ok: false, error: message || "Algo salió mal." };
  }
}

export async function unwrap<T>(result: Promise<ActionResult<T>>): Promise<T> {
  const value = await result;
  if (!value.ok) throw new Error(value.error);
  return value.data;
}

/** La accion con su firma original: regresa T o lanza un Error con el mensaje real. */
export function unwrapped<A extends unknown[], T>(
  action: (...args: A) => Promise<ActionResult<T>>,
): (...args: A) => Promise<T> {
  return (...args: A) => unwrap(action(...args));
}
