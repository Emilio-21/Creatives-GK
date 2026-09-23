-- 0023_pendientes.sql — cada etapa sabe si ya se empezo y desde cuando espera.
--
-- Una tarea tiene tres momentos: le llega a alguien (pendiente), esa persona
-- la toma (en progreso) y la termina, que es pasarla a la siguiente etapa. No
-- hay "completado" aparte: un completado que no avisa a nadie deja el brief
-- parado entre dos personas.
--
-- stage_entered_at: cuando llego a quien la tiene. Lo que lleva esperando.
-- stage_started_at: cuando la tomo. Null = todavia no la empieza.

alter table briefs add column if not exists stage_entered_at timestamptz;
alter table briefs add column if not exists stage_started_at timestamptz;

update briefs set stage_entered_at = updated_at where stage_entered_at is null;
alter table briefs alter column stage_entered_at set default now();

-- Que clase de renglon es en el historial: un paso de etapa, un cambio de
-- manos, o alguien diciendo "ya lo tome".
alter table brief_events add column if not exists kind text not null default 'paso';
alter table brief_events drop constraint if exists brief_events_kind_check;
alter table brief_events add constraint brief_events_kind_check
  check (kind in ('paso', 'relevo', 'empezo'));
update brief_events set kind = 'relevo'
 where from_status = to_status and kind = 'paso';

-- La consulta de "Mis pendientes": lo mio, abierto.
create index if not exists briefs_mis_pendientes_idx
  on briefs (assigned_to, status) where archived_at is null;

/*
 * Cuando la pelota cambia de manos (otra etapa u otra persona), el reloj
 * vuelve a empezar y la tarea vuelve a pendiente: la persona nueva no la ha
 * tomado. Trigger y no codigo en cada funcion para que ninguna se lo salte.
 */
create or replace function public.reset_brief_stage_clock()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status or new.assigned_to is distinct from old.assigned_to then
    new.stage_entered_at := now();
    new.stage_started_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists briefs_stage_clock on briefs;
create trigger briefs_stage_clock
  before update on briefs for each row execute function public.reset_brief_stage_clock();

-- El guardia de 0022 tambien cubre "empezado": marcarlo por update directo
-- saltaria el historial.
create or replace function public.guard_brief_status()
returns trigger
language plpgsql
as $$
begin
  if (new.status is distinct from old.status
      or new.assigned_to is distinct from old.assigned_to
      or new.stage_started_at is distinct from old.stage_started_at
      or new.stage_entered_at is distinct from old.stage_entered_at)
     and coalesce(current_setting('app.brief_flow', true), '') <> 'on' then
    raise exception 'El estado del brief se cambia con los botones del flujo.';
  end if;
  return new;
end;
$$;

-- Los triggers corren en orden alfabetico: el guardia (briefs_guard_status)
-- revisa antes de que el reloj (briefs_stage_clock) toque las columnas.

/*
 * "Ya lo tome." Solo quien tiene la etapa, o un admin por esa persona.
 * Sin aviso: a quien le importa (quien lo mando) lo ve en el tablero; un aviso
 * por cada "empece" es ruido.
 */
create or replace function public.start_brief_stage(p_brief uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  b briefs%rowtype;
begin
  if v_actor is null then
    raise exception 'No hay sesión.';
  end if;

  select * into b from briefs where id = p_brief for update;
  if not found or not public.client_in_my_org(b.client_id) then
    raise exception 'El brief no existe.';
  end if;
  if b.status not in ('en_revision', 'en_produccion', 'en_lanzamiento') then
    raise exception 'Este brief no tiene una etapa en curso.';
  end if;
  if b.assigned_to is distinct from v_actor and not public.is_admin() then
    raise exception 'Solo quien tiene la etapa puede empezarla.';
  end if;
  if b.stage_started_at is not null then
    return;   -- ya estaba en progreso
  end if;

  perform set_config('app.brief_flow', 'on', true);
  update briefs set stage_started_at = now() where id = p_brief;
  perform set_config('app.brief_flow', 'off', true);

  insert into brief_events (brief_id, from_status, to_status, assigned_to, note, actor, kind)
  values (p_brief, b.status, b.status, b.assigned_to, null, v_actor, 'empezo');
end;
$$;

revoke all on function public.start_brief_stage(uuid) from public;
grant execute on function public.start_brief_stage(uuid) to authenticated;

-- set_brief_owner escribe su renglon de relevo como 'paso' (default). Se
-- corrige aqui sin reescribirla: from = to es un relevo por definicion.
create or replace function public.tag_brief_event_kind()
returns trigger
language plpgsql
as $$
begin
  if new.kind = 'paso' and new.from_status = new.to_status then
    new.kind := 'relevo';
  end if;
  return new;
end;
$$;

drop trigger if exists brief_events_kind on brief_events;
create trigger brief_events_kind
  before insert on brief_events for each row execute function public.tag_brief_event_kind();
