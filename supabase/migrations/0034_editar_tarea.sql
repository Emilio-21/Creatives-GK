-- 0034_editar_tarea.sql — el canal se puede cambiar despues de copy.
--
-- Antes solo se cambiaba en borrador. Ahora se cambia en cualquier etapa que
-- exista en el canal nuevo: un ads en revisión puede volverse email (email
-- tambien tiene revisión), pero un ads en producción o aprobación no, porque
-- email no tiene esas etapas y la tarea quedaria en un lugar que no existe.

create or replace function public.guard_brief_status()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('app.brief_flow', true), '') = 'on' then
    return new;
  end if;

  if new.status is distinct from old.status
     or new.assigned_to is distinct from old.assigned_to
     or new.stage_started_at is distinct from old.stage_started_at
     or new.stage_entered_at is distinct from old.stage_entered_at
     or new.copy_ok_by is distinct from old.copy_ok_by
     or new.copy_ok_at is distinct from old.copy_ok_at
     or new.media_ok_by is distinct from old.media_ok_by
     or new.media_ok_at is distinct from old.media_ok_at then
    raise exception 'El estado de la tarea se cambia con los botones del flujo.';
  end if;

  if new.channel is distinct from old.channel
     and old.status in ('en_produccion', 'en_aprobacion')
     and not public.brief_con_produccion(new.channel) then
    raise exception 'La tarea está en %: % no tiene esa etapa. Regrésala a revisión antes de cambiar el canal.',
      case old.status when 'en_produccion' then 'producción' else 'aprobación' end,
      public.brief_channel_label(new.channel);
  end if;

  -- Moverla de cliente con batch dejaria los diseños en un cliente y la tarea en otro.
  if new.client_id is distinct from old.client_id and old.batch_id is not null then
    raise exception 'Esta tarea ya tiene batch: no se puede mover a otro cliente.';
  end if;

  return new;
end;
$$;

/*
 * Regresar un creativo a "sin lanzar": para el clic accidental en "Marcar como
 * lanzado". Borra sus lanzamientos. Cualquiera del equipo puede quitar los que
 * no tienen nada (sin metricas ni anuncio de Meta: lo que deja ese clic); los
 * que ya tienen datos solo un admin, como borrar un lanzamiento en el detalle.
 */
create or replace function public.unlaunch_creative(p_creative uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_borrados integer;
begin
  if auth.uid() is null then
    raise exception 'No hay sesión.';
  end if;
  if not public.creative_in_my_org(p_creative) then
    raise exception 'Ese creativo no existe.';
  end if;

  if not public.is_admin() and exists (
    select 1 from launches
     where creative_id = p_creative
       and (meta_ad_id is not null
            or coalesce(spend, 0) <> 0 or coalesce(impressions, 0) <> 0
            or coalesce(reach, 0) <> 0 or coalesce(clicks, 0) <> 0
            or coalesce(results, 0) <> 0)
  ) then
    raise exception 'Ya tiene métricas registradas: solo un admin puede regresarlo a sin lanzar.';
  end if;

  delete from launches where creative_id = p_creative;
  get diagnostics v_borrados = row_count;
  return v_borrados;
end;
$$;

revoke all on function public.unlaunch_creative(uuid) from public, anon;
grant execute on function public.unlaunch_creative(uuid) to authenticated;
