-- 0005_creative_stats_status.sql — el estado de 3 valores necesita saber cuantos
-- lanzamientos siguen al aire, no solo cuantos hubo.
--
--   sin lanzar     launch_count = 0
--   en circulacion active_launch_count > 0
--   finalizado     hubo lanzamientos y todos terminaron

drop view if exists creative_stats;

create view creative_stats
with (security_invoker = true) as
select
  c.id,
  count(l.id)                     as launch_count,
  count(l.id) > 0                 as is_published,
  count(l.id) filter (
    where l.id is not null and (l.ended_at is null or l.ended_at >= current_date)
  )                               as active_launch_count,
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

grant select on creative_stats to authenticated;
