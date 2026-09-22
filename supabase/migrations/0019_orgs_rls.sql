-- 0019_orgs_rls.sql — cerrar la tabla de organizaciones.
--
-- 0015 la creo sin RLS, asi que cualquiera autenticado podia listar TODAS las
-- organizaciones con su nombre y su dominio. Con una sola no se nota; con dos
-- es la lista de clientes de la competencia, servida a quien pregunte.

alter table orgs enable row level security;

drop policy if exists orgs_select on orgs;
create policy orgs_select on orgs
  for select to authenticated using (id = public.current_org_id());

-- Crear y editar organizaciones no es cosa de la app: se hace con service role
-- al dar de alta una agencia. Sin policy de insert/update/delete, nadie con la
-- anon key puede tocarlas.

grant select on orgs to authenticated;
