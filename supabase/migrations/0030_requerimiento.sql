-- 0030_requerimiento.sql — pedir copy es un paso aparte de definir la tarea.
--
-- Cualquiera pide ("necesito copy para la promo de octubre"): cliente, que se
-- necesita, una nota y a quien se le pide. Copy recibe el pedido y ahi define
-- todo: canal, link del Doc, angulo y quien revisa, produce y lanza.
--
-- 'borrador' pasa a ser la etapa de copy, con dueño (writer_id), aviso,
-- pendiente/en progreso como las demas. Si quien escribe es quien revisa, la
-- revision se salta sola.

alter table briefs add column if not exists writer_id uuid references profiles(id);
alter table briefs add column if not exists angle text;
alter table briefs add column if not exists request_note text;

alter table briefs drop constraint if exists briefs_angle_len;
alter table briefs add constraint briefs_angle_len
  check (angle is null or length(btrim(angle)) between 1 and 80);
alter table briefs drop constraint if exists briefs_request_note_len;
alter table briefs add constraint briefs_request_note_len
  check (request_note is null or length(request_note) <= 2000);

-- Las tareas que ya estaban en borrador: las escribe quien las creo, y ahora
-- son de esa persona (le aparecen en Mi trabajo).
update briefs set writer_id = created_by where writer_id is null;
select set_config('app.brief_flow', 'on', true);
update briefs set assigned_to = writer_id where status = 'borrador' and assigned_to is null;
select set_config('app.brief_flow', 'off', true);

-- Quien escribe tambien tiene que ser de la organizacion.
create or replace function public.check_brief_owners()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  select org_id into v_org from clients where id = new.client_id;
  if exists (
    select 1
      from unnest(array[new.writer_id, new.reviewer_id, new.producer_id, new.launcher_id,
                        new.assigned_to]) as o(id)
      join profiles p on p.id = o.id
     where p.org_id is distinct from v_org
  ) then
    raise exception 'Solo puedes asignar gente de tu organización.';
  end if;
  return new;
end;
$$;

drop trigger if exists briefs_owners_org on briefs;
create trigger briefs_owners_org
  before insert or update of writer_id, reviewer_id, producer_id, launcher_id, assigned_to, client_id
  on briefs for each row execute function public.check_brief_owners();

