-- 0026_perfil.sql — foto y nombre editables, y el perfil deja de ser editable entero.
--
-- La policy profiles_update_own (id = auth.uid()) dejaba cambiar CUALQUIER
-- columna del perfil propio: con un update directo por la API, cualquiera se
-- podia poner role = 'admin' o cambiarse de organizacion. Ahora un update
-- directo solo puede tocar el nombre y la foto. El rol lo cambia un admin con
-- set_member_role; la organizacion, nadie desde la app; slack_user_id, el
-- servidor.

alter table profiles add column if not exists avatar_path text;

create or replace function public.guard_profile_update()
returns trigger
language plpgsql
as $$
begin
  -- Las funciones SECURITY DEFINER (set_member_role, set_slack_notify) y el
  -- servidor con service role no corren como 'authenticated': pasan.
  if current_user in ('authenticated', 'anon') and (
       new.id is distinct from old.id
    or new.role is distinct from old.role
    or new.org_id is distinct from old.org_id
    or new.slack_user_id is distinct from old.slack_user_id
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Desde tu perfil solo puedes cambiar tu nombre y tu foto.';
  end if;

  if new.full_name is distinct from old.full_name
     and length(btrim(coalesce(new.full_name, ''))) not between 1 and 80 then
    raise exception 'El nombre va de 1 a 80 caracteres.';
  end if;
  new.full_name := btrim(new.full_name);

  -- La foto solo puede apuntar a la carpeta de esa persona en R2.
  if new.avatar_path is not null
     and new.avatar_path not like 'avatars/' || new.id::text || '/%' then
    raise exception 'Esa foto no es tuya.';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_update on profiles;
create trigger profiles_guard_update
  before update on profiles for each row execute function public.guard_profile_update();
