# Relevo

Del brief al lanzamiento: quién tiene cada entrega, qué sigue, qué ya salió y cómo le fue.
Empezó como la biblioteca de creativos de Growth Kingdom.

Stack: Next.js 15 (App Router) + Tailwind 4 + shadcn/ui (Base UI) · Supabase (auth + Postgres) ·
Cloudflare R2 (archivos privados) · Cloudflare Workers con `@opennextjs/cloudflare`.

Producción: <https://relevo.growth-kingdom.workers.dev>. Plan original: `docs/plan.md`.

---

## Qué hace

- **Mi trabajo** (`/`) — lo que te toca ahora, lo que mandaste y sigue en manos de alguien
  más, y lo que está atorado en el equipo.
- **Tareas** — cada cliente tiene sus briefs. Un brief es un Google Doc (se incrusta en la
  app) con canal (ads, email o SMS) y tres responsables: revisión → producción →
  lanzamiento. Al terminar una etapa pasa sola a la siguiente persona y le llega el aviso.
- **Creativos** — biblioteca por cliente: subida múltiple directa a R2, pares de formatos
  (1:1 + 9:16 = un anuncio), batches con la nomenclatura de Meta, descarga en zip,
  lanzamientos y métricas.
- **Material** — por cliente, lo que no es un ad: presentaciones, plantillas, links.
- **Avisos** — en la campana de la app y por mensaje directo de Slack.
- **Equipo** (`/equipo`) — foto y nombre de perfil, áreas, clientes de cada quien y avisos de Slack.
- **Resumen** (`/dashboard`) — KPIs, tops por CPA y CTR, inventario sin lanzar, uso de R2.

---

## Poner a andar desde cero

### 1. Supabase
1. Crear el proyecto y, en el SQL Editor, correr **en orden** todo `supabase/migrations/`
   (`0001_schema.sql` … `0026_perfil.sql`).
2. Settings → API: copiar `Project URL`, `anon key` y `service_role key`.
3. Authentication → URL Configuration: *Site URL* con la URL de la app y, en *Redirect URLs*,
   `https://<dominio>/**`. El enlace del correo de confirmación regresa a `/auth/confirm`.

La plantilla en español del correo de confirmación está en `docs/email-confirmar-registro.html`.
Supabase solo deja editarla con un SMTP propio configurado.

### 2. Cloudflare R2
1. Crear los buckets `creatives-dev` y `creatives-prod`, y un API token con **Object Read &
   Write** limitado a ellos (el secret se muestra una sola vez).
2. CORS en cada bucket, con los orígenes de `infra/r2-cors.json`:
   ```bash
   npx wrangler r2 bucket cors set creatives-prod --file infra/r2-cors.json
   npm run check:cors   # prueba el preflight de cada origen contra cada bucket
   ```
   Sin esto el `PUT` desde el navegador falla con un error de CORS ilegible. Un dominio
   nuevo va primero en `infra/r2-cors.json`.

### 3. Variables de entorno
```bash
cp .env.example .env.local   # y llenarlo
npm run check:setup          # valida env, tablas y bucket
```
Ninguna credencial de R2 ni la service role key llevan prefijo `NEXT_PUBLIC_`.

### 4. Slack (opcional)
Crear la app con `docs/slack-app-manifest.yml`, instalarla en el workspace y poner el *Bot
User OAuth Token* en `SLACK_BOT_TOKEN`. Sin token la app funciona igual, solo sin Slack.
```bash
npm run slack:test -- tu@correo.com   # manda un mensaje de ejemplo
```

---

## Despliegue — Cloudflare Workers

| Worker | Qué es |
|---|---|
| `relevo` | la app (`wrangler.jsonc`) |
| `creativos-gk-cron` | cron: reintento de Slack cada 10 min; sync de Meta **pausado** (`workers/cron-sync`) |
| `creativos-gk` | la URL vieja, redirige a `relevo` (`workers/redirect`) |

```bash
npm run cf:preview   # build + servidor local sobre workerd
npm run cf:deploy    # build + deploy de la app
```

No correr `npm run build` con `npm run dev` abierto: comparten `.next` y el dev se corrompe.

### Secretos

