# Dashboard de Creativos

Inventario y control de producción de creativos: qué existe, qué ya se lanzó, y cómo le fue.

Stack: Next.js 15 (App Router) + Tailwind 4 + shadcn/ui · Supabase (auth + Postgres) · Cloudflare R2 (archivos privados) · Vercel.

Plan completo: `docs/plan.md`.

---

## Estado

| Fase | Qué | Estado |
|---|---|---|
| 0 | Setup: app, migraciones SQL, config R2/Supabase, deploy | código listo — faltan las cuentas |
| 1 | Auth: `@supabase/ssr`, middleware, trigger de profile, `/login` | código listo |
| 2 | Storage: `lib/storage.ts`, presigned URLs, CORS | listo |
| 3 | Upload múltiple y biblioteca por cliente | listo |
| 4 | Descarga individual y en lote (zip) | código listo |
| 5 | Lanzamientos, métricas derivadas, orden por performance | listo |
| 6 | Dashboard resumen | listo |
| 7 | Pulido, cleanup de huérfanos, backup | listo |
| 8 | Sync con Meta | código listo — falta correr 0006 y poner el token |

---

## Fase 0 — lo que hay que hacer a mano

### 1. Supabase
1. Crear proyecto en <https://supabase.com/dashboard>.
2. SQL Editor → correr **en orden**:
   - `supabase/migrations/0001_schema.sql`
   - `supabase/migrations/0002_rls.sql`
   - `supabase/migrations/0003_auth_trigger.sql`
3. Settings → API: copiar `Project URL`, `anon key` y `service_role key`.

### 2. Cloudflare R2
1. R2 → crear buckets `creatives-dev` y `creatives-prod`.
2. R2 → Manage API Tokens → token con **Object Read & Write** limitado a esos buckets.
   El secret se muestra una sola vez.
3. Anotar el Account ID (endpoint: `https://{ACCOUNT_ID}.r2.cloudflarestorage.com`).
4. **En cada bucket** → Settings → **CORS Policy** → pegar `infra/r2-cors.json`.
   Es configuración por bucket: hay que pegarla en `creatives-dev` y en `creatives-prod`.
   Sin esto el `PUT` desde el navegador falla con un error de CORS ilegible.
   Al agregar un dominio nuevo, se edita `infra/r2-cors.json` y se vuelve a pegar en los dos.

```bash
npm run check:cors   # prueba el preflight de cada origen contra cada bucket
```

### 3. Variables de entorno
```bash
cp .env.example .env.local   # y llenarlo
npm run check:setup          # valida env + tablas + bucket
```
`check:setup` debe terminar en **"Fase 0 lista"** antes de seguir.

Ninguna credencial de R2 lleva prefijo `NEXT_PUBLIC_`.

### 4. Vercel
Importar el repo, pegar las mismas 7 variables (`R2_BUCKET_NAME=creatives-prod` en producción)
y desplegar para validar el pipeline.

---

## Fase 1 — Auth

Ya implementado:

- `src/lib/supabase/{client,server,middleware}.ts` — clientes de navegador, servidor y refresco de sesión.
- `src/middleware.ts` — protege todo excepto `/login`; guarda el destino en `?next=`.
- `src/app/login/` — email + password, sin signup público.
- `0003_auth_trigger.sql` — crea el `profile` al crear el usuario (con backfill).

**Crear las cuentas a mano:** Supabase → Authentication → Users → *Add user* →
*Create new user* con "Auto Confirm User" activado. Crear la tuya y una de prueba.

Para volverte admin:
```sql
update profiles set role = 'admin' where id = (select id from auth.users where email = 'tu@correo.com');
```

---

## Fase 2 — Storage

`src/lib/storage.ts` expone exactamente cuatro funciones y **ningún componente llama al SDK de S3 directo**:

| Función | TTL | Para qué |
|---|---|---|
| `getUploadUrl(path, contentType)` | 15 min | PUT directo del navegador |
| `getPreviewUrl(path)` | 1 h | `src` de `<img>` / `<video>` |
| `getDownloadUrl(path, filename)` | 5 min | descarga con `Content-Disposition: attachment` |
| `deleteFile(path)` | — | borrado |

La protección de los archivos **no** es RLS: es que la URL solo se firma después de
`requireUser()` (`src/lib/auth.ts`). Toda Server Action que toque storage debe llamarla primero.

### Verificación

