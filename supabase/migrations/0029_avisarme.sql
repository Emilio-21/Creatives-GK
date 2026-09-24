-- 0029_avisarme.sql — interruptor para que el aviso tambien le llegue a quien
-- hizo el cambio. Apagado es lo normal: nadie necesita un aviso de lo que acaba
-- de hacer. Prendido sirve para demostrar Relevo con una sola persona.
--
--   update app_flags set enabled = true  where key = 'avisarme_a_mi';   -- prender
--   update app_flags set enabled = false where key = 'avisarme_a_mi';   -- apagar

create table if not exists app_flags (
  key text primary key,
  enabled boolean not null default false
);
alter table app_flags enable row level security;   -- sin policies: solo las funciones la leen
insert into app_flags (key, enabled) values ('avisarme_a_mi', false) on conflict (key) do nothing;

/*
 * A quien NO se le avisa: quien hizo el cambio. Con el interruptor prendido,
 * a nadie (null: "x is distinct from null" es cierto para cualquier persona).
 */
create or replace function public.sin_aviso(p_actor uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case when coalesce((select enabled from app_flags where key = 'avisarme_a_mi'), false)
              then null else p_actor end;
$$;

revoke all on function public.sin_aviso(uuid) from public;

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

  v_normal := public.brief_step_ok(b.channel, b.status, p_to);
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
  if p_to = 'en_aprobacion' and (b.reviewer_id is null or b.launcher_id is null) then
    raise exception 'Para aprobar hacen falta copy (revisión) y media (lanzamiento).';
  end if;

  perform set_config('app.brief_flow', 'on', true);
  update briefs
     set status = p_to,
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
  values (p_brief, b.status, p_to, v_owner, v_nota, v_actor,
          case when v_normal then 'paso' else 'salto' end);

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

  elsif p_to = 'lanzado' and b.created_by is distinct from public.sin_aviso(v_actor) then
    insert into notifications (profile_id, kind, brief_id, client_id, title, body)
    values (b.created_by, 'lanzado', p_brief, b.client_id,
            format('"%s" ya salió', b.title),
            format('%s · campaña de %s', v_cliente, v_canal));

  elsif p_to = 'en_aprobacion' then
    select * into b from briefs where id = p_brief;
    perform public.notify_brief_approvers(b, v_actor, v_cliente, v_canal);

  elsif v_owner is not null and v_owner is distinct from public.sin_aviso(v_actor) then
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

CREATE OR REPLACE FUNCTION public.approve_brief(p_brief uuid, p_note text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := auth.uid();
  b briefs%rowtype;
  v_copy boolean;
  v_media boolean;
  v_por_admin boolean := false;
  v_nota text := nullif(btrim(coalesce(p_note, '')), '');
  v_cliente text;
  v_canal text;
begin
  if v_actor is null then
    raise exception 'No hay sesión.';
  end if;

  select * into b from briefs where id = p_brief for update;
  if not found or not public.client_in_my_org(b.client_id) then
    raise exception 'La tarea no existe.';
  end if;
  if b.status <> 'en_aprobacion' then
    raise exception 'Esta tarea no está esperando aprobación.';
  end if;

  v_copy := b.reviewer_id = v_actor and b.copy_ok_at is null;
  v_media := b.launcher_id = v_actor and b.media_ok_at is null;

  if not v_copy and not v_media then
    if b.reviewer_id = v_actor or b.launcher_id = v_actor then
      return b.status;   -- ya habia aprobado
    end if;
    if not public.is_admin() then
      raise exception 'Aprueban copy (quien revisó) y media (quien lanza).';
    end if;
    v_por_admin := true;
    v_copy := b.copy_ok_at is null;
    v_media := b.media_ok_at is null;
  end if;

  perform set_config('app.brief_flow', 'on', true);
  update briefs
     set copy_ok_by  = case when v_copy  then v_actor else copy_ok_by end,
         copy_ok_at  = case when v_copy  then now()   else copy_ok_at end,
         media_ok_by = case when v_media then v_actor else media_ok_by end,
         media_ok_at = case when v_media then now()   else media_ok_at end,
         updated_by = v_actor,
         updated_at = now()
   where id = p_brief
  returning * into b;
  perform set_config('app.brief_flow', 'off', true);

  insert into brief_events (brief_id, from_status, to_status, assigned_to, note, actor, kind)
  values (p_brief, b.status, b.status, null,
          v_nota,
          v_actor, case when v_por_admin then 'salto' else 'aprobo' end);

  insert into brief_comments (brief_id, author, kind, body)
  values (p_brief, v_actor, 'aprobado', v_nota);

  if b.copy_ok_at is null or b.media_ok_at is null then
    return b.status;
  end if;

  -- Los dos vistos buenos: a lanzamiento.
  perform set_config('app.brief_flow', 'on', true);
  update briefs
     set status = 'en_lanzamiento',
         assigned_to = b.launcher_id,
         updated_at = now()
   where id = p_brief;
  perform set_config('app.brief_flow', 'off', true);

  -- Un milisegundo despues del visto bueno: en la misma transaccion now() es
  -- el mismo, y el historial los mostraria en cualquier orden.
  insert into brief_events (brief_id, from_status, to_status, assigned_to, note, actor, kind, created_at)
  values (p_brief, 'en_aprobacion', 'en_lanzamiento', b.launcher_id, null, v_actor, 'paso',
          now() + interval '1 millisecond');

  select name into v_cliente from clients where id = b.client_id;
  v_canal := public.brief_channel_label(b.channel);

  if b.launcher_id is distinct from public.sin_aviso(v_actor) then
    insert into notifications (profile_id, kind, brief_id, client_id, title, body)
    values (b.launcher_id, 'en_lanzamiento', p_brief, b.client_id,
            format('"%s" está aprobada: lista para lanzar', b.title),
            format('%s · campaña de %s', v_cliente, v_canal));
  end if;
  if b.producer_id is not null and b.producer_id is distinct from public.sin_aviso(v_actor)
     and b.producer_id is distinct from b.launcher_id then
    insert into notifications (profile_id, kind, brief_id, client_id, title, body)
    values (b.producer_id, 'aprobado', p_brief, b.client_id,
            format('Aprobaron los diseños de "%s"', b.title), v_cliente);
  end if;

  return 'en_lanzamiento';
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

  v_aprueba := b.status = 'en_aprobacion' and p_stage in ('en_revision', 'en_lanzamiento');
  v_antes := case when p_stage = 'en_revision' then b.reviewer_id else b.launcher_id end;
  if v_aprueba and p_profile is null then
    raise exception 'La aprobación en curso necesita a copy y a media.';
  end if;

  perform set_config('app.brief_flow', 'on', true);
  update briefs
     set reviewer_id = case when p_stage = 'en_revision'    then p_profile else reviewer_id end,
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

CREATE OR REPLACE FUNCTION public.notify_brief_approvers(b briefs, p_actor uuid, p_cliente text, p_canal text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  insert into notifications (profile_id, kind, brief_id, client_id, title, body)
  select distinct o.id, 'en_aprobacion', b.id, b.client_id,
         format('Aprueba los diseños de "%s"', b.title),
         format('%s · campaña de %s', p_cliente, p_canal)
    from unnest(array[b.reviewer_id, b.launcher_id]) as o(id)
   where o.id is not null and o.id is distinct from public.sin_aviso(p_actor);
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
                      case when b.channel = 'ads' then b.producer_id end,
                      b.launcher_id]) as o(id)
   where o.id is not null and o.id is distinct from public.sin_aviso(v_actor);

  return v_id;
end;
$function$;
