-- 0025_material.sql — material del cliente que no es un ad.
--
-- Presentaciones, plantillas, guias de marca, links a Canva o Figma: cosas que
-- el equipo usa para el cliente pero que no se lanzan en Meta. No van en
-- creatives porque alla todo tiene codigo de ad, formato y metricas; aqui no.
--
-- Cada fila es un archivo en R2 o un link, nunca las dos cosas.

create table if not exists client_materials (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  kind text not null check (kind in ('file', 'link')),
  title text not null check (length(btrim(title)) between 1 and 140),
  description text not null default '',
  url text check (url is null or url ~ '^https://'),
  storage_path text,
  file_name text,
  mime_type text,
  size_bytes bigint,
  created_by uuid not null default auth.uid() references profiles(id),
  updated_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_materials_kind_payload check (
    (kind = 'link' and url is not null and storage_path is null)
    or (kind = 'file' and storage_path is not null and url is null)
  )
);

create index if not exists client_materials_client_idx
  on client_materials (client_id, updated_at desc);

alter table client_materials enable row level security;

drop policy if exists client_materials_select on client_materials;
create policy client_materials_select on client_materials
  for select to authenticated using (public.client_in_my_org(client_id));

drop policy if exists client_materials_insert on client_materials;
create policy client_materials_insert on client_materials
  for insert to authenticated
  with check (created_by = auth.uid() and public.client_in_my_org(client_id));

-- Editar lo puede cualquiera del equipo: es material compartido, y quien lo
-- subio no siempre es quien lo mantiene al dia.
drop policy if exists client_materials_update on client_materials;
create policy client_materials_update on client_materials
  for update to authenticated
  using (public.client_in_my_org(client_id))
  with check (public.client_in_my_org(client_id));

-- Borrar, solo quien lo subio o un admin: no se recupera.
drop policy if exists client_materials_delete on client_materials;
create policy client_materials_delete on client_materials
  for delete to authenticated
  using (public.client_in_my_org(client_id) and (created_by = auth.uid() or public.is_admin()));

grant select, insert, update, delete on client_materials to authenticated;
