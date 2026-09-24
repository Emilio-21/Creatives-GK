-- 0031_fondo.sql — cada quien elige el fondo de su pantalla.
--
-- Se guarda en el perfil y no en el navegador: asi sigue a la persona en la
-- compu y en el celular. Null = el de la marca (naranja). La lista tiene que
-- coincidir con src/lib/backgrounds.ts.
--
-- guard_profile_update (0026) ya deja que cada quien cambie columnas que no
-- sean id, rol, organizacion, slack o fecha: esta entra sin tocarlo.

alter table profiles add column if not exists background text;
alter table profiles drop constraint if exists profiles_background_check;
alter table profiles add constraint profiles_background_check
  check (background is null or background in
    ('naranja', 'petroleo', 'cobalto', 'acero', 'esmeralda', 'salvia', 'grafito'));
