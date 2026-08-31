-- 0002_rls.sql — equipo cerrado: todo usuario autenticado ve todo.
-- OJO (§5): con R2 la RLS ya no protege los archivos, solo los registros.

-- Helper security definer: evita recursion al consultar profiles desde una policy de profiles.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

alter table profiles  enable row level security;
alter table creatives enable row level security;
alter table launches  enable row level security;
alter table downloads enable row level security;

-- profiles: SELECT para authenticated; UPDATE solo del propio registro.
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles
  for select to authenticated using (true);

drop policy if exists profiles_update_own on profiles;
create policy profiles_update_own on profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- creatives: SELECT/INSERT authenticated; UPDATE/DELETE solo dueño o admin.
drop policy if exists creatives_select on creatives;
create policy creatives_select on creatives
  for select to authenticated using (true);

drop policy if exists creatives_insert on creatives;
create policy creatives_insert on creatives
  for insert to authenticated with check (uploaded_by = auth.uid());

drop policy if exists creatives_update on creatives;
create policy creatives_update on creatives
  for update to authenticated
  using (uploaded_by = auth.uid() or public.is_admin())
  with check (uploaded_by = auth.uid() or public.is_admin());

drop policy if exists creatives_delete on creatives;
create policy creatives_delete on creatives
  for delete to authenticated
  using (uploaded_by = auth.uid() or public.is_admin());

-- launches: SELECT/INSERT/UPDATE authenticated; DELETE solo admin.
drop policy if exists launches_select on launches;
create policy launches_select on launches
  for select to authenticated using (true);

drop policy if exists launches_insert on launches;
create policy launches_insert on launches
  for insert to authenticated with check (created_by = auth.uid());

drop policy if exists launches_update on launches;
create policy launches_update on launches
  for update to authenticated using (true) with check (true);

drop policy if exists launches_delete on launches;
create policy launches_delete on launches
  for delete to authenticated using (public.is_admin());

-- downloads: INSERT/SELECT para authenticated.
drop policy if exists downloads_select on downloads;
create policy downloads_select on downloads
  for select to authenticated using (true);

drop policy if exists downloads_insert on downloads;
create policy downloads_insert on downloads
  for insert to authenticated with check (user_id = auth.uid());

grant usage on schema public to authenticated;
grant select, insert, update, delete on profiles, creatives, launches, downloads to authenticated;
grant select on creative_stats to authenticated;
