-- 0035_rol_tech.sql — rol nuevo: Tech.
--
-- Como las otras areas: no bloquea nada, decide a quien se le ofrece cada
-- etapa y se puede elegir al registrarse.

alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('admin', 'media', 'copy', 'design', 'tech', 'member'));

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  rol text := coalesce(new.raw_user_meta_data->>'role', 'member');
  org uuid;
begin
  if rol not in ('media', 'copy', 'design', 'tech', 'member') then
    rol := 'member';   -- 'admin' nunca se auto-asigna al registrarse.
  end if;

  select id into org from orgs where domain = lower(split_part(new.email, '@', 2));

  insert into public.profiles (id, full_name, role, org_id)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'full_name', ''),
      split_part(new.email, '@', 1)
    ),
    rol,
    org
  )
  on conflict (id) do nothing;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_member_role(p_profile uuid, p_role text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if p_role not in ('admin', 'media', 'copy', 'design', 'tech', 'member') then
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
$function$;
