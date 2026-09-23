-- 0022_etapas.sql — el brief pasa por tres manos: revisión, producción y
-- lanzamiento, cada una con su responsable. Y dice por qué canal sale.
--
-- Antes habia un solo "asignado" que se reescribia en cada relevo, asi que al
-- crear el brief no se podia dejar dicho quien lanzaba. Ahora las tres personas
-- se eligen de entrada y el brief va pasando solo de una a otra.
--
-- 'lanzado' ahora SI se guarda. En 0016 se derivaba de los lanzamientos de
-- Meta, pero una campaña de SMS o de email no tiene lanzamientos en Meta: no
-- hay de donde derivarlo.

alter table briefs add column if not exists channel text not null default 'ads';
alter table briefs drop constraint if exists briefs_channel_check;
alter table briefs add constraint briefs_channel_check
  check (channel in ('ads', 'email', 'sms'));

alter table briefs add column if not exists reviewer_id uuid references profiles(id);
alter table briefs add column if not exists producer_id uuid references profiles(id);
alter table briefs add column if not exists launcher_id uuid references profiles(id);

-- assigned_to se queda como "quien tiene la pelota ahora": es lo que lee el
-- tablero y la pantalla de equipo. Lo mantiene transition_brief.
alter table briefs drop constraint if exists briefs_status_check;

-- Lo que habia: asignado y en diseño eran producción; listo es lanzamiento.
update briefs set producer_id = assigned_to
 where status in ('asignado', 'en_diseno') and producer_id is null;
update briefs set status = 'en_produccion' where status in ('asignado', 'en_diseno');
update briefs set status = 'en_lanzamiento' where status = 'listo';

alter table briefs add constraint briefs_status_check
  check (status in ('borrador', 'en_revision', 'en_produccion', 'en_lanzamiento', 'lanzado'));

/*
 * Los responsables tienen que ser de la misma organizacion que el cliente.
 * La FK solo dice que el perfil existe; en un SaaS eso no basta.
 */
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
      from unnest(array[new.reviewer_id, new.producer_id, new.launcher_id, new.assigned_to]) as o(id)
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
  before insert or update of reviewer_id, producer_id, launcher_id, assigned_to, client_id
  on briefs for each row execute function public.check_brief_owners();

/*
 * El estado solo lo mueve transition_brief. La policy de update deja editar el
 * brief (titulo, link, fecha), y sin esto tambien dejaria saltarse el flujo
 * con un update directo: sin evento, sin aviso.
 */
create or replace function public.guard_brief_status()
returns trigger
language plpgsql
as $$
begin
  if (new.status is distinct from old.status or new.assigned_to is distinct from old.assigned_to)
     and coalesce(current_setting('app.brief_flow', true), '') <> 'on' then
    raise exception 'El estado del brief se cambia con los botones del flujo.';
  end if;
  return new;
end;
$$;

drop trigger if exists briefs_guard_status on briefs;
create trigger briefs_guard_status
  before update on briefs for each row execute function public.guard_brief_status();

create or replace function public.brief_stage_owner(
  p_status text, p_reviewer uuid, p_producer uuid, p_launcher uuid
)
returns uuid
language sql
immutable
as $$
  select case p_status
    when 'en_revision'    then p_reviewer
    when 'en_produccion'  then p_producer
    when 'en_lanzamiento' then p_launcher
    else null
  end;
$$;

/*
 * transition_brief, por etapas.
 *
 *   borrador       → en_revision | en_produccion (revisar es opcional)
 *   en_revision    → en_produccion | borrador*
 *   en_produccion  → en_lanzamiento | en_revision*
 *   en_lanzamiento → lanzado | en_produccion*
 *   lanzado        → en_lanzamiento*
 *   (* = regresar: pide motivo, porque quien lo recibe tiene que saber que corregir)
 *
 * Entrar a una etapa exige que tenga responsable. p_assigned, si viene, lo
 * cambia para esa etapa. Se avisa al responsable de la etapa a la que se entra;
 * al lanzar se avisa a quien creo el brief. Nunca a quien hizo el cambio.
 */
drop function if exists public.transition_brief(uuid, text, uuid, text);
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
  b briefs%rowtype;
  v_cliente text;
  v_owner uuid;
  v_regresa boolean;
  v_canal text;
