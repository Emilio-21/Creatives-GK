-- 0012_assign_batch.sql — mover creativos ya subidos a un batch.
--
-- Va por funcion y no por policy porque creatives_update solo deja al que subio
-- el archivo (o a un admin). Organizar la biblioteca es trabajo de equipo:
-- copy tiene que poder agrupar lo que subio diseño. La funcion es SECURITY
-- DEFINER pero toca UNICAMENTE batch_id, asi que no abre el resto de columnas.

create or replace function public.assign_creatives_to_batch(
  p_ids uuid[],
  p_batch uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  afectados integer;
  v_client uuid;
begin
  if auth.uid() is null then
    raise exception 'No hay sesión.';
  end if;

  if p_ids is null or array_length(p_ids, 1) is null then
    return 0;
  end if;

  if p_batch is null then
    update creatives set batch_id = null where id = any(p_ids);
  else
    select client_id into v_client
      from batches
     where id = p_batch and archived_at is null;

    if v_client is null then
      raise exception 'El batch no existe o está archivado.';
    end if;

    -- Un batch pertenece a un cliente: mover ahi un creativo de otro cliente
    -- romperia el agrupado y las metricas del batch.
    update creatives
       set batch_id = p_batch
     where id = any(p_ids)
       and client_id = v_client;
  end if;

  get diagnostics afectados = row_count;
  return afectados;
end;
$$;

revoke all on function public.assign_creatives_to_batch(uuid[], uuid) from public;
grant execute on function public.assign_creatives_to_batch(uuid[], uuid) to authenticated;
