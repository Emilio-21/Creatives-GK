/**
 * "Cambiaron las tareas de este cliente." Lo avisa quien crea una tarea desde
 * fuera de la lista (el boton de la barra lateral) y lo escucha la lista del
 * cliente, que carga sus tarjetas en el navegador: router.refresh() solo
 * vuelve a pedir lo del servidor y la lista no se enteraria.
 */
const EVENTO = "relevo:tareas";

export function announceTasksChanged(clientId: string): void {
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: { clientId } }));
}

/** Llama a `onChange` cuando cambian las tareas de `clientId`. Regresa la limpieza. */
export function onTasksChanged(clientId: string, onChange: () => void): () => void {
  const handler = (event: Event) => {
    if ((event as CustomEvent<{ clientId: string }>).detail?.clientId === clientId) onChange();
  };
  window.addEventListener(EVENTO, handler);
  return () => window.removeEventListener(EVENTO, handler);
}
