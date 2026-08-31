-- 0003_auth_trigger.sql — crea el profile al crear el usuario (§ Fase 1).
-- Sin esto, creatives.uploaded_by no tiene a quien apuntar y el primer insert truena.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'full_name', ''),
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill: usuarios que ya existian antes del trigger.
insert into public.profiles (id, full_name)
select u.id, coalesce(nullif(u.raw_user_meta_data->>'full_name',''), split_part(u.email,'@',1))
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);
