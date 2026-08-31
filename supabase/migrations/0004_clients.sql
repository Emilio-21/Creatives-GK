-- 0004_clients.sql — el cliente pasa de texto libre a entidad propia.
--
-- La biblioteca se navega por cliente desde el sidebar, no con filtros. Eso pide
-- poder crear un cliente vacio y renombrarlo sin tocar los archivos, y que subir
-- use un select en vez de texto libre (adios "PLG" vs "plg").

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

-- Unico sin importar mayusculas: dos secciones "PLG" y "plg" serian un bug.
create unique index if not exists clients_name_unique on clients (lower(name));

alter table creatives add column if not exists client_id uuid references clients(id);

-- Backfill desde la columna de texto, para no perder nada si ya hay creativos.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'creatives' and column_name = 'client'
  ) then
    insert into clients (name, created_by)
    select distinct on (lower(c.client)) btrim(c.client), c.uploaded_by
    from creatives c
    where c.client is not null
      and btrim(c.client) <> ''
      and not exists (select 1 from clients cl where lower(cl.name) = lower(btrim(c.client)))
    order by lower(c.client), c.created_at;

    update creatives c
    set client_id = cl.id
    from clients cl
    where c.client_id is null
      and c.client is not null
      and lower(cl.name) = lower(btrim(c.client));

    drop index if exists creatives_client_created_at_idx;
    alter table creatives drop column client;
  end if;
end
$$;

-- El cliente es obligatorio al subir, asi que se exige en la DB tambien.
-- Solo si no quedaron filas sin cliente, para que la migracion sea segura.
do $$
begin
  if not exists (select 1 from creatives where client_id is null) then
    alter table creatives alter column client_id set not null;
  else
    raise notice 'Hay creativos sin client_id: client_id queda nullable. Asignalos y vuelve a correr.';
  end if;
end
$$;

create index if not exists creatives_client_id_created_at_idx
  on creatives (client_id, created_at desc);

-- RLS: mismo criterio que creatives.
alter table clients enable row level security;

drop policy if exists clients_select on clients;
create policy clients_select on clients
  for select to authenticated using (true);

drop policy if exists clients_insert on clients;
create policy clients_insert on clients
  for insert to authenticated with check (created_by = auth.uid());

drop policy if exists clients_update on clients;
create policy clients_update on clients
  for update to authenticated
  using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());

drop policy if exists clients_delete on clients;
create policy clients_delete on clients
  for delete to authenticated using (public.is_admin());

grant select, insert, update, delete on clients to authenticated;
