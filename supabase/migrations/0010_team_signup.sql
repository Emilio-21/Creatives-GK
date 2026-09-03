-- 0010_team_signup.sql — alta del equipo con dominio permitido y roles por area.

-- 1. Roles por departamento. 'member' se queda como valor por defecto para
--    quien no elija nada.
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('admin', 'media', 'copy', 'design', 'member'));

-- 2. El candado del dominio va AQUI, no en la pantalla de registro.
--    La anon key es publica: cualquiera puede llamar a /auth/v1/signup con el
--    correo que quiera. Validar solo en la Server Action deja la puerta abierta.
create or replace function public.enforce_email_domain()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  dominio text := lower(split_part(new.email, '@', 2));
begin
  if dominio <> 'growthkingdom.com' then
    raise exception 'Solo se permiten correos @growthkingdom.com.'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_email_domain_on_signup on auth.users;
create trigger enforce_email_domain_on_signup
  before insert on auth.users
  for each row execute function public.enforce_email_domain();

-- 3. El rol que la persona elige al registrarse viaja en raw_user_meta_data.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rol text := coalesce(new.raw_user_meta_data->>'role', 'member');
begin
  if rol not in ('media', 'copy', 'design', 'member') then
    rol := 'member';   -- 'admin' nunca se auto-asigna al registrarse.
  end if;

  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'full_name', ''),
      split_part(new.email, '@', 1)
    ),
    rol
  )
  on conflict (id) do nothing;

  return new;
end;
$$;
