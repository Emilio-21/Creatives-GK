-- 0024_slack.sql — los avisos tambien llegan por Slack, en mensaje directo.
--
-- La fuente sigue siendo la tabla notifications: transition_brief escribe el
-- aviso en la misma transaccion que el cambio, y de ahi sale a Slack. Asi Slack
-- no puede decir algo distinto de la app, y si Slack falla el aviso sigue en la
-- campanita y se reintenta.

-- A quien le escribe el bot. Se resuelve por correo la primera vez y se guarda.
alter table profiles add column if not exists slack_user_id text;
-- Cada quien puede apagar Slack sin apagar los avisos de la app.
alter table profiles add column if not exists slack_notify boolean not null default true;

-- Entrega: cuando salio a Slack, o por que no. Un error se guarda para no
-- reintentar para siempre algo que no va a funcionar (p. ej. el correo no
-- existe en el Slack de la agencia).
alter table notifications add column if not exists slack_sent_at timestamptz;
alter table notifications add column if not exists slack_error text;
alter table notifications add column if not exists slack_attempts int not null default 0;

-- Lo que falta por mandar: pocas filas, se consulta en cada entrega.
create index if not exists notifications_slack_pendientes_idx
  on notifications (created_at) where slack_sent_at is null;

-- Cada persona puede ver y cambiar su propio slack_notify. slack_user_id lo
-- escribe solo el servidor (service role), que no pasa por RLS. La policy de
-- update de profiles ya existe; esta funcion evita abrirla a otras columnas.
create or replace function public.set_slack_notify(p_on boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update profiles set slack_notify = p_on where id = auth.uid();
$$;

revoke all on function public.set_slack_notify(boolean) from public;
grant execute on function public.set_slack_notify(boolean) to authenticated;

-- Quien lo esta mandando. La entrega corre justo despues de cada cambio y
-- tambien en el reintento periodico; sin esto las dos podrian tomar el mismo
-- aviso y mandarlo dos veces. Un reclamo viejo (el proceso murio) se puede retomar.
alter table notifications add column if not exists slack_claimed_at timestamptz;
