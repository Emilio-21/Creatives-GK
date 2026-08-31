# Plan de desarrollo — Dashboard de Creativos

Documento de especificación para implementar con Claude Code.

**Stack final:** Next.js (Vercel Hobby) + Supabase free (auth + Postgres) + Cloudflare R2 free (archivos). Costo objetivo: $0/mes.

---

## 1. Objetivo

App interna donde el equipo sube creativos (imagen/video), los descarga para subirlos a Meta Ads, marca cuáles ya se lanzaron y registra los resultados de cada lanzamiento.

**No es** un reemplazo de Ads Manager. Es la capa de *inventario y control de producción*: qué creativos existen, cuáles ya se quemaron, cuáles nunca se probaron, y cómo le fue a cada uno.

---

## 2. Stack

| Capa | Elección | Límite del free tier |
|---|---|---|
| Framework | Next.js 15 (App Router) + TypeScript | — |
| Estilos | Tailwind + shadcn/ui | — |
| Auth | Supabase Auth (email + password) | Invite-only |
| DB | Supabase Postgres | 500 MB, pausa a los 7 días sin actividad |
| Archivos | **Cloudflare R2** (bucket privado) | 10 GB totales, 1M Clase A, 10M Clase B, egress $0 |
| Hosting | Vercel Hobby | 100 GB bandwidth |
| Estado servidor | Server Actions | — |

**Supabase Storage NO se usa.** Todo archivo vive en R2.

---

## 3. Decisiones de arquitectura (leer antes de codear)

### 3.1 Upload directo del navegador a R2 con presigned URLs
Vercel limita el body de una request a ~4.5 MB; un video de Meta pesa 30–100 MB. El archivo nunca pasa por Next.js.

Flujo:
1. El cliente llama a una Server Action `getUploadUrl(filename, mimeType, size)`.
2. El servidor valida (usuario autenticado, mime permitido, tamaño máximo) y devuelve una **presigned PUT URL** de R2 más el `storage_path` generado.
3. El navegador hace `PUT` directo a esa URL con XHR (para tener barra de progreso).
4. Al terminar, el cliente llama a `confirmUpload(...)` que inserta el registro en `creatives`.

Si el paso 4 falla, queda un archivo huérfano en R2. Ver §7 (script de limpieza).

### 3.2 El bucket es privado, sin dominio público
Nada de `r2.dev` público ni custom domain abierto. Todo acceso pasa por presigned URLs generadas en el servidor tras verificar la sesión de Supabase. Expiraciones:

- Preview / thumbnails: 1 hora
- Descarga: 5 minutos, con `ResponseContentDisposition: attachment; filename="..."` para que el navegador descargue con el nombre original en vez de abrir el archivo.

### 3.3 Un creativo tiene muchos lanzamientos
El mismo video se relanza en otra campaña, otro público, otro mes. Si guardas `gasto` y `publicado` como columnas del creativo, el segundo lanzamiento borra el primero.

`creatives` (el archivo) → `launches` (cada vez que salió al aire, con sus métricas).

El estado `publicado` es **derivado**: tiene al menos un launch. No es un campo editable.

### 3.4 CTR, CPM, CPC y CPA se calculan, no se capturan
Se capturan solo números base: `spend`, `impressions`, `reach`, `clicks`, `results`. Lo demás sale de la vista `creative_stats`. Capturar CTR a mano garantiza que en tres semanas los números no cuadren entre sí.

### 3.5 Preparar el sync con Meta desde el día uno
Aunque la fase 1 sea captura manual, `launches` incluye `meta_ad_id`, `meta_adset_id`, `meta_campaign_id` y `metrics_source` (`manual` | `meta_api`). Así la fase 7 es un upsert, no una migración.

### 3.6 Poster frame obligatorio para video
R2 no genera thumbnails. Al subir un video, el cliente extrae el primer frame decente (seek a ~1s, dibujar en `<canvas>`, `toBlob` a JPEG ~85%) y lo sube como segundo objeto bajo `posters/`. El grid **solo** carga posters, nunca el video. Con egress gratis esto ya no es tema de costo, pero sí de velocidad de carga.

### 3.7 Nombre de archivo como identidad
- `original_filename` — lo que subió el equipo (`AB_TESTIMONIAL_v3.mp4`).
- `display_name` — editable, arranca igual que el anterior.
- `storage_path` — `creatives/{uuid}/{filename}` para evitar colisiones.

Nombre duplicado: advertir en la UI ("ya existe un creativo con este nombre, ¿es una versión nueva?") pero permitirlo.

### 3.8 Toda la I/O de archivos detrás de un módulo
`lib/storage.ts` expone exactamente cuatro funciones y **ningún componente llama al SDK de S3 directo**:

```ts
getUploadUrl(path: string, contentType: string): Promise<string>
getPreviewUrl(path: string): Promise<string>
getDownloadUrl(path: string, filename: string): Promise<string>
deleteFile(path: string): Promise<void>
```

El día que migres a otro proveedor tocas ese archivo y corres un script de copia.

---

## 4. Configuración de R2

