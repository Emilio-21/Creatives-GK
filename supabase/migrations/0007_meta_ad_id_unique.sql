-- 0007_meta_ad_id_unique.sql — arregla la llave del upsert del sync.
--
-- 0006 creo el indice como parcial (where meta_ad_id is not null). Postgres no
-- puede inferir un ON CONFLICT contra un indice parcial si la sentencia no
-- repite el mismo predicado, y PostgREST no puede expresarlo: el upsert del
-- sync fallaba con "no unique or exclusion constraint matching".
--
-- El indice completo sirve igual: por defecto Postgres trata los NULL como
-- distintos entre si, asi que los lanzamientos manuales (sin meta_ad_id) pueden
-- ser todos los que hagan falta.

drop index if exists launches_meta_ad_id_unique;

create unique index if not exists launches_meta_ad_id_unique
  on launches (meta_ad_id);