begin
  if v_actor is null then
    raise exception 'No hay sesión.';
  end if;

  select * into b from briefs where id = p_brief for update;
  if not found then
    raise exception 'El brief no existe.';
  end if;
  if not public.client_in_my_org(b.client_id) then
    raise exception 'Ese brief no es de tu organización.';
  end if;
  select name into v_cliente from clients where id = b.client_id;

  if not (
       (b.status = 'borrador'       and p_to in ('en_revision', 'en_produccion'))
    or (b.status = 'en_revision'    and p_to in ('en_produccion', 'borrador'))
    or (b.status = 'en_produccion'  and p_to in ('en_lanzamiento', 'en_revision'))
    or (b.status = 'en_lanzamiento' and p_to in ('lanzado', 'en_produccion'))
    or (b.status = 'lanzado'        and p_to in ('en_lanzamiento'))
  ) then
    raise exception 'No se puede pasar de % a %.', b.status, p_to;
  end if;

  v_regresa := (b.status, p_to) in (
    ('en_revision', 'borrador'), ('en_produccion', 'en_revision'),
    ('en_lanzamiento', 'en_produccion'), ('lanzado', 'en_lanzamiento'));

  if v_regresa and coalesce(btrim(p_note), '') = '' then
    raise exception 'Para regresar un brief hay que escribir el motivo.';
  end if;

  if p_assigned is not null then
    case p_to
      when 'en_revision'    then b.reviewer_id := p_assigned;
      when 'en_produccion'  then b.producer_id := p_assigned;
      when 'en_lanzamiento' then b.launcher_id := p_assigned;
      else null;
    end case;
  end if;

  v_owner := public.brief_stage_owner(p_to, b.reviewer_id, b.producer_id, b.launcher_id);

  if p_to in ('en_revision', 'en_produccion', 'en_lanzamiento') and v_owner is null then
    raise exception 'Falta elegir quién se encarga %.',
      case p_to when 'en_revision' then 'de la revisión'
                when 'en_produccion' then 'de la producción'
                else 'del lanzamiento' end;
  end if;

  perform set_config('app.brief_flow', 'on', true);
  update briefs
     set status = p_to,
         reviewer_id = b.reviewer_id,
         producer_id = b.producer_id,
         launcher_id = b.launcher_id,
         assigned_to = v_owner,
         updated_by = v_actor,
         updated_at = now()
   where id = p_brief;
  perform set_config('app.brief_flow', 'off', true);

  insert into brief_events (brief_id, from_status, to_status, assigned_to, note, actor)
  values (p_brief, b.status, p_to, v_owner, nullif(btrim(p_note), ''), v_actor);

  v_canal := case b.channel when 'email' then 'Email' when 'sms' then 'SMS' else 'Ads' end;

  -- ---- avisos ----
  if v_regresa and v_owner is not null and v_owner <> v_actor then
    insert into notifications (profile_id, kind, brief_id, client_id, title, body)
    values (v_owner, 'devuelto', p_brief, b.client_id,
            format('Te regresaron "%s"', b.title), p_note);

  elsif p_to = 'lanzado' and b.created_by <> v_actor then
    insert into notifications (profile_id, kind, brief_id, client_id, title, body)
    values (b.created_by, 'lanzado', p_brief, b.client_id,
            format('"%s" ya salió', b.title),
            format('%s · campaña de %s', v_cliente, v_canal));

  elsif v_owner is not null and v_owner <> v_actor then
    insert into notifications (profile_id, kind, brief_id, client_id, title, body)
    values (v_owner, p_to, p_brief, b.client_id,
            case p_to
              when 'en_revision'   then format('Revisa "%s"', b.title)
              when 'en_produccion' then format('Te toca producir "%s"', b.title)
              else format('"%s" está listo para lanzar', b.title)
            end,
            format('%s · campaña de %s', v_cliente, v_canal));
  end if;

  return p_to;
end;
$$;

revoke all on function public.transition_brief(uuid, text, uuid, text) from public;
grant execute on function public.transition_brief(uuid, text, uuid, text) to authenticated;

/*
 * Cambiar el responsable de una etapa sin mover el brief. Si es la etapa en la
 * que esta, la pelota cambia de manos: se registra y se avisa al nuevo.
 */
create or replace function public.set_brief_owner(
  p_brief uuid,
  p_stage text,
  p_profile uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  b briefs%rowtype;
  v_cliente text;
begin
  if v_actor is null then
    raise exception 'No hay sesión.';
  end if;
  if p_stage not in ('en_revision', 'en_produccion', 'en_lanzamiento') then
    raise exception 'Etapa desconocida: %.', p_stage;
  end if;

  select * into b from briefs where id = p_brief for update;
  if not found or not public.client_in_my_org(b.client_id) then
    raise exception 'El brief no existe.';
  end if;

  if b.status = p_stage and p_profile is null then
    raise exception 'La etapa en curso necesita a alguien a cargo.';
  end if;

  perform set_config('app.brief_flow', 'on', true);
  update briefs
     set reviewer_id = case when p_stage = 'en_revision'    then p_profile else reviewer_id end,
         producer_id = case when p_stage = 'en_produccion'  then p_profile else producer_id end,
         launcher_id = case when p_stage = 'en_lanzamiento' then p_profile else launcher_id end,
         assigned_to = case when status = p_stage then p_profile else assigned_to end,
         updated_by = v_actor,
         updated_at = now()
   where id = p_brief;
  perform set_config('app.brief_flow', 'off', true);

  if b.status = p_stage and p_profile is distinct from b.assigned_to then
    insert into brief_events (brief_id, from_status, to_status, assigned_to, note, actor)
    values (p_brief, b.status, b.status, p_profile, null, v_actor);

    if p_profile <> v_actor then
      select name into v_cliente from clients where id = b.client_id;
      insert into notifications (profile_id, kind, brief_id, client_id, title, body)
      values (p_profile, p_stage, p_brief, b.client_id,
              format('Te pasaron "%s"', b.title), v_cliente);
    end if;
  end if;
end;
$$;

revoke all on function public.set_brief_owner(uuid, text, uuid) from public;
grant execute on function public.set_brief_owner(uuid, text, uuid) to authenticated;
