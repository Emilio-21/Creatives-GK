-- 0016_asignacion.sql — el brief tiene responsable, estado e historial.
--
-- Hoy el relevo copy → diseño → media buying pasa por WhatsApp: la app no sabe
-- quien tiene la pelota ni desde cuando. Esto lo mete al modelo.
--
-- 'lanzado' NO es un estado guardado. Sale de si el batch ya tiene
-- lanzamientos, igual que is_published en creative_stats. Guardar algo que se
-- puede derivar es garantizar que algun dia contradiga a los datos.

alter table briefs add column if not exists status text not null default 'borrador';
alter table briefs add column if not exists assigned_to uuid references profiles(id);
alter table briefs add column if not exists due_date date;

alter table briefs drop constraint if exists briefs_status_check;
alter table briefs add constraint briefs_status_check
  check (status in ('borrador', 'asignado', 'en_diseno', 'listo'));

create index if not exists briefs_assigned_idx on briefs (assigned_to, status);
create index if not exists briefs_status_idx on briefs (client_id, status);

-- Quien lo movio, cuando y por que. Sin esto, "¿por que este brief lleva seis
-- dias parado?" no tiene respuesta.
create table if not exists brief_events (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null references briefs(id) on delete cascade,
  from_status text,
  to_status text not null,
  assigned_to uuid references profiles(id),
  note text,
  actor uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists brief_events_brief_idx on brief_events (brief_id, created_at desc);

-- Filtro de vista, no permiso: quien no tenga clientes asignados los ve todos.
-- Asi la app sigue sirviendo aunque nadie se acuerde de asignar gente.
create table if not exists client_members (
  client_id uuid not null references clients(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (client_id, profile_id)
);

alter table brief_events   enable row level security;
alter table client_members enable row level security;

drop policy if exists brief_events_select on brief_events;
create policy brief_events_select on brief_events
  for select to authenticated
  using (exists (select 1 from briefs b
                  where b.id = brief_id and public.client_in_my_org(b.client_id)));

-- Solo la funcion de transicion escribe eventos: un historial que cualquiera
-- puede editar no es un historial.
drop policy if exists brief_events_insert on brief_events;
create policy brief_events_insert on brief_events for insert to authenticated with check (false);

drop policy if exists client_members_select on client_members;
create policy client_members_select on client_members
  for select to authenticated using (public.client_in_my_org(client_id));

drop policy if exists client_members_write on client_members;
create policy client_members_write on client_members
  for all to authenticated
  using (public.client_in_my_org(client_id) and public.is_admin())
  with check (public.client_in_my_org(client_id) and public.is_admin());

grant select on brief_events to authenticated;
grant select, insert, delete on client_members to authenticated;

/*
 * Mover un brief de estado.
 *
 * Por funcion y no por update directo porque una policy no puede expresar
 * "solo desde estos estados, y ademas escribe el evento en la misma
 * transaccion". Si el evento se escribiera aparte, tarde o temprano habria
 * transicion sin evento.
 */
create or replace function public.transition_brief(
  p_brief uuid,
  p_to text,
  p_assigned uuid default null,
  p_note text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_from text;
  v_client uuid;
  v_assigned uuid;
begin
  if v_actor is null then
    raise exception 'No hay sesión.';
  end if;

  select status, client_id, assigned_to into v_from, v_client, v_assigned
    from briefs where id = p_brief;

  if not found then
    raise exception 'El brief no existe.';
  end if;
  if not public.client_in_my_org(v_client) then
    raise exception 'Ese brief no es de tu organización.';
  end if;

  if p_to = v_from and p_assigned is not distinct from v_assigned then
    return v_from;   -- nada que hacer
  end if;

  -- Las transiciones validas, explicitas. Lo que no esta aqui no pasa.
  if not (
       (v_from = 'borrador'  and p_to in ('asignado'))
    or (v_from = 'asignado'  and p_to in ('en_diseno', 'borrador', 'asignado'))
    or (v_from = 'en_diseno' and p_to in ('listo', 'asignado'))
    or (v_from = 'listo'     and p_to in ('en_diseno', 'asignado'))
  ) then
    raise exception 'No se puede pasar de % a %.', v_from, p_to;
  end if;

  if p_to = 'asignado' and coalesce(p_assigned, v_assigned) is null then
    raise exception 'Asignar requiere una persona.';
  end if;

  -- Devolver trabajo terminado sin decir por que es como no devolverlo: la
  -- persona que lo hizo no sabe que corregir.
  if v_from = 'listo' and coalesce(btrim(p_note), '') = '' then
    raise exception 'Para devolver un brief hay que escribir el motivo.';
  end if;

  update briefs
     set status = p_to,
         assigned_to = coalesce(p_assigned, assigned_to),
         updated_by = v_actor,
         updated_at = now()
   where id = p_brief;

  insert into brief_events (brief_id, from_status, to_status, assigned_to, note, actor)
  values (p_brief, v_from, p_to, coalesce(p_assigned, v_assigned), nullif(btrim(p_note), ''), v_actor);

  return p_to;
end;
$$;

revoke all on function public.transition_brief(uuid, text, uuid, text) from public;
grant execute on function public.transition_brief(uuid, text, uuid, text) to authenticated;

-- Los dos briefs que ya existen: el que entrego sus diseños esta listo.
update briefs b
   set status = 'listo'
  from batches ba
 where ba.id = b.batch_id and ba.completed_at is not null and b.status = 'borrador';