CREATE OR REPLACE FUNCTION public.transition_brief(p_brief uuid, p_to text, p_assigned uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := auth.uid();
  b briefs%rowtype;
  v_cliente text;
  v_owner uuid;
  v_normal boolean;
  v_regresa boolean;
  v_canal text;
  v_nota text := nullif(btrim(coalesce(p_note, '')), '');
  v_to text := p_to;
  v_sin_revision boolean := false;
  v_siguiente text;
  v_revisor uuid;
begin
  if v_actor is null then
    raise exception 'No hay sesión.';
  end if;

  select * into b from briefs where id = p_brief for update;
  if not found then
    raise exception 'La tarea no existe.';
  end if;
  if not public.client_in_my_org(b.client_id) then
    raise exception 'Esa tarea no es de tu organización.';
  end if;
  select name into v_cliente from clients where id = b.client_id;

  if p_to = b.status or public.brief_status_rank(p_to) is null then
    raise exception 'No se puede pasar de % a %.', b.status, p_to;
  end if;
  if b.channel <> 'ads' and p_to in ('en_produccion', 'en_aprobacion') then
    raise exception 'Una tarea de % no pasa por producción ni aprobación.',
      lower(public.brief_channel_label(b.channel));
  end if;

  -- Quien escribio el copy es quien lo revisa: la revision sobra. Desde copy,
  -- mandar a revisión o directo a la etapa de despues llega a la de despues,
  -- y queda dicho en el historial. El revisor puede venir en p_assigned.
  v_siguiente := case when b.channel = 'ads' then 'en_produccion' else 'en_lanzamiento' end;
  v_revisor := case when p_to = 'en_revision' and p_assigned is not null
                    then p_assigned else b.reviewer_id end;
  v_sin_revision := b.status = 'borrador' and v_revisor is not null and v_revisor = b.writer_id
                    and p_to in ('en_revision', v_siguiente);
  if v_sin_revision then
    v_to := v_siguiente;
  end if;

  v_normal := v_sin_revision or public.brief_step_ok(b.channel, b.status, p_to);
  if not v_normal and not public.is_admin() then
    if b.status = 'en_aprobacion' and p_to = 'en_lanzamiento' then
      raise exception 'Pasa a lanzamiento cuando copy y media la aprueban.';
    end if;
    raise exception 'No se puede pasar de % a %.', b.status, p_to;
  end if;

  v_regresa := public.brief_status_rank(p_to) < public.brief_status_rank(b.status);
  if v_normal and v_regresa and v_nota is null then
    raise exception 'Para regresar una tarea hay que escribir el motivo.';
  end if;

  if p_assigned is not null then
    case p_to
      when 'borrador'       then b.writer_id := p_assigned;
      when 'en_revision'    then b.reviewer_id := p_assigned;
      when 'en_produccion'  then b.producer_id := p_assigned;
      when 'en_lanzamiento' then b.launcher_id := p_assigned;
      else null;
    end case;
  end if;

  v_owner := case v_to
    when 'borrador'       then b.writer_id
    when 'en_revision'    then b.reviewer_id
    when 'en_produccion'  then b.producer_id
    when 'en_lanzamiento' then b.launcher_id
  end;

  if v_to in ('borrador', 'en_revision', 'en_produccion', 'en_lanzamiento') and v_owner is null then
    raise exception 'Falta elegir quién se encarga %.',
      case v_to when 'borrador' then 'del copy'
                when 'en_revision' then 'de la revisión'
                when 'en_produccion' then 'de la producción'
                else 'del lanzamiento' end;
  end if;
  if v_to = 'en_aprobacion' and (b.reviewer_id is null or b.launcher_id is null) then
    raise exception 'Para aprobar hacen falta copy (revisión) y media (lanzamiento).';
  end if;

  perform set_config('app.brief_flow', 'on', true);
  update briefs
     set status = v_to,
         writer_id = b.writer_id,
         reviewer_id = b.reviewer_id,
         producer_id = b.producer_id,
         launcher_id = b.launcher_id,
         assigned_to = v_owner,
         copy_ok_by = null, copy_ok_at = null,
         media_ok_by = null, media_ok_at = null,
         updated_by = v_actor,
         updated_at = now()
   where id = p_brief;
  perform set_config('app.brief_flow', 'off', true);

  insert into brief_events (brief_id, from_status, to_status, assigned_to, note, actor, kind)
  values (p_brief, b.status, v_to, v_owner,
          coalesce(v_nota, case when v_sin_revision
                                then 'Sin revisión: quien escribió el copy también lo revisa.' end),
          v_actor, case when v_normal then 'paso' else 'salto' end);

  -- Pedir cambios en aprobación: el motivo tambien va al hilo.
  if b.status = 'en_aprobacion' and v_regresa and v_nota is not null then
    insert into brief_comments (brief_id, author, kind, body)
    values (p_brief, v_actor, 'cambios', v_nota);
  end if;

  v_canal := public.brief_channel_label(b.channel);

  -- ---- avisos ----
  if v_regresa and v_owner is not null and v_owner is distinct from public.sin_aviso(v_actor) then
    insert into notifications (profile_id, kind, brief_id, client_id, title, body)
    values (v_owner, 'devuelto', p_brief, b.client_id,
            case when b.status = 'en_aprobacion'
                 then format('Piden cambios en "%s"', b.title)
                 else format('Te regresaron "%s"', b.title) end,
            coalesce(v_nota, 'La movió un admin.'));

  elsif v_to = 'lanzado' and b.created_by is distinct from public.sin_aviso(v_actor) then
    insert into notifications (profile_id, kind, brief_id, client_id, title, body)
    values (b.created_by, 'lanzado', p_brief, b.client_id,
            format('"%s" ya salió', b.title),
            format('%s · campaña de %s', v_cliente, v_canal));

  elsif v_to = 'en_aprobacion' then
    select * into b from briefs where id = p_brief;
    perform public.notify_brief_approvers(b, v_actor, v_cliente, v_canal);

  elsif v_owner is not null and v_owner is distinct from public.sin_aviso(v_actor) then
    insert into notifications (profile_id, kind, brief_id, client_id, title, body)
    values (v_owner, v_to, p_brief, b.client_id,
            case v_to
              when 'borrador'      then format('Te toca el copy de "%s"', b.title)
              when 'en_revision'   then format('Revisa "%s"', b.title)
              when 'en_produccion' then format('Te toca producir "%s"', b.title)
              else format('"%s" está lista para lanzar', b.title)
            end,
            format('%s · campaña de %s', v_cliente, v_canal));
  end if;

  return v_to;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_brief_owner(p_brief uuid, p_stage text, p_profile uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := auth.uid();
  b briefs%rowtype;
  v_cliente text;
  v_aprueba boolean;
  v_antes uuid;
begin
  if v_actor is null then
    raise exception 'No hay sesión.';
  end if;
  if p_stage not in ('borrador', 'en_revision', 'en_produccion', 'en_lanzamiento') then
    raise exception 'Etapa desconocida: %.', p_stage;
  end if;

  select * into b from briefs where id = p_brief for update;
  if not found or not public.client_in_my_org(b.client_id) then
    raise exception 'La tarea no existe.';
  end if;

  if b.status = p_stage and p_profile is null then
    raise exception 'La etapa en curso necesita a alguien a cargo.';
  end if;

  v_aprueba := b.status = 'en_aprobacion' and p_stage in ('en_revision', 'en_lanzamiento');
  v_antes := case when p_stage = 'en_revision' then b.reviewer_id else b.launcher_id end;
  if v_aprueba and p_profile is null then
    raise exception 'La aprobación en curso necesita a copy y a media.';
  end if;

  perform set_config('app.brief_flow', 'on', true);
  update briefs
     set writer_id   = case when p_stage = 'borrador'       then p_profile else writer_id end,
         reviewer_id = case when p_stage = 'en_revision'    then p_profile else reviewer_id end,
         producer_id = case when p_stage = 'en_produccion'  then p_profile else producer_id end,
         launcher_id = case when p_stage = 'en_lanzamiento' then p_profile else launcher_id end,
         assigned_to = case when status = p_stage then p_profile else assigned_to end,
         copy_ok_by  = case when v_aprueba and p_stage = 'en_revision'
                              and p_profile is distinct from reviewer_id then null else copy_ok_by end,
         copy_ok_at  = case when v_aprueba and p_stage = 'en_revision'
                              and p_profile is distinct from reviewer_id then null else copy_ok_at end,
         media_ok_by = case when v_aprueba and p_stage = 'en_lanzamiento'
                              and p_profile is distinct from launcher_id then null else media_ok_by end,
         media_ok_at = case when v_aprueba and p_stage = 'en_lanzamiento'
                              and p_profile is distinct from launcher_id then null else media_ok_at end,
         updated_by = v_actor,
         updated_at = now()
   where id = p_brief;
  perform set_config('app.brief_flow', 'off', true);

  select name into v_cliente from clients where id = b.client_id;

  if b.status = p_stage and p_profile is distinct from b.assigned_to then
    insert into brief_events (brief_id, from_status, to_status, assigned_to, note, actor)
    values (p_brief, b.status, b.status, p_profile, null, v_actor);

    if p_profile is distinct from public.sin_aviso(v_actor) then
      insert into notifications (profile_id, kind, brief_id, client_id, title, body)
      values (p_profile, p_stage, p_brief, b.client_id,
              format('Te pasaron "%s"', b.title), v_cliente);
    end if;
  end if;

  if v_aprueba and p_profile is distinct from v_antes then
    insert into brief_events (brief_id, from_status, to_status, assigned_to, note, actor)
    values (p_brief, b.status, b.status, p_profile, null, v_actor);

    if p_profile is distinct from public.sin_aviso(v_actor) then
      insert into notifications (profile_id, kind, brief_id, client_id, title, body)
      values (p_profile, 'en_aprobacion', p_brief, b.client_id,
              format('Aprueba los diseños de "%s"', b.title), v_cliente);
    end if;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.start_brief_stage(p_brief uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := auth.uid();
  b briefs%rowtype;
begin
  if v_actor is null then
    raise exception 'No hay sesión.';
  end if;

  select * into b from briefs where id = p_brief for update;
  if not found or not public.client_in_my_org(b.client_id) then
    raise exception 'La tarea no existe.';
  end if;
  if b.status not in ('borrador', 'en_revision', 'en_produccion', 'en_lanzamiento') then
    raise exception 'Esta tarea no tiene una etapa en curso.';
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
$function$;

/*
 * Pedir copy. Crea la tarea en la etapa de copy, a cargo de p_writer, y le
 * avisa. El canal, el Doc, el angulo y el resto de responsables los define copy.
 */
create or replace function public.request_copy(
  p_client uuid,
  p_title text,
  p_note text default null,
  p_due date default null,
  p_writer uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_title text := btrim(coalesce(p_title, ''));
  v_nota text := nullif(btrim(coalesce(p_note, '')), '');
  v_cliente text;
  v_id uuid;
begin
  if v_actor is null then
    raise exception 'No hay sesión.';
  end if;
  if not public.client_in_my_org(p_client) then
    raise exception 'Ese cliente no es de tu organización.';
  end if;
  if v_title = '' then
    raise exception 'Escribe qué se necesita.';
  end if;
  if length(v_title) > 140 then
    raise exception 'El pedido es muy largo: resúmelo en una línea (máximo 140).';
  end if;
  if p_writer is null then
    raise exception 'Elige a quién se le pide el copy.';
  end if;

  insert into briefs (client_id, title, request_note, due_date, channel, status,
                      writer_id, assigned_to, created_by, updated_by)
  values (p_client, v_title, v_nota, p_due, 'ads', 'borrador',
          p_writer, p_writer, v_actor, v_actor)
  returning id into v_id;

  insert into brief_events (brief_id, from_status, to_status, assigned_to, note, actor)
  values (v_id, null, 'borrador', p_writer, v_nota, v_actor);

  if p_writer is distinct from public.sin_aviso(v_actor) then
    select name into v_cliente from clients where id = p_client;
    insert into notifications (profile_id, kind, brief_id, client_id, title, body)
    values (p_writer, 'borrador', v_id, p_client,
            format('Te piden copy: "%s"', v_title),
            coalesce(v_cliente || ' · ' || v_nota, v_cliente));
  end if;

  return v_id;
end;
$$;

revoke all on function public.request_copy(uuid, text, text, date, uuid) from public;
grant execute on function public.request_copy(uuid, text, text, date, uuid) to authenticated;
