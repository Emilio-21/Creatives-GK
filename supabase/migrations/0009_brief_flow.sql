-- 0009_brief_flow.sql — el brief deja de ser una nota y pasa a ser el origen
-- del batch: copy escribe, diseño sube ahi mismo, y al publicar el batch queda
-- marcado como completado.

-- Fecha del brief, la que pone copy. No es created_at: un brief se puede
-- capturar despues de la junta en que se definio.
alter table briefs add column if not exists brief_date date not null default current_date;

-- Un batch se completa cuando su brief entrego los diseños.
alter table batches add column if not exists completed_at timestamptz;

create index if not exists briefs_client_date_idx on briefs (client_id, brief_date desc);
