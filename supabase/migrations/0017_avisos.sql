-- 0017_avisos.sql — la app avisa, en vez de que alguien mande un WhatsApp.
--
-- Los avisos se escriben DENTRO de transition_brief, en la misma transaccion
-- que el cambio de estado. Si se escribieran aparte, tarde o temprano habria
-- transicion sin aviso, y un aviso que a veces no llega no se usa: la gente
-- vuelve al WhatsApp "por si acaso".

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  kind text not null,                     -- asignado | listo | devuelto
  brief_id uuid references briefs(id) on delete cascade,
  client_id uuid references clients(id) on delete cascade,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- La consulta que corre en cada carga: lo mio, sin leer, lo mas reciente.
create index if not exists notifications_inbox_idx
  on notifications (profile_id, read_at, created_at desc);

alter table notifications enable row level security;

-- Los avisos de alguien son de esa persona: ni sus compañeros ni los admin.
drop policy if exists notifications_select on notifications;
create policy notifications_select on notifications
  for select to authenticated using (profile_id = auth.uid());

-- Marcar leido es lo unico que se puede cambiar, y solo sobre lo propio.
drop policy if exists notifications_update on notifications;
create policy notifications_update on notifications
  for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- Solo transition_brief escribe. Un aviso que cualquiera puede fabricar no es
-- una señal, es ruido con permiso.
drop policy if exists notifications_insert on notifications;
create policy notifications_insert on notifications for insert to authenticated with check (false);

grant select, update on notifications to authenticated;

/*
 * transition_brief, ahora con avisos.
 *
 * A quien se avisa sale del estado al que se llega:
 *   asignado   → a quien queda a cargo
 *   listo      → a TODO media buying de la organizacion, por rol y no por
 *                nombre, para que nadie tenga que acordarse de etiquetar
 *   devuelto   → a quien lo tenia asignado
 *
 * Nunca se avisa a quien hizo el cambio: ya lo sabe.
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
  v_final uuid;
  v_titulo text;
  v_cliente text;
  v_org uuid;
begin
  if v_actor is null then
    raise exception 'No hay sesión.';
  end if;

  select b.status, b.client_id, b.assigned_to, b.title, c.name, c.org_id
    into v_from, v_client, v_assigned, v_titulo, v_cliente, v_org
    from briefs b join clients c on c.id = b.client_id
   where b.id = p_brief;

  if not found then
    raise exception 'El brief no existe.';
  end if;
  if not public.client_in_my_org(v_client) then
    raise exception 'Ese brief no es de tu organización.';
  end if;

  if p_to = v_from and p_assigned is not distinct from v_assigned then
    return v_from;
  end if;

  if not (
       (v_from = 'borrador'  and p_to in ('asignado'))
    or (v_from = 'asignado'  and p_to in ('en_diseno', 'borrador', 'asignado'))
    or (v_from = 'en_diseno' and p_to in ('listo', 'asignado'))
    or (v_from = 'listo'     and p_to in ('en_diseno', 'asignado'))
  ) then
    raise exception 'No se puede pasar de % a %.', v_from, p_to;
  end if;

  v_final := coalesce(p_assigned, v_assigned);

  if p_to = 'asignado' and v_final is null then
    raise exception 'Asignar requiere una persona.';
  end if;

  if v_from = 'listo' and coalesce(btrim(p_note), '') = '' then
    raise exception 'Para devolver un brief hay que escribir el motivo.';
  end if;

  update briefs
     set status = p_to,
         assigned_to = v_final,
         updated_by = v_actor,
         updated_at = now()
   where id = p_brief;

  insert into brief_events (brief_id, from_status, to_status, assigned_to, note, actor)
  values (p_brief, v_from, p_to, v_final, nullif(btrim(p_note), ''), v_actor);

  -- ---- avisos ----
  if p_to = 'asignado' and v_final is not null and v_final <> v_actor then
    insert into notifications (profile_id, kind, brief_id, client_id, title, body)
    values (v_final, 'asignado', p_brief, v_client,
            format('Te asignaron "%s"', v_titulo),
            format('%s · entrega pendiente', v_cliente));

  elsif p_to = 'listo' then
    -- Por rol, no por nombre: nadie tiene que acordarse de etiquetar a Chris.
    --
    -- Si la organizacion todavia no tiene a nadie en media buying, el aviso
    -- cae en los admin. Un aviso que no llega a nadie es peor que no tenerlo:
    -- la pantalla dice "avisado" y el brief se queda parado.
    insert into notifications (profile_id, kind, brief_id, client_id, title, body)
    select p.id, 'listo', p_brief, v_client,
           format('"%s" está listo para lanzar', v_titulo),
           format('%s · los diseños ya están arriba', v_cliente)
      from profiles p
     where p.org_id = v_org
       and p.id <> v_actor
       and (
         p.role = 'media'
         or (p.role = 'admin'
             and not exists (select 1 from profiles m
                              where m.org_id = v_org and m.role = 'media'))
       );

  elsif v_from = 'listo' and p_to = 'en_diseno' and v_final is not null and v_final <> v_actor then
    insert into notifications (profile_id, kind, brief_id, client_id, title, body)
    values (v_final, 'devuelto', p_brief, v_client,
            format('Te devolvieron "%s"', v_titulo),
            p_note);
  end if;

  return p_to;
end;
$$;

revoke all on function public.transition_brief(uuid, text, uuid, text) from public;
grant execute on function public.transition_brief(uuid, text, uuid, text) to authenticated;
