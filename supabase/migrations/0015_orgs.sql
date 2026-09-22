-- 0015_orgs.sql — cada fila sabe a qué organización pertenece.
--
-- Hasta ahora las policies decian `using (true)`: cualquiera autenticado ve
-- todo, y el perimetro real era el trigger de dominio en auth.users. Eso
-- alcanza mientras solo exista Growth Kingdom. Deja de alcanzar el dia que
-- entre otra agencia, o que un cliente entre a ver lo suyo.
--
-- El org_id vive en DOS tablas, profiles y clients, y todo lo demas se deriva:
-- creatives, batches y briefs cuelgan de un cliente, y launches y downloads
-- cuelgan de un creativo. Denormalizarlo en las siete seria mas rapido de leer
-- y una fuente permanente de desincronizacion — a esta escala la diferencia de
-- velocidad no existe, y la de correccion si.

create table if not exists orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- El dominio de correo que da acceso. Hoy lo valida enforce_email_domain
  -- contra una constante; cuando haya una segunda org, lo valida contra esto.
  domain text not null unique,
  created_at timestamptz not null default now()
);

insert into orgs (name, domain)
  values ('Growth Kingdom', 'growthkingdom.com')
  on conflict (domain) do nothing;

alter table profiles add column if not exists org_id uuid references orgs(id);
alter table clients  add column if not exists org_id uuid references orgs(id);

-- Backfill: todo lo que existe hoy es de Growth Kingdom.
update profiles set org_id = (select id from orgs where domain = 'growthkingdom.com')
 where org_id is null;
update clients  set org_id = (select id from orgs where domain = 'growthkingdom.com')
 where org_id is null;

create index if not exists clients_org_idx  on clients (org_id);
create index if not exists profiles_org_idx on profiles (org_id);

-- Un creativo sin cliente seria invisible para siempre: ninguna policy lo
-- alcanzaria. Hoy no hay ninguno y la subida ya exige cliente, asi que se
-- cierra la puerta.
alter table creatives alter column client_id set not null;

/*
 * Los tres predicados que usan todas las policies.
 *
 * SECURITY DEFINER a proposito: leen profiles y clients, que a su vez tienen
 * policies que llaman a estas funciones. Sin definer, la evaluacion se muerde
 * la cola. STABLE para que Postgres las evalue una vez por consulta y no una
 * vez por fila.
 */
create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$ select org_id from profiles where id = auth.uid() $$;

create or replace function public.client_in_my_org(p_client uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from clients
     where id = p_client and org_id = public.current_org_id()
  );
$$;

create or replace function public.creative_in_my_org(p_creative uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from creatives c
      join clients cl on cl.id = c.client_id
     where c.id = p_creative and cl.org_id = public.current_org_id()
  );
$$;

revoke all on function public.current_org_id() from public;
revoke all on function public.client_in_my_org(uuid) from public;
revoke all on function public.creative_in_my_org(uuid) from public;
grant execute on function public.current_org_id() to authenticated;
grant execute on function public.client_in_my_org(uuid) to authenticated;
grant execute on function public.creative_in_my_org(uuid) to authenticated;

-- Un cliente nuevo nace en la org de quien lo crea, sin que la app lo mande.
alter table clients alter column org_id set default public.current_org_id();

-- =====================  POLICIES  =====================
-- Cada regla de antes se conserva y se le AÑADE el filtro de organizacion.
-- Lo que cambia es el alcance, no quien puede hacer que.

-- profiles: ves a tus compañeros de organizacion, no a todos los usuarios.
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles
  for select to authenticated
  using (org_id = public.current_org_id());

-- clients
drop policy if exists clients_select on clients;
create policy clients_select on clients
  for select to authenticated using (org_id = public.current_org_id());

drop policy if exists clients_insert on clients;
create policy clients_insert on clients
  for insert to authenticated
  with check (created_by = auth.uid() and org_id = public.current_org_id());

drop policy if exists clients_update on clients;
create policy clients_update on clients
  for update to authenticated
  using (org_id = public.current_org_id() and (created_by = auth.uid() or public.is_admin()))
  with check (org_id = public.current_org_id());

drop policy if exists clients_delete on clients;
create policy clients_delete on clients
  for delete to authenticated
  using (org_id = public.current_org_id() and public.is_admin());

