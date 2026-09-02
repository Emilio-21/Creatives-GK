-- 0008_batches_and_briefs.sql
--
-- 1. Batches: los creativos se producen y se prueban por tandas. La biblioteca
--    los agrupa asi dentro de "sin lanzar".
-- 2. Briefs: las instrucciones de copywriting dejan de vivir en Google Docs.
-- 3. La llave del sync pasa a (meta_ad_id, periodo): un pull del 7 al 11 de
--    agosto y otro del 12 al 20 son dos lanzamientos del mismo anuncio, no uno
--    que pisa al otro.

create table if not exists batches (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  name text not null,
  notes text,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists batches_client_created_at_idx
  on batches (client_id, created_at desc);

-- Dos batches con el mismo nombre en el mismo cliente serian un bug de captura.
create unique index if not exists batches_client_name_unique
  on batches (client_id, lower(name));

alter table creatives add column if not exists batch_id uuid references batches(id) on delete set null;
create index if not exists creatives_batch_idx on creatives (batch_id, created_at desc);

-- Instrucciones de copy. Un brief por batch es el caso normal; se permite uno
-- suelto a nivel cliente (batch_id null) para lineamientos generales.
create table if not exists briefs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  batch_id uuid references batches(id) on delete set null,
  title text not null,
  body text not null default '',
  created_by uuid not null references profiles(id),
  updated_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists briefs_client_updated_idx on briefs (client_id, updated_at desc);
create index if not exists briefs_batch_idx on briefs (batch_id);

alter table batches enable row level security;
alter table briefs  enable row level security;

drop policy if exists batches_select on batches;
create policy batches_select on batches for select to authenticated using (true);
drop policy if exists batches_insert on batches;
create policy batches_insert on batches for insert to authenticated with check (created_by = auth.uid());
drop policy if exists batches_update on batches;
create policy batches_update on batches for update to authenticated
  using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());
drop policy if exists batches_delete on batches;
create policy batches_delete on batches for delete to authenticated using (public.is_admin());

-- El brief lo escribe copy y lo lee diseño: cualquiera del equipo puede editarlo.
drop policy if exists briefs_select on briefs;
create policy briefs_select on briefs for select to authenticated using (true);
drop policy if exists briefs_insert on briefs;
create policy briefs_insert on briefs for insert to authenticated with check (created_by = auth.uid());
drop policy if exists briefs_update on briefs;
create policy briefs_update on briefs for update to authenticated using (true) with check (true);
drop policy if exists briefs_delete on briefs;
create policy briefs_delete on briefs for delete to authenticated using (public.is_admin());

grant select, insert, update, delete on batches, briefs to authenticated;

-- La llave del upsert es (creativo, anuncio, periodo). Lleva creative_id a
-- proposito: sin el, dos creativos distintos marcados como lanzados el mismo dia
-- tendrian la misma llave (NULL, hoy, NULL) y chocarian entre si.
-- NULLS NOT DISTINCT para que los NULL cuenten como valor y esa dedupe funcione.
drop index if exists launches_meta_ad_id_unique;
create unique index if not exists launches_creative_ad_period_unique
  on launches (creative_id, meta_ad_id, launched_at, ended_at) nulls not distinct;