```bash
npm run test:storage
```

Prueba contra el bucket real: PUT firmado, preview byte a byte, que el bucket rechace
la request sin firma, `Content-Disposition`, borrado, y el **preflight de CORS**.
Debe terminar en "Storage OK end-to-end".

Para el CORS de todos los orígenes contra los dos buckets:

```bash
npm run check:cors
```

Falta la prueba desde el navegador: `npm run dev` → entrar → **`/dev/storage`** →
subir un archivo, verlo, descargarlo y borrarlo. Es el banco de pruebas de la fase 2;
si el PUT falla ahí, falla el upload de la fase 3.

---

## Fase 3 — Upload y biblioteca

### `/upload`
Dropzone múltiple con progreso por archivo (XHR, no `fetch`, que no expone progreso).
Por batch: **cliente obligatorio**, formato y tags opcionales.

Del navegador salen las dimensiones, la duración y el **poster frame** de cada video
(seek a ~1s → `<canvas>` → JPEG 85%, máx 720px de lado largo). El grid solo carga
posters, nunca el video. Nada de esto puede vivir en el servidor: Vercel Hobby tiene
10 s de timeout y ~4.5 MB de body.

Un nombre repetido se advierte pero no se bloquea. Reintentar solo re-sube lo que falló.

### `/`
Grid de tarjetas con badge de estado, filtros (cliente, estado, formato, tag, quién subió),
buscador por nombre, orden y toggle grid ↔ tabla. Los filtros van en la URL, así que se
pueden compartir y el botón de atrás funciona.

### Orden de las operaciones

```
requestUploadUrls  → valida sesión, mime y tamaño ANTES de firmar
PUT del navegador  → archivo directo a R2, sin pasar por Next
PUT del poster     → si es video y el navegador pudo pintar el frame
confirmUpload      → HEAD al objeto real, insert en creatives
```

Si el insert falla se borra el archivo de R2 en el momento. Lo que se escape lo barre
`scripts/cleanup-orphans.ts` en la fase 7.

---

## Fase 4 — Descarga

Presigned URL de 5 minutos con `Content-Disposition: attachment`, así que el archivo
baja con su nombre original en vez de abrirse en una pestaña. Cada descarga queda
registrada en `downloads` y se ve en el historial del detalle.

En la biblioteca cada tarjeta tiene checkbox: seleccionas varias y la barra de abajo
ofrece descargar. Uno solo baja directo; varios se empaquetan en un **zip generado en
el navegador** con `jszip`, bajando cada archivo desde su presigned URL. Nunca en el
servidor: Vercel Hobby corta a los 10 s.

Tope de 25 archivos por lote, porque el zip se arma en memoria del navegador. Nombres
repetidos dentro del zip se numeran (`video.mp4`, `video (2).mp4`).

---

## Fase 6 — Resumen

`/dashboard`: total de creativos, % lanzados, **creativos sin lanzar** (el número que
importa), gasto de los lanzamientos iniciados este mes, top 10 por CPA y por CTR,
inventario con más de 30 días sin lanzarse, producción de los últimos 12 meses y el
widget de uso de R2.

El widget de R2 lista el bucket y suma los tamaños. Sin él te enteras del límite de
10 GB cuando falla un upload. Avisa a los 8 GB.

Los mismos números existen **por cliente**: `/client/[id]` muestra su franja de KPIs
(creativos, lanzados, sin lanzar, gasto, CTR, CPA) y, plegado, sus tops y su producción
mensual. El resumen general trae además una tabla "Por cliente" para compararlos.

CTR y CPA de un conjunto se calculan sumando los números base y dividiendo **una vez**,
nunca promediando el CTR de cada creativo: un creativo con 100 impresiones pesaría igual
que uno con un millón.

---

## Fase 7 — Pulido y mantenimiento

**Archivar** un creativo lo saca de la biblioteca y de los KPIs sin borrar nada: el
archivo sigue en R2 y sus lanzamientos con sus métricas siguen existiendo. El botón
"Archivados" de la biblioteca los muestra y desde el detalle se restauran.

Skeletons en las cuatro pantallas, navegación por cliente en móvil (el sidebar no cabe)
y edición de metadata en el detalle.

### Los dos scripts que la infra gratis exige

```bash
npm run cleanup:orphans                        # dry run, lista lo que borraría
npm run cleanup:orphans -- --delete
npm run cleanup:orphans -- --delete --bucket creatives-prod
```

