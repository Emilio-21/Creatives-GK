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
| 2 | `lib/storage.ts` (presigned URLs) | pendiente |
| 3+ | Upload, biblioteca, descarga, launches, dashboard | pendiente |

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
4. Bucket → Settings → **CORS Policy** → pegar `infra/r2-cors.json`.
   Sin esto el `PUT` desde el navegador falla con un error de CORS ilegible.
   Agregar el dominio de Vercel a `AllowedOrigins` cuando exista.

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

## Convenciones

- Toda la I/O de archivos vive en `src/lib/storage.ts` (fase 2). Ningún componente llama al SDK de S3 directo.
- El bucket es privado: el acceso siempre es por presigned URL generada en el servidor **después** de verificar la sesión. Si una Server Action olvida el check de auth, el archivo queda expuesto.
- `publicado` es derivado (tiene al menos un launch), nunca un campo editable.
- CTR/CPM/CPC/CPA salen de la vista `creative_stats`; solo se capturan `spend`, `impressions`, `reach`, `clicks`, `results`.
