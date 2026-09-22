-- 0020_moneda.sql — el dinero trae su moneda.
--
-- formatMoney formateaba TODO como MXN, pero las tres cuentas de Meta facturan
-- en USD: los $369.76 de gasto real se mostraban como "$369.76 MXN", que a los
-- tipos de cambio de hoy es como reportar una vigesima parte. Cada CPA, CPM y
-- CPC de la app estaba mal etiquetado, y son numeros con los que se decide si
-- un creativo sigue al aire.

-- La moneda es de la cuenta publicitaria, y cada cliente tiene una.
alter table clients add column if not exists meta_currency text;

-- Tambien en el lanzamiento: si algun dia un cliente cambia de cuenta, lo ya
-- guardado no debe reinterpretarse con la moneda nueva.
alter table launches add column if not exists currency text;

-- Lo que hay hoy es USD: las tres cuentas lo son, y los manuales estan en cero.
update clients  set meta_currency = 'USD' where meta_currency is null and meta_ad_account_id is not null;
update launches set currency = 'USD' where currency is null;