Compara los objetos de R2 contra `creatives.storage_path` y `poster_path` y borra lo
que no tenga registro — un PUT exitoso con insert fallido deja el archivo ocupando
espacio para siempre. **Respeta los objetos de menos de 24 h** para no matar un upload
en curso; `--min-age-hours 0` salta ese margen. Usa la service role key porque tiene
que ver todos los creativos, no solo los tuyos. Correr mensual, en cada bucket.

```bash
npm run backup:db
```

`pg_dump` del esquema `public` comprimido a `backups/`. El free tier de Supabase **no
tiene backups automáticos**: si se corrompe la base pierdes las métricas, aunque los
archivos sigan en R2. Correr semanal. Necesita `SUPABASE_DB_URL` en `.env.local`
(Supabase → Project Settings → Database → Connection string → URI) y `pg_dump`
instalado (`brew install libpq && brew link --force libpq`).

---

## Fase 8 — Sync con Meta

No se capturan IDs a mano. Cada creativo tiene un código derivado de su id
(`GK-c7c05468`) y la app arma el nombre del anuncio ya listo para copiar:

```
AB_TESTIMONIAL_v3_[GK-c7c05468]
```

Lo pegas como nombre del ad en Meta. El código puede ir donde sea dentro del nombre, así que convive con la nomenclatura que
ya use el equipo:

```
[C019-A01-Ad01] John 1 Abril | VSL | Copy 01.1 [GK-c7c05468]
```

El sync lista **todos** los anuncios de la cuenta y aparte pide los insights. No usa solo
insights porque ese endpoint se salta los anuncios que no gastaron: uno recién creado,
pausado o en revisión no aparece ahí, y esos también hay que enlazar. Los enlazados sin
métricas quedan registrados con métricas vacías, listos para llenarse en el siguiente sync. **El
nombre lo genera la app, no la persona**: si la convención dependiera de que alguien la
recuerde, el match fallaría en silencio y el dashboard quedaría en ceros sin que nadie
se entere. Los anuncios sin código se listan en el reporte en vez de desaparecer.

Un ad de Meta es un lanzamiento. El upsert va sobre `meta_ad_id` (índice único parcial),
así que volver a sincronizar actualiza en lugar de duplicar, y un creativo que corre en
tres ad sets produce tres lanzamientos con su desglose.

### Configuración

1. Correr `supabase/migrations/0006_meta_sync.sql`.
2. En cada cliente, pegar su **ad account id** (`act_123…`) en el panel de Meta.
3. En el entorno: `META_ACCESS_TOKEN` con un System User token del Business Manager, y
   `CRON_SECRET` con cualquier cadena larga.

**El token nunca va en la base.** Un token de Meta puede gastar dinero y la RLS de equipo
cerrado deja que cualquier usuario autenticado lea las tablas. En `clients` solo vive el
ad account id, que no es secreto.

El cron de Vercel corre diario a las 13:00 UTC (`vercel.json`); Hobby permite 2 al día.
La ruta exige `Authorization: Bearer $CRON_SECRET` — sin eso, cualquiera podría dispararla
y quemar el rate limit de la Graph API.

---

## Desarrollo

```bash
npm run dev
```

| Comando | Qué hace |
|---|---|
| `npm run dev` | servidor local en :3000 |
| `npm run build` | build de producción |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | eslint |
| `npm run check:setup` | verifica env, tablas y bucket |
| `npm run test:storage` | prueba el ciclo completo contra R2 |
| `npm run check:cors` | preflight de cada origen contra cada bucket |
| `npm run cleanup:orphans` | lista/borra objetos de R2 sin registro (mensual) |
| `npm run backup:db` | `pg_dump` comprimido a `backups/` (semanal) |
| `npm run test:adcode` | verifica el código que enlaza anuncios con creativos |

## Convenciones

- Toda la I/O de archivos vive en `src/lib/storage.ts` (fase 2). Ningún componente llama al SDK de S3 directo.
- El bucket es privado: el acceso siempre es por presigned URL generada en el servidor **después** de verificar la sesión. Si una Server Action olvida el check de auth, el archivo queda expuesto.
- `publicado` es derivado (tiene al menos un launch), nunca un campo editable.
- CTR/CPM/CPC/CPA salen de la vista `creative_stats`; solo se capturan `spend`, `impressions`, `reach`, `clicks`, `results`.