-- creatives
drop policy if exists creatives_select on creatives;
create policy creatives_select on creatives
  for select to authenticated using (public.client_in_my_org(client_id));

drop policy if exists creatives_insert on creatives;
create policy creatives_insert on creatives
  for insert to authenticated
  with check (uploaded_by = auth.uid() and public.client_in_my_org(client_id));

drop policy if exists creatives_update on creatives;
create policy creatives_update on creatives
  for update to authenticated
  using (public.client_in_my_org(client_id) and (uploaded_by = auth.uid() or public.is_admin()))
  with check (public.client_in_my_org(client_id));

drop policy if exists creatives_delete on creatives;
create policy creatives_delete on creatives
  for delete to authenticated
  using (public.client_in_my_org(client_id) and (uploaded_by = auth.uid() or public.is_admin()));

-- batches
drop policy if exists batches_select on batches;
create policy batches_select on batches
  for select to authenticated using (public.client_in_my_org(client_id));

drop policy if exists batches_insert on batches;
create policy batches_insert on batches
  for insert to authenticated
  with check (created_by = auth.uid() and public.client_in_my_org(client_id));

drop policy if exists batches_update on batches;
create policy batches_update on batches
  for update to authenticated
  using (public.client_in_my_org(client_id) and (created_by = auth.uid() or public.is_admin()))
  with check (public.client_in_my_org(client_id));

drop policy if exists batches_delete on batches;
create policy batches_delete on batches
  for delete to authenticated
  using (public.client_in_my_org(client_id) and public.is_admin());

-- briefs: los escribe copy y los lee diseño, cualquiera de la org los edita.
drop policy if exists briefs_select on briefs;
create policy briefs_select on briefs
  for select to authenticated using (public.client_in_my_org(client_id));

drop policy if exists briefs_insert on briefs;
create policy briefs_insert on briefs
  for insert to authenticated
  with check (created_by = auth.uid() and public.client_in_my_org(client_id));

drop policy if exists briefs_update on briefs;
create policy briefs_update on briefs
  for update to authenticated
  using (public.client_in_my_org(client_id))
  with check (public.client_in_my_org(client_id));

drop policy if exists briefs_delete on briefs;
create policy briefs_delete on briefs
  for delete to authenticated
  using (public.client_in_my_org(client_id) and public.is_admin());

-- launches
drop policy if exists launches_select on launches;
create policy launches_select on launches
  for select to authenticated using (public.creative_in_my_org(creative_id));

drop policy if exists launches_insert on launches;
create policy launches_insert on launches
  for insert to authenticated
  with check (created_by = auth.uid() and public.creative_in_my_org(creative_id));

drop policy if exists launches_update on launches;
create policy launches_update on launches
  for update to authenticated
  using (public.creative_in_my_org(creative_id))
  with check (public.creative_in_my_org(creative_id));

drop policy if exists launches_delete on launches;
create policy launches_delete on launches
  for delete to authenticated
  using (public.creative_in_my_org(creative_id) and public.is_admin());

-- downloads
drop policy if exists downloads_select on downloads;
create policy downloads_select on downloads
  for select to authenticated using (public.creative_in_my_org(creative_id));

drop policy if exists downloads_insert on downloads;
create policy downloads_insert on downloads
  for insert to authenticated
  with check (user_id = auth.uid() and public.creative_in_my_org(creative_id));

-- El alta pone a la persona en la org que corresponde a su dominio de correo.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rol text := coalesce(new.raw_user_meta_data->>'role', 'member');
  org uuid;
begin
  if rol not in ('media', 'copy', 'design', 'member') then
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
$$;

-- El perimetro deja de estar escrito a mano. Antes decia 'growthkingdom.com'
-- como constante; ahora el dominio permitido es el de una organizacion que
-- exista. Hoy el comportamiento es identico — solo hay una — pero dar de alta
-- otra agencia deja de requerir tocar codigo.
create or replace function public.enforce_email_domain()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  dominio text := lower(split_part(new.email, '@', 2));
begin
  if not exists (select 1 from orgs where domain = dominio) then
    raise exception 'El dominio % no pertenece a ninguna organización.', dominio
      using errcode = '22023';
  end if;
  return new;
end;
$$;
