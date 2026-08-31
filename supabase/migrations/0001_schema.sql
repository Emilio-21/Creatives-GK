-- 0001_schema.sql — tablas base, indices y vista derivada.
-- Correr en Supabase → SQL Editor (o `supabase db push`).

create extension if not exists "pgcrypto";

create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  role text not null default 'member' check (role in ('admin','member')),
  created_at timestamptz not null default now()
);

create table if not exists creatives (
  id uuid primary key default gen_random_uuid(),
  original_filename text not null,
  display_name text not null,
  storage_path text not null unique,
  poster_path text,                    -- solo video
  mime_type text not null,
  file_size bigint not null,
  media_type text not null check (media_type in ('image','video')),
  width int,
  height int,
  duration_seconds numeric,
  client text,
  concept text,
  format text,                         -- reel, story, feed, 1x1, 9x16
  tags text[] not null default '{}',
  notes text,
  uploaded_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists launches (
  id uuid primary key default gen_random_uuid(),
  creative_id uuid not null references creatives(id) on delete cascade,
  launched_at date not null,
  ended_at date,
  platform text not null default 'meta',
  campaign_name text,
  adset_name text,
  meta_campaign_id text,
  meta_adset_id text,
  meta_ad_id text,
  spend numeric(12,2),
  impressions bigint,
  reach bigint,
  clicks bigint,
  results bigint,
  result_type text,                    -- 'lead', 'purchase', 'lpv'
  metrics_source text not null default 'manual'
    check (metrics_source in ('manual','meta_api')),
  metrics_updated_at timestamptz,
  notes text,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists downloads (
  id uuid primary key default gen_random_uuid(),
  creative_id uuid not null references creatives(id) on delete cascade,
  user_id uuid not null references profiles(id),
  downloaded_at timestamptz not null default now()
);

create index if not exists creatives_client_created_at_idx on creatives (client, created_at desc);
create index if not exists launches_creative_launched_at_idx on launches (creative_id, launched_at desc);
create index if not exists creatives_tags_idx on creatives using gin (tags);
create index if not exists downloads_creative_idx on downloads (creative_id, downloaded_at desc);

-- Vista derivada: CTR/CPM/CPC/CPA se calculan, nunca se capturan (§3.4).
-- security_invoker => la vista respeta la RLS de quien consulta, no la del owner.
create or replace view creative_stats
with (security_invoker = true) as
select
  c.id,
  count(l.id)                     as launch_count,
  count(l.id) > 0                 as is_published,
  min(l.launched_at)              as first_launched_at,
  max(l.launched_at)              as last_launched_at,
  sum(l.spend)                    as total_spend,
  sum(l.impressions)              as total_impressions,
  sum(l.clicks)                   as total_clicks,
  sum(l.results)                  as total_results,
  case when sum(l.impressions) > 0
       then round(sum(l.clicks)::numeric / sum(l.impressions) * 100, 2) end as ctr,
  case when sum(l.impressions) > 0
       then round(sum(l.spend) / sum(l.impressions) * 1000, 2) end          as cpm,
  case when sum(l.clicks) > 0
       then round(sum(l.spend) / sum(l.clicks), 2) end                      as cpc,
  case when sum(l.results) > 0
       then round(sum(l.spend) / sum(l.results), 2) end                     as cpa
from creatives c
left join launches l on l.creative_id = c.id
group by c.id;
