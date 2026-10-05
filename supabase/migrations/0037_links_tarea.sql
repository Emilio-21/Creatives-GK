-- 0037_links_tarea.sql — el recorrido del creativo en una sola tarea.
--
-- Ademas del Doc de copy (doc_url): referencias, la carpeta de clips en bruto
-- y la pieza final (el video editado, el diseño o la pagina) para revisarla.
-- Un link por casilla: si son muchos archivos, va la carpeta.

alter table briefs
  add column if not exists reference_url text check (reference_url is null or reference_url ~ '^https://'),
  add column if not exists raw_url text check (raw_url is null or raw_url ~ '^https://'),
  add column if not exists final_url text check (final_url is null or final_url ~ '^https://');
