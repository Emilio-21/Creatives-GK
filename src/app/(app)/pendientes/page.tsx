import { TaskList } from "@/components/task-list";
import { listMyTasks, listTeam } from "@/app/(app)/client/assignment-actions";
import { unwrap } from "@/lib/action-result";

/**
 * Lo que me toca, de todos los clientes. Vive aparte y no dentro de cada
 * cliente porque una persona trabaja para varios: si sus pendientes estan
 * repartidos, lo que no ve se le olvida.
 */
export default async function PendientesPage() {
  const [tasks, team] = await Promise.all([listMyTasks(), unwrap(listTeam())]);
  const enProgreso = tasks.filter((task) => task.startedAt).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading font-extralight tracking-tight text-3xl">Mis pendientes</h1>
        <p className="text-sm text-muted-foreground">
          {tasks.length === 0
            ? "Nada por ahora."
            : `${tasks.length} por hacer · ${enProgreso} en progreso`}
        </p>
      </div>

      <TaskList tasks={tasks} team={team} />
    </div>
  );
}
