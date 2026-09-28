-- 0033_pedidos_cliente.sql — pedirle archivos al cliente con un link.
--
-- A veces lo que sigue depende del cliente: grabar ads, mandar fotos o su logo.
-- Alguien del equipo crea el pedido y le manda al cliente el link de su
-- cliente; el cliente abre el link, sin cuenta ni contraseña, ve lo que le
-- pedimos y sube los archivos. A quien lo pidio le llega el aviso.
--
-- El link es un token secreto por cliente, no por pedido: el cliente guarda un
-- solo link y ahi le aparece todo lo que tenga pendiente. Se puede cambiar, y
-- el anterior deja de servir.
--
-- El cliente no tiene sesion: la pagina del link lee y escribe con service
-- role DESPUES de validar el token. Por eso portal_deliver solo lo puede
-- llamar service role, y client_request_files no acepta inserts del equipo.

alter table clients add column if not exists portal_token text unique
  check (portal_token is null or portal_token ~ '^[a-f0-9]{64}$');

create table if not exists client_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 140),
  instructions text not null default '' check (length(instructions) <= 4000),
  due_date date,
  created_by uuid not null default auth.uid() references profiles(id),
  created_at timestamptz not null default now(),
  -- La ultima vez que el cliente subio algo. Null: todavia esperando.
  delivered_at timestamptz,
  -- Cerrado ya no le aparece al cliente.
  closed_at timestamptz,
  closed_by uuid references profiles(id)
);

create index if not exists client_requests_client_idx
  on client_requests (client_id, closed_at, created_at desc);

create table if not exists client_request_files (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references client_requests(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text,
  size_bytes bigint not null,
  created_at timestamptz not null default now()
);

create index if not exists client_request_files_request_idx
  on client_request_files (request_id, created_at);

alter table client_requests enable row level security;
alter table client_request_files enable row level security;

drop policy if exists client_requests_select on client_requests;
create policy client_requests_select on client_requests
  for select to authenticated using (public.client_in_my_org(client_id));

-- Pedir, cualquiera del equipo: lo manda quien tiene contacto con el cliente.
drop policy if exists client_requests_insert on client_requests;
create policy client_requests_insert on client_requests
  for insert to authenticated
  with check (created_by = auth.uid() and public.client_in_my_org(client_id));

drop policy if exists client_requests_update on client_requests;
create policy client_requests_update on client_requests
  for update to authenticated
  using (public.client_in_my_org(client_id))
  with check (public.client_in_my_org(client_id));

-- Borrar se lleva lo que subio el cliente: solo quien lo pidio o un admin.
drop policy if exists client_requests_delete on client_requests;
create policy client_requests_delete on client_requests
  for delete to authenticated
  using (public.client_in_my_org(client_id) and (created_by = auth.uid() or public.is_admin()));

drop policy if exists client_request_files_select on client_request_files;
create policy client_request_files_select on client_request_files
  for select to authenticated
  using (exists (
    select 1 from client_requests r
     where r.id = request_id and public.client_in_my_org(r.client_id)
  ));

drop policy if exists client_request_files_delete on client_request_files;
create policy client_request_files_delete on client_request_files
  for delete to authenticated
  using (exists (
    select 1 from client_requests r
     where r.id = request_id
       and public.client_in_my_org(r.client_id)
       and (r.created_by = auth.uid() or public.is_admin())
  ));

grant select, insert, update, delete on client_requests to authenticated;
grant select, delete on client_request_files to authenticated;

-- Quien pidio y cuando se pidio no cambian despues.
create or replace function public.guard_client_request()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.client_id := old.client_id;
  if auth.uid() is not null then
    new.delivered_at := old.delivered_at;   -- solo lo marca la entrega del cliente
  end if;
  return new;
end;
$$;

drop trigger if exists guard_client_request on client_requests;
create trigger guard_client_request before update on client_requests
  for each row execute function public.guard_client_request();

/*
 * El token del link del cliente. Se crea la primera vez que alguien lo pide;
 * con p_renew se cambia y el link anterior deja de servir.
 * 64 hex = dos uuid v4 = 244 bits al azar: no se adivina.
 */
create or replace function public.client_portal_token(p_client uuid, p_renew boolean default false)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if auth.uid() is null then
    raise exception 'No hay sesión.';
  end if;
  if not public.client_in_my_org(p_client) then
    raise exception 'Ese cliente no existe.';
  end if;

  select portal_token into v_token from clients where id = p_client;
  if v_token is null or p_renew then
    v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    update clients set portal_token = v_token where id = p_client;
  end if;
  return v_token;
end;
$$;

revoke all on function public.client_portal_token(uuid, boolean) from public, anon;
grant execute on function public.client_portal_token(uuid, boolean) to authenticated;

/*
 * El cliente entrego archivos. Los archivos ya estan en R2 y el servidor ya
 * verifico tamaño y tipo contra R2; aqui se valida que el token sea de ese
 * cliente y el pedido siga abierto, se registran y se avisa a quien lo pidio,
 * todo en la misma transaccion.
 *
 * p_files: [{"path": "...", "name": "...", "type": "...", "size": 123}, …]
 */
create or replace function public.portal_deliver(p_token text, p_request uuid, p_files jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_count integer;
begin
  select q.id, q.title, q.client_id, q.created_by, c.name as cliente
    into r
    from client_requests q
    join clients c on c.id = q.client_id
   where q.id = p_request
     and q.closed_at is null
     and c.archived_at is null
     and c.portal_token = p_token;
  if not found then
    raise exception 'Este pedido ya no está abierto.';
  end if;

  v_count := jsonb_array_length(p_files);
  if v_count = 0 then
    raise exception 'No llegó ningún archivo.';
  end if;

  insert into client_request_files (request_id, storage_path, file_name, mime_type, size_bytes)
  select p_request, f->>'path', left(f->>'name', 255), nullif(f->>'type', ''), (f->>'size')::bigint
    from jsonb_array_elements(p_files) f;

  update client_requests set delivered_at = now() where id = p_request;

  -- El cliente no es del equipo: el aviso siempre le llega a quien lo pidio.
  insert into notifications (profile_id, kind, client_id, title, body)
  values (
    r.created_by,
    'entrega',
    r.client_id,
    format('%s subió %s %s', r.cliente, v_count, case when v_count = 1 then 'archivo' else 'archivos' end),
    r.title
  );

  return v_count;
end;
$$;

revoke all on function public.portal_deliver(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.portal_deliver(text, uuid, jsonb) to service_role;
