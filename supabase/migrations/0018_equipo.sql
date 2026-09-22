-- 0018_equipo.sql — administrar el equipo desde la app.
--
-- Hasta ahora el rol solo se elegia al registrarse y cambiarlo era un UPDATE a
-- mano en SQL. Con los avisos de la fase 3 el rol dejo de ser decorativo: de
-- el depende a quien le llega "listo para lanzar".

/*
 * Cambiar el rol de alguien.
 *
 * profiles_update_own solo deja editar la fila propia, asi que esto va por
 * funcion. Admin, misma organizacion, y una guarda: no se puede quitar al
 * ultimo admin. Una organizacion sin admin no puede borrar nada, ni volver a
 * nombrar admins — se queda trabada sin forma de destrabarse desde la app.
 */
create or replace function public.set_member_role(p_profile uuid, p_role text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_org_id();
  v_actual text;
  v_org_destino uuid;
begin
  if auth.uid() is null then
    raise exception 'No hay sesión.';
  end if;
  if not public.is_admin() then
    raise exception 'Solo un admin puede cambiar roles.';
  end if;
  if p_role not in ('admin', 'media', 'copy', 'design', 'member') then
    raise exception 'Rol desconocido: %', p_role;
  end if;

  select role, org_id into v_actual, v_org_destino from profiles where id = p_profile;
  if not found then
    raise exception 'Esa persona no existe.';
  end if;
  if v_org_destino is distinct from v_org then
    raise exception 'Esa persona no es de tu organización.';
  end if;

  if v_actual = 'admin' and p_role <> 'admin'
     and (select count(*) from profiles where org_id = v_org and role = 'admin') <= 1 then
    raise exception 'Es el único admin: nombra otro antes de quitarle el rol.';
  end if;

  update profiles set role = p_role where id = p_profile;
  return p_role;
end;
$$;

revoke all on function public.set_member_role(uuid, text) from public;
grant execute on function public.set_member_role(uuid, text) to authenticated;

-- Asignarse clientes a uno mismo es inofensivo y util: es un filtro de vista,
-- no un permiso. Los admin pueden acomodar a cualquiera; cada quien se acomoda
-- a si mismo sin pedir permiso.
drop policy if exists client_members_write on client_members;
drop policy if exists client_members_insert on client_members;
create policy client_members_insert on client_members
  for insert to authenticated
  with check (
    public.client_in_my_org(client_id)
    and (profile_id = auth.uid() or public.is_admin())
  );

drop policy if exists client_members_delete on client_members;
create policy client_members_delete on client_members
  for delete to authenticated
  using (
    public.client_in_my_org(client_id)
    and (profile_id = auth.uid() or public.is_admin())
  );
