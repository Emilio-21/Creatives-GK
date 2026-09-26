-- 0032_vsl_funnel.sql — dos canales mas: VSL y Funnel.
--
-- Los dos llevan pieza que producir (el video, las paginas), asi que van por
-- el camino largo, como ads: copy → revisión → producción → aprobación →
-- lanzamiento. Email y mensaje siguen siendo solo copy.
--
-- La subida de diseños a la biblioteca sigue siendo solo de ads: es la que se
-- mide contra Meta.

alter table briefs drop constraint if exists briefs_channel_check;
alter table briefs add constraint briefs_channel_check
  check (channel in ('ads', 'email', 'sms', 'vsl', 'funnel'));

-- Los canales que producen una pieza. Uno nuevo con produccion va aqui y en
-- hasProduction (src/lib/brief-flow.ts).
create or replace function public.brief_con_produccion(p_channel text)
returns boolean
language sql
immutable
as $$
  select p_channel in ('ads', 'vsl', 'funnel');
$$;

CREATE OR REPLACE FUNCTION public.brief_step_ok(p_channel text, p_from text, p_to text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case when public.brief_con_produccion(p_channel) then (p_from, p_to) in (
      ('borrador', 'en_revision'), ('borrador', 'en_produccion'),
      ('en_revision', 'en_produccion'), ('en_revision', 'borrador'),
      ('en_produccion', 'en_aprobacion'), ('en_produccion', 'en_revision'),
      ('en_aprobacion', 'en_produccion'),
      ('en_lanzamiento', 'lanzado'), ('en_lanzamiento', 'en_produccion'),
      ('lanzado', 'en_lanzamiento'))
  else (p_from, p_to) in (
      ('borrador', 'en_revision'),
      ('en_revision', 'en_lanzamiento'), ('en_revision', 'borrador'),
      ('en_lanzamiento', 'lanzado'), ('en_lanzamiento', 'en_revision'),
      ('lanzado', 'en_lanzamiento'))
  end;
$function$;

CREATE OR REPLACE FUNCTION public.brief_channel_label(p_channel text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case p_channel when 'email' then 'Email' when 'sms' then 'Mensaje' when 'vsl' then 'VSL' when 'funnel' then 'Funnel'
    else 'Ads' end;
$function$;

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
  if not public.brief_con_produccion(b.channel) and p_to in ('en_produccion', 'en_aprobacion') then
    raise exception 'Una tarea de % no pasa por producción ni aprobación.',
      lower(public.brief_channel_label(b.channel));
  end if;

  -- Quien escribio el copy es quien lo revisa: la revision sobra. Desde copy,
  -- mandar a revisión o directo a la etapa de despues llega a la de despues,
  -- y queda dicho en el historial. El revisor puede venir en p_assigned.
  v_siguiente := case when public.brief_con_produccion(b.channel) then 'en_produccion'
                     else 'en_lanzamiento' end;
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

CREATE OR REPLACE FUNCTION public.add_brief_comment(p_brief uuid, p_body text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := auth.uid();
  b briefs%rowtype;
  v_body text := btrim(coalesce(p_body, ''));
  v_nombre text;
  v_id uuid;
begin
  if v_actor is null then
    raise exception 'No hay sesión.';
  end if;
  if v_body = '' then
    raise exception 'Escribe algo antes de mandar.';
  end if;
  if length(v_body) > 4000 then
    raise exception 'El comentario es muy largo (máximo 4000 caracteres).';
  end if;

  select * into b from briefs where id = p_brief;
  if not found or not public.client_in_my_org(b.client_id) then
    raise exception 'La tarea no existe.';
  end if;

  insert into brief_comments (brief_id, author, kind, body)
  values (p_brief, v_actor, 'comentario', v_body)
  returning id into v_id;

  select coalesce(full_name, 'Alguien') into v_nombre from profiles where id = v_actor;

  insert into notifications (profile_id, kind, brief_id, client_id, title, body)
  select distinct o.id, 'comentario', b.id, b.client_id,
         format('%s comentó en "%s"', v_nombre, b.title),
         left(v_body, 300)
    from unnest(array[b.created_by, b.reviewer_id,
                      case when public.brief_con_produccion(b.channel) then b.producer_id end,
                      b.launcher_id]) as o(id)
   where o.id is not null and o.id is distinct from public.sin_aviso(v_actor);

  return v_id;
end;
$function$;