### 4.1 Setup
1. Cloudflare dashboard → R2 → crear bucket `creatives-prod` (y `creatives-dev`).
2. R2 → Manage API Tokens → crear token con permiso **Object Read & Write** limitado a esos buckets. Guardar Access Key ID y Secret Access Key (el secret se muestra una sola vez).
3. Anotar el Account ID. El endpoint es `https://{ACCOUNT_ID}.r2.cloudflarestorage.com`.

### 4.2 Cliente S3

```ts
import { S3Client } from "@aws-sdk/client-s3";

export const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});
```

`region: "auto"` es obligatorio. Paquetes: `@aws-sdk/client-s3` y `@aws-sdk/s3-request-presigner`.

### 4.3 CORS del bucket (esto se olvida y truena el upload)
Sin esto el PUT desde el navegador falla con un error de CORS que no dice nada útil. En R2 → bucket → Settings → CORS Policy:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "https://TU-APP.vercel.app"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["content-type"],
    "ExposeHeaders": ["etag"],
    "MaxAgeSeconds": 3600
  }
]
```

Agregar el dominio de producción real cuando exista. Los preview deployments de Vercel tienen dominios distintos cada vez — para desarrollo, probar en localhost.

### 4.4 Límites a validar en el servidor
- Tamaño máximo por archivo: **100 MB**. Arriba de eso el presigned PUT simple se vuelve frágil y habría que implementar multipart. No vale la pena en v1; si alguien necesita subir un master de 500 MB, que suba la versión comprimida.
- Mime types permitidos: `image/jpeg`, `image/png`, `image/webp`, `video/mp4`, `video/quicktime`.
- Validar **antes** de firmar la URL, no después.

---

## 5. Modelo de datos

```sql
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  role text not null default 'member' check (role in ('admin','member')),
  created_at timestamptz not null default now()
);

