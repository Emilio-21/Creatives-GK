-- 0011_batch_naming.sql — nomenclatura de Meta por batch.
--
-- Un batch es un adset. Guardando el numero de campaña, el de adset y las
-- partes descriptivas de cada nivel, la app compone los tres nombres completos
-- y el equipo copia y pega en vez de armarlos a mano.

alter table batches add column if not exists campaign_code text;   -- C020
alter table batches add column if not exists adset_code text;      -- A01
alter table batches add column if not exists campaign_label text;  -- VSL | Testing | Broad | CBO
alter table batches add column if not exists adset_label text;     -- Broad | MF | 30-65+ | USA | FB-IG-NoAN
alter table batches add column if not exists ad_label text;        -- VSL | Copy 01.1 | Intro 1.1
