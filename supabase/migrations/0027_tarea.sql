-- 0027_tarea.sql — en pantalla un brief se llama "tarea".
--
-- Solo cambian los mensajes que ve la gente (errores y avisos). Las tablas,
-- columnas y funciones siguen llamandose brief: renombrarlas no cambia nada
-- para nadie y obliga a tocar cada consulta.

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
  v_regresa boolean;
  v_canal text;
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
    raise exception 'Para regresar una tarea hay que escribir el motivo.';
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
              else format('"%s" está lista para lanzar', b.title)
            end,
            format('%s · campaña de %s', v_cliente, v_canal));
  end if;

  return p_to;
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
begin
  if v_actor is null then
    raise exception 'No hay sesión.';
  end if;
  if p_stage not in ('en_revision', 'en_produccion', 'en_lanzamiento') then
    raise exception 'Etapa desconocida: %.', p_stage;
  end if;

  select * into b from briefs where id = p_brief for update;
  if not found or not public.client_in_my_org(b.client_id) then
    raise exception 'La tarea no existe.';
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
  if b.status not in ('en_revision', 'en_produccion', 'en_lanzamiento') then
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

CREATE OR REPLACE FUNCTION public.guard_brief_status()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if (new.status is distinct from old.status
      or new.assigned_to is distinct from old.assigned_to
      or new.stage_started_at is distinct from old.stage_started_at
      or new.stage_entered_at is distinct from old.stage_entered_at)
     and coalesce(current_setting('app.brief_flow', true), '') <> 'on' then
    raise exception 'El estado de la tarea se cambia con los botones del flujo.';
  end if;
  return new;
end;
$function$;
