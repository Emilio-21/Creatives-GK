-- 0013_variantes.sql — un anuncio puede tener varios archivos.
--
-- Los estaticos salen en par: la version 1:1 para feed y la 9:16 para historia
-- entran al MISMO anuncio de Meta como assets por placement. Hasta ahora la app
-- suponia 1 archivo = 1 anuncio, y de ahi salian tres errores:
--   1. cada archivo recibia su propio [GK-xxxx], pero en el nombre del anuncio
--      solo cabe uno, asi que la mitad del par nunca recibia metricas;
--   2. la numeracion del batch contaba Ad01 y Ad02 donde habia un solo anuncio;
--   3. el tablero mostraba el doble de tarjetas de las que hay anuncios.
--
-- El codigo identifica al ANUNCIO, no al archivo: por eso vive en el padre.

alter table creatives
  add column if not exists parent_id uuid references creatives(id) on delete cascade;

create index if not exists creatives_parent_idx on creatives (parent_id);

-- Un solo nivel: una variante no puede tener variantes, y nada es su propio
-- padre. Sin esto una cadena a->b->c dejaria archivos invisibles en el tablero,
-- porque la vista solo baja un nivel.
create or replace function public.check_variante_plana()
returns trigger
language plpgsql
as $$
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'Un creativo no puede ser su propia variante.';
  end if;

  if exists (select 1 from creatives where id = new.parent_id and parent_id is not null) then
    raise exception 'Ese creativo ya es una variante: elige el principal del grupo.';
  end if;

  if exists (select 1 from creatives where parent_id = new.id) then
    raise exception 'Ese creativo ya tiene variantes colgando: primero desagrupalo.';
  end if;

  return new;
end;
$$;

drop trigger if exists creatives_variante_plana on creatives;
create trigger creatives_variante_plana
  before insert or update of parent_id on creatives
  for each row execute function public.check_variante_plana();

/*
 * Agrupar y desagrupar.
 *
 * Van por funcion y no por update directo por lo mismo que 0012: la policy de
 * creatives solo deja al que subio el archivo, y aqui el par lo suben dos
 * personas distintas tan seguido como una sola. Las funciones tocan unicamente
 * parent_id y batch_id.
 */
create or replace function public.group_creatives_as_ad(
  p_parent uuid,
  p_variantes uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  afectados integer;
  v_client uuid;
  v_batch uuid;
begin
  if auth.uid() is null then
    raise exception 'No hay sesión.';
  end if;

  if p_parent is null or p_variantes is null or array_length(p_variantes, 1) is null then
    return 0;
  end if;

  select client_id, batch_id into v_client, v_batch
    from creatives
   where id = p_parent and parent_id is null;

  if not found then
    raise exception 'El creativo principal no existe o ya es una variante.';
  end if;

  -- Una variante con lanzamientos ya tiene metricas propias: absorberla las
  -- dejaria colgadas de una fila que el tablero deja de mostrar.
  if exists (
    select 1 from launches
     where creative_id = any(p_variantes)
  ) then
    raise exception 'Una de las variantes ya tiene lanzamientos. Desvinculalos antes de agrupar.';
  end if;

  update creatives
     set parent_id = p_parent,
         -- La variante hereda el batch del principal: el anuncio es uno solo y
         -- vive en un unico ad set.
         batch_id = v_batch
   where id = any(p_variantes)
     and id <> p_parent
     and client_id is not distinct from v_client
     and parent_id is null
     and not exists (select 1 from creatives hijo where hijo.parent_id = creatives.id);

  get diagnostics afectados = row_count;
  return afectados;
end;
$$;

create or replace function public.ungroup_creatives(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  afectados integer;
begin
  if auth.uid() is null then
    raise exception 'No hay sesión.';
  end if;

  if p_ids is null or array_length(p_ids, 1) is null then
    return 0;
  end if;

  update creatives set parent_id = null where id = any(p_ids) and parent_id is not null;
  get diagnostics afectados = row_count;
  return afectados;
end;
$$;

revoke all on function public.group_creatives_as_ad(uuid, uuid[]) from public;
revoke all on function public.ungroup_creatives(uuid[]) from public;
grant execute on function public.group_creatives_as_ad(uuid, uuid[]) to authenticated;
grant execute on function public.ungroup_creatives(uuid[]) to authenticated;
