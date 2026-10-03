-- 0036_aprobar_por_todos.sql — "Aprobar por todos" de un admin que ya aprobo.
--
-- Si el admin era copy o media y ya habia dado su visto bueno, approve_brief
-- regresaba sin hacer nada ("ya habia aprobado") en vez de aprobar por el que
-- faltaba. Ahora un admin siempre puede completar la aprobacion.

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
    -- Un admin que ya dio su visto bueno todavia puede aprobar por el que falta.
    if not public.is_admin() then
      if b.reviewer_id = v_actor or b.launcher_id = v_actor then
        return b.status;   -- ya habia aprobado
      end if;
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
