-- El brief vive en Google Docs, donde copy tiene sus plantillas. La app guarda
-- el link, no el texto: copiarlo aqui dejaria dos versiones que se separan.
--
-- `body` se queda: los briefs viejos tienen texto y no se tira. Ya no se
-- escribe desde la app.
alter table briefs add column if not exists doc_url text;

alter table briefs drop constraint if exists briefs_doc_url_https;
alter table briefs add constraint briefs_doc_url_https
  check (doc_url is null or doc_url ~ '^https://');
