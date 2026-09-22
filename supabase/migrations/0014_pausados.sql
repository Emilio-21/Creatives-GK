-- 0014_pausados.sql — distinguir "pausado" de "en circulación" y de "finalizado".
--
-- Hasta ahora un anuncio pausado en Meta seguia contando como en circulacion:
-- ended_at sigue en null porque nunca termino formalmente, solo dejo de
-- entregar. Eso mezclaba en la misma columna lo que esta gastando ahora con lo
-- que alguien apago la semana pasada.

-- Lo que Meta reporta en effective_status: ACTIVE, PAUSED, ADSET_PAUSED,
-- CAMPAIGN_PAUSED, ARCHIVED, DISAPPROVED, IN_PROCESS... Texto libre a
-- proposito: Meta agrega valores y un check lo romperia en el peor momento.
alter table launches add column if not exists ad_status text;

-- Para los lanzamientos manuales, que no tienen anuncio en Meta que consultar.
alter table launches add column if not exists paused_at timestamptz;

create index if not exists launches_ad_status_idx on launches (ad_status);

/*
 * Un lanzamiento esta pausado si Meta lo dice, o si alguien lo pauso a mano.
 * Se va por lista blanca de lo que cuenta como "corriendo" y no por lista negra
 * de lo pausado: si Meta inventa un estado nuevo, es mas seguro que salga como
 * pausado (visible en su columna) que como activo (perdido entre los que si
 * gastan).
 */
create or replace function public.launch_corriendo(p_ad_status text, p_paused_at timestamptz)
returns boolean
language sql
immutable
as $$
  select p_paused_at is null
     and (p_ad_status is null or p_ad_status in ('ACTIVE', 'PREAPPROVED', 'PENDING_REVIEW'));
$$;

drop view if exists creative_stats;

create view creative_stats
with (security_invoker = true) as
select
  c.id,
  count(l.id)                     as launch_count,
  count(l.id) > 0                 as is_published,
  -- "Activo" pasa a significar: no termino Y no esta pausado.
  count(l.id) filter (
    where l.id is not null
      and (l.ended_at is null or l.ended_at >= current_date)
      and public.launch_corriendo(l.ad_status, l.paused_at)
  )                               as active_launch_count,
  count(l.id) filter (
    where l.id is not null
      and (l.ended_at is null or l.ended_at >= current_date)
      and not public.launch_corriendo(l.ad_status, l.paused_at)
  )                               as paused_launch_count,
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

/*
 * Pausar y reanudar a mano.
 *
 * Por funcion y no por policy, igual que agrupar: quien pausa un creativo no
 * es siempre quien lo subio. Toca unicamente paused_at de los lanzamientos que
 * siguen abiertos.
 */
create or replace function public.set_creative_paused(p_creative uuid, p_paused boolean)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  afectados integer;
begin
  if auth.uid() is null then
    raise exception 'No hay sesión.';
  end if;

  update launches
     set paused_at = case when p_paused then now() else null end
   where creative_id = p_creative
     and (ended_at is null or ended_at >= current_date);

  get diagnostics afectados = row_count;
  return afectados;
end;
$$;

revoke all on function public.set_creative_paused(uuid, boolean) from public;
grant execute on function public.set_creative_paused(uuid, boolean) to authenticated;