create table creatives (
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
  tags text[] default '{}',
  notes text,
  uploaded_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table launches (
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

create table downloads (
  id uuid primary key default gen_random_uuid(),
  creative_id uuid not null references creatives(id) on delete cascade,
  user_id uuid not null references profiles(id),
  downloaded_at timestamptz not null default now()
);

create index on creatives (client, created_at desc);
create index on launches (creative_id, launched_at desc);
create index on creatives using gin (tags);
```

### Vista derivada

```sql
create view creative_stats as
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
```

### RLS
Equipo cerrado: todo usuario autenticado ve todo.

- `creatives`: SELECT/INSERT para `authenticated`. UPDATE/DELETE solo `uploaded_by` o `role = 'admin'`.
- `launches`: SELECT/INSERT/UPDATE para `authenticated`. DELETE solo admin.
- `profiles`: SELECT para `authenticated`; UPDATE solo del propio registro.
- `downloads`: INSERT/SELECT para `authenticated`.

**Ojo:** con R2 la RLS ya no protege los archivos, solo los registros. La protección de archivos es que las presigned URLs solo se generan en Server Actions que verifican la sesión. Si una Server Action olvida el check de auth, el archivo queda expuesto. Revisar cada una.

---

## 6. Pantallas

### `/login`
Email + password. Sin signup público — cuentas creadas por invitación desde Supabase.

### `/` — Biblioteca (pantalla principal)
- Grid de tarjetas: poster/imagen, nombre de archivo, badge de estado (Sin lanzar / En circulación / Finalizado).
- Filtros: cliente, estado, formato, tags, rango de fecha, `uploaded_by`.
- Buscador por nombre.
- Toggle grid ↔ tabla. Tabla: nombre, cliente, estado, primer lanzamiento, gasto total, CTR, CPA.
- Ordenar por: más reciente, más gasto, mejor CTR, mejor CPA.
- Acciones en lote: descargar seleccionados (zip), archivar, taggear.

### `/upload`
- Dropzone múltiple con progreso por archivo (XHR, no fetch).
- Extrae automáticamente: nombre, tamaño, mime, dimensiones, duración, poster frame.
- Campos opcionales para todo el batch: cliente, tags, formato.
- Advertencia de nombre duplicado.
- Reintentar archivos que fallaron sin volver a subir los que ya pasaron.

### `/creative/[id]` — Detalle
- Preview grande. Video con `preload="none"` y poster.
- Metadata editable.
- Botón Descargar (presigned URL + registro en `downloads`).
- **Sección Lanzamientos**: tabla + botón "Registrar lanzamiento".
  - Modal: fecha inicio, fecha fin, campaña, ad set, `meta_ad_id`, métricas base.
  - CTR/CPM/CPC/CPA se muestran calculados en vivo, en gris, mientras escribes.
- Historial de descargas.

### `/dashboard` — Resumen
- KPIs: total creativos, % lanzados, **creativos sin lanzar** (el número que importa), gasto del mes.
- Top 10 por CPA y por CTR.
- Creativos con más de 30 días sin lanzarse.
- Producción por mes (barras, Recharts).
- **Widget de uso de R2**: GB almacenados vs 10 GB. Sin esto te vas a enterar del límite cuando falle un upload.

---

## 7. Fases de implementación

Cada fase queda desplegada y funcionando antes de pasar a la siguiente.

**Fase 0 — Setup**
Next.js + Tailwind + shadcn. Proyecto Supabase. Migraciones SQL. Bucket R2 + token + CORS. `.env.local` y vars en Vercel. Deploy vacío a Vercel para validar el pipeline.

**Fase 1 — Auth**
Supabase Auth con `@supabase/ssr`. Middleware que protege todo excepto `/login`. Trigger que crea el `profile` al crear el usuario. Crear tu cuenta y una de prueba a mano.

**Fase 2 — Storage layer**
`lib/storage.ts` con las cuatro funciones. Probar aislado con un script: subir un archivo, generar preview URL, generar download URL, borrar. **No pasar a la fase 3 hasta que esto funcione end-to-end**, incluyendo el PUT desde el navegador con CORS resuelto. Es la parte con más probabilidad de atorarse.

**Fase 3 — Upload y biblioteca**
Dropzone múltiple, progreso con XHR, extracción de metadata y poster en cliente, `confirmUpload`. Grid con posters, filtros, buscador. Esta fase ya hace la app útil aunque no exista nada más.

**Fase 4 — Descarga**
Presigned URL con `ResponseContentDisposition`, registro en `downloads`, descarga en lote como zip generado en el cliente con `jszip` a partir de las presigned URLs (nunca en el servidor: Vercel Hobby tiene 10s de timeout).

**Fase 5 — Lanzamientos y métricas**
Tabla de launches en el detalle, modal de registro, vista `creative_stats`, badges derivados, columnas de métricas, ordenamiento por performance.

**Fase 6 — Dashboard resumen**
KPIs, tops, gráficas, widget de uso de R2.

**Fase 7 — Pulido y mantenimiento**
Estados vacíos, skeletons, retry de uploads, archivar, edición en línea, responsive.
Más dos scripts que la infra gratis exige:
- `scripts/cleanup-orphans.ts` — lista objetos en R2 sin registro en `creatives` (uploads que fallaron a la mitad) y los borra. Correr mensual.
- `scripts/backup-db.sh` — `pg_dump` de Supabase a un archivo. Correr semanal. El free tier no tiene backups automáticos.

**Fase 8 (después) — Sync con Meta**
Route handler que, dado un `meta_ad_id`, jala insights de Graph API y hace upsert en `launches` con `metrics_source = 'meta_api'`. Cron de Vercel diario (Hobby permite 2 crons/día). Aquí el proyecto deja de depender de captura manual.

---

## 8. Riesgos del stack gratuito

| Riesgo | Detalle | Mitigación |
|---|---|---|
| **10 GB de R2** | Total acumulado, no mensual. Con video son ~250 archivos. | Widget de uso en el dashboard. Al llegar a 8 GB, archivar viejos o pagar: 100 GB cuestan ~$1.50/mes. |
| **Supabase pausa a los 7 días** | Sin actividad, el proyecto se suspende. | Con uso diario no pasa. Si hay vacaciones del equipo, un cron que haga un `select 1` semanal. |
| **Sin backups en Supabase free** | Si se corrompe la DB, pierdes las métricas (los archivos siguen en R2). | `pg_dump` semanal, fase 7. Esto no es opcional. |
| **Sin lifecycle rules en R2** | No hay borrado automático de objetos viejos. | Script de limpieza manual. |
| **Timeout de 10s en Vercel Hobby** | Cualquier operación pesada del servidor truena. | Todo lo pesado (zip, extracción de metadata, poster) va en el cliente. Ya está contemplado. |
| **Uploads huérfanos** | PUT exitoso + insert fallido = archivo pagando espacio sin registro. | Script de limpieza. |
| **Adopción del equipo** | Si subir es más lento que mandar por WhatsApp, nadie lo usa. | Upload múltiple con drag & drop y campos opcionales es requisito, no nice-to-have. |
| **Vercel Hobby es no-comercial** | Los términos de Vercel prohíben uso comercial en Hobby. Una herramienta interna de agencia cae en zona gris. | Si crece o lo ve un cliente, Pro son $20/mes. Tenlo presente. |

---

## 9. Variables de entorno

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # solo server-side, nunca NEXT_PUBLIC

# Cloudflare R2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=creatives-prod
```

Fase 8 añade `META_ACCESS_TOKEN` y `META_AD_ACCOUNT_ID`.

Ninguna credencial de R2 lleva prefijo `NEXT_PUBLIC_`. Si una se filtra al cliente, cualquiera puede leer y escribir en el bucket.

---

## 10. Decisiones pendientes

1. ¿Cuántas personas en el equipo, y todas ven todos los clientes? Si un freelance no debe ver PLG, hay que meter multi-tenant desde el inicio y cambia el RLS.
2. ¿Solo Meta, o también TikTok/Google? `platform` en `launches` ya lo soporta; la UI habría que ajustarla.
3. ¿Versionado de creativos (v1, v2, v3 del mismo concepto agrupados)? Se agrega después con `parent_creative_id`.
4. ¿Aprobación del cliente dentro de la app, o eso sigue por fuera?
