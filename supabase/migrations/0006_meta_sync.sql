-- 0006_meta_sync.sql — sync con Meta (fase 8).
--
-- El match no se hace por nombre libre sino por un codigo derivado del id del
-- creativo, que la app pega en el nombre del anuncio: [GK-xxxxxxxx]. Es una
-- llave exacta, no un fuzzy match.
--
-- El token NO vive aqui: un token de Meta puede gastar dinero y la RLS de equipo
-- cerrado deja que cualquier usuario autenticado lea la tabla. Va en
-- META_ACCESS_TOKEN, solo del lado del servidor.

alter table clients add column if not exists meta_ad_account_id text;

-- El upsert del sync necesita una llave: un ad de Meta es un lanzamiento.
-- Parcial, porque los lanzamientos manuales no tienen meta_ad_id y pueden ser
-- muchos con NULL.
create unique index if not exists launches_meta_ad_id_unique
  on launches (meta_ad_id)
  where meta_ad_id is not null;

-- Para saber cuando corrio el ultimo sync de cada cliente.
alter table clients add column if not exists meta_synced_at timestamptz;