Van como secretos del worker `relevo`, no en archivos: `npx wrangler secret put NOMBRE`.
La app necesita `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
`R2_BUCKET_NAME`, `CRON_SECRET`, `SLACK_BOT_TOKEN` y `META_ACCESS_TOKEN`.

### Cron

Vive en un worker aparte: el que genera OpenNext exporta su propio `fetch`, y colgarle un
`scheduled` ata el despliegue a los detalles internos del adaptador. Llama a
`/api/cron/slack` (y a `/api/cron/sync-meta` cuando se reactive) con
`Authorization: Bearer $CRON_SECRET`.

```bash
cd workers/cron-sync
npx wrangler secret put CRON_SECRET   # el mismo valor que en la app
npx wrangler deploy
```

---

## Cómo está armado

### Acciones de servidor
En producción Next oculta el mensaje de cualquier error lanzado desde una acción. Por eso
cada archivo de acciones tiene la función real (`xImpl`) y exporta un envoltorio que regresa
`ActionResult` con `attempt()`; el cliente la usa con `unwrapped()`, que vuelve a lanzar el
error con su mensaje real. Ver `src/lib/action-result.ts`.

Un archivo `"use server"` solo puede exportar funciones async: las constantes y tipos
compartidos viven en `src/lib/` (`brief-flow.ts`, `roles.ts`, `material.ts`…).

### Flujo de tareas
Las reglas viven en la base, no en la pantalla: `transition_brief`, `set_brief_owner` y
`start_brief_stage` (migraciones 0022–0023) deciden qué transición vale, exigen responsable
al entrar a una etapa y motivo al regresar trabajo, y escriben el aviso en la misma
transacción. Un trigger impide cambiar el estado de un brief por fuera de esas funciones.

Slack es otra salida del mismo aviso: `src/lib/slack-deliver.ts` manda lo pendiente justo
después de cada cambio (`after()`) y el cron reintenta lo que falló.

### Archivos
- Toda la I/O de archivos vive en `src/lib/storage.ts`. Ningún componente llama al SDK de S3.
- El bucket es privado: el acceso es por presigned URL generada en el servidor **después**
  de verificar la sesión (`requireUser()`).
- El navegador sube directo a R2 (XHR, con progreso); el servidor solo firma y luego
  confirma con un `HEAD` que el archivo existe y pesa lo que se dijo.
- Carpetas: `creatives/`, `posters/`, `material/{cliente}/`, `avatars/{usuario}/`.

### Métricas
- `publicado` es derivado (tiene al menos un lanzamiento), nunca un campo editable.
- CTR/CPM/CPC/CPA salen de la vista `creative_stats`; solo se capturan gasto, impresiones,
  alcance, clics y resultados. Los de un conjunto se calculan sumando y dividiendo **una
  vez**, nunca promediando promedios.
- Cada creativo tiene un código derivado de su id (`GK-c7c05468`) que va en el nombre del
  anuncio de Meta; el sync lo extrae para enlazar sin capturar IDs a mano. El token de Meta
  nunca va en la base.

### Alta del equipo
`/signup`, solo correos `@growthkingdom.com`. El candado real es un trigger sobre
`auth.users` (0010): la anon key es pública y cualquiera puede llamar al endpoint de
registro saltándose el formulario. El rol `admin` no se auto-asigna; se da desde `/equipo`,
y un trigger (0026) impide que alguien cambie su propio rol u organización.

---

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | servidor local en :3000 |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | eslint |
| `npm run cf:deploy` | build + deploy a Cloudflare |
| `npm run check:setup` | verifica env, tablas y bucket |
| `npm run check:cors` | preflight de cada origen contra cada bucket |
| `npm run test:storage` | ciclo completo contra R2: subir, leer, descargar, borrar |
| `npm run test:adcode` | verifica el código que enlaza anuncios con creativos |
| `npm run slack:test -- correo` | prueba el token de Slack con un mensaje de ejemplo |
| `npm run cleanup:orphans` | lista (o con `--delete` borra) archivos de R2 que nada referencia — mensual |
| `npm run backup:db` | `pg_dump` comprimido a `backups/` — semanal; el free tier de Supabase no respalda |
| `npm run dedupe` | encuentra archivos subidos dos veces (por hash); `-- --apply` los borra |
| `npm run pair:statics` | agrupa pares 1:1 + 9:16 ya subidos; `-- --apply` los junta |
| `node scripts/logo.mjs` | regenera el logo y sus iconos desde la geometría |
