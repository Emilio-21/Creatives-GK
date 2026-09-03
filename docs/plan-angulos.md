# Plan — Ángulos ganadores y diagnóstico de embudo

El batch es un ángulo. Este documento define cómo pasar de "tenemos métricas" a
"este ángulo ganó y estos son los que hay que repetir", con un diagnóstico que
distingue lo que es problema de copy de lo que no.

---

## 1. La cadena de atribución

Una sola llave enlaza las tres puntas. El código que ya existe, derivado del id
del creativo:

```
creativo aquí   →   anuncio en Meta          →   contacto en GHL
GK-c7c05468         nombre: …[GK-c7c05468]       utm_content=GK-c7c05468
```

Hoy el código ya viaja en el **nombre del anuncio**. Falta que viaje también en
la **URL**, como `utm_content`. Sus UTMs actuales son a nivel campaña, así que
esto es un cambio operativo: la app va a dar la URL armada junto al nombre del
anuncio, para copiar los dos de un jalón.

Sin `utm_content` por creativo, GHL no se puede enlazar más allá de la campaña y
todo el análisis por ángulo se cae.

---

## 2. El embudo y quién es responsable de cada caída

```
impresiones → vistas 3s → retención → clic → carga la landing    ← Meta
            → lead → cita → asistió → venta                       ← GHL
```

| Caída | Diagnóstico | ¿Es de copy? |
|---|---|---|
| Impresiones → 3s | El hook no agarra | **Sí** |
| 3s → retención | El cuerpo aburre | **Sí** |
| Retención → clic | La oferta no convence | **Sí** |
| Clic → carga | Página lenta o rota | No, técnico |
| Carga → lead | La landing no vende | No, landing |
| Lead → cita | La promesa atrae al público equivocado | **Sí** |
| Cita → asistió | Falla el seguimiento | No, operativo |
| Asistió → venta | La llamada o la oferta | No, ventas |

**"Lead → cita" es el diagnóstico más valioso** y es imposible de ver solo con
Meta: un ángulo que trae muchos leads que nunca agendan está prometiendo algo
que no corresponde a lo que se vende.

---

## 3. El ranking va por costo por venta, no por CPA de Meta

Esta es la razón de traer GHL. Con números inventados pero realistas:

| Ángulo | Costo por lead | Cierre | **Costo por venta** |
|---|---|---|---|
| A | $50 | 5% | **$1,000** |
| B | $120 | 30% | **$400** |

Meta dice que ganó A. GHL dice que el bueno es B. Un reporte que rankee por CPA
de Meta le va a pedir a copy más variaciones del ángulo equivocado.

El ranking primario es **gasto ÷ ventas cerradas**. Si hay valor de venta en el
pipeline, se agrega ROAS.

---

## 4. Datos que faltan

### 4.1 De Meta

Hoy solo se guarda `spend`, `impressions`, `reach`, `clicks` y `results`. Faltan:

- `video_play_actions` → vistas de 3 segundos (hook rate)
- `video_thruplay_watched_actions` y `video_p25/50/75/100_watched_actions` → retención
- `inline_link_clicks` → clics reales al enlace
- `actions[landing_page_view]` → cargas de la landing

**Corrección pendiente:** lo que hoy guardamos como `clicks` es el `clicks` de
Meta, que cuenta todos los clics — likes, expandir texto, ver perfil. El CTR que
muestra el dashboard hoy está inflado. Para el análisis hay que usar
`inline_link_clicks`.

### 4.2 De GHL

Una sub-cuenta (location) por cliente. Por cada contacto atribuido a un
`utm_content`:

- lead creado (fecha)
- oportunidad y su etapa en el pipeline
- cita agendada / asistida
- venta cerrada y su valor

Endpoints: contactos con filtro por atribución, y oportunidades para las etapas.
El `fbclid` sirve de respaldo cuando el UTM se pierde.

---

## 5. Modelo de datos

```sql
-- Columnas nuevas en launches, del lado de Meta.
alter table launches add column video_3s_views bigint;
alter table launches add column thruplays bigint;
alter table launches add column video_p25 bigint;
alter table launches add column video_p50 bigint;
alter table launches add column video_p75 bigint;
alter table launches add column video_p100 bigint;
alter table launches add column link_clicks bigint;
alter table launches add column landing_page_views bigint;

-- Resultados de GHL por creativo y periodo.
create table ghl_outcomes (
  id uuid primary key default gen_random_uuid(),
  creative_id uuid not null references creatives(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  leads bigint not null default 0,
  appointments bigint not null default 0,
  shows bigint not null default 0,
  sales bigint not null default 0,
  revenue numeric(12,2),
  synced_at timestamptz not null default now(),
  unique (creative_id, period_start, period_end)
);

alter table clients add column ghl_location_id text;
```

### Los tokens no van en una tabla legible

La RLS de equipo cerrado deja que cualquier usuario autenticado lea todas las
tablas. Un token de GHL da acceso al CRM del cliente.

```sql
create table client_secrets (
  client_id uuid primary key references clients(id) on delete cascade,
  ghl_token text,
  updated_at timestamptz not null default now()
);

-- RLS activada y CERO políticas: nadie con la anon key puede leerla.
-- Solo la service role key, que vive en el servidor, la ve.
alter table client_secrets enable row level security;
```

Una tabla con RLS activada y sin políticas es invisible para la app y visible
para el sync. Esto también resuelve el caso de Meta si algún día hacen falta
tokens distintos por cliente.

---

## 6. El motor de diagnóstico

Reglas fijas y auditables. Ante los mismos números dice siempre lo mismo, y
cualquiera puede revisar por qué lo dijo.

**El benchmark es la mediana del propio cliente**, no números de internet. Un CTR
de 1.5% es bueno para seguros y malo para ecommerce. Las únicas excepciones son
los umbrales técnicos, donde sí hay verdad universal:

| Métrica | Umbral absoluto | Por qué |
|---|---|---|
| Cargas ÷ clics | < 70% | La página está rota o tarda demasiado |
| Hook rate | < 15% | Por debajo de eso no hay debate |

Todo lo demás se compara contra la mediana del cliente en los últimos 90 días.

### El ruido

Un ángulo con 2 ventas a $30 y otro con 1 a $60 no dicen nada, pero un ranking
los ordena igual y se ve autoritativo.

Mínimos antes de emitir veredicto:

- Diagnóstico de embudo: **≥ 1,000 impresiones y ≥ 25 clics al enlace**
- Ranking de ganadores: **≥ 5 ventas** o **≥ 3× la mediana de costo por venta en gasto**

Por debajo de eso, el reporte dice **"datos insuficientes"**. Un reporte que se
calla cuando no sabe vale más que uno que siempre opina.

---

## 7. La pantalla

`/client/[id]/angulos` — una tarjeta por batch, ordenadas por costo por venta.

```
Dolor de espalda        12 creativos · $18,400 · 46 ventas · $400/venta
GANADOR
Hook 34% · retención 28% · CTR 2.1% · lead→cita 62% · cita→venta 41%
Todos los eslabones por encima de la mediana del cliente.
→ Haz más de esto: variaciones del hook, mismo cuerpo.

Testimonios              8 creativos · $9,200 · 3 ventas · $3,067/venta
Hook 31% (bien) · CTR 1.9% (bien) · lead→cita 11% (mediana 58%)
El anuncio hace su trabajo. Los leads entran y no agendan.
→ La promesa atrae al público equivocado. Revisar a quién le habla.

Antes y después          4 creativos · $1,100
Datos insuficientes: 340 impresiones, 1 venta.
```

### La sección que más importa

**Diagnóstico sistémico.** Si todos los ángulos se caen en el mismo eslabón, no
es problema de copy:

> Los 6 ángulos convierten por debajo del 1% de carga a lead, contra una mediana
> histórica de 4.2%. Esto no es de los anuncios: revisar la landing page.

Pedirle "más variaciones" a copy cuando la landing está rota es hacerle perder
semanas.

---

## 8. Cerrar el ciclo

Al final de un ángulo ganador, un botón **"Crear brief con estos hallazgos"** que
abre el brief nuevo del cliente con el diagnóstico ya escrito.

```
Ángulo ganador → brief → batch → ads → datos → ángulo ganador
```

Copy ya vive en la app. El reporte no debería terminar en un PDF que alguien
copia a mano.

---

## 9. Fases

**Fase A — Enriquecer Meta.** Columnas nuevas, campos nuevos en el sync, y la
corrección de `clicks` a `inline_link_clicks`. Sin pantalla todavía. Al terminar,
el embudo de la mitad de arriba ya se puede calcular.

**Fase B — La URL con UTM.** La app genera la URL con `utm_content` junto al
nombre del anuncio. Cambio operativo del equipo: a partir de aquí, cada anuncio
nuevo se nombra y se enlaza con el mismo código.

**Fase C — GHL.** `ghl_location_id` por cliente, tokens en `client_secrets`, sync
de contactos y oportunidades a `ghl_outcomes`.

**Fase D — Motor y pantalla.** Reglas de diagnóstico, mínimos de significancia,
pantalla de ángulos y sección sistémica.

**Fase E — Brief desde el ángulo.**

Las fases A, B y D dan valor por sí solas aunque GHL se retrase: con solo Meta ya
se diagnostica hook, retención, oferta y el problema técnico de la landing.

---

## 10. Riesgos

| Riesgo | Detalle | Mitigación |
|---|---|---|
| **La integración de Meta no está probada** | Cero lanzamientos con datos reales; el token nunca se puso en producción | Ponerlo y correr un SYNC antes de empezar la fase A |
| **Atribución incompleta** | Si un anuncio se lanza sin el UTM, sus ventas no se enlazan y el ángulo parece peor de lo que es | El reporte muestra cuántas ventas quedaron sin atribuir; si son muchas, avisa en vez de rankear |
| **Pipeline desactualizado** | Rankear por venta cerrada exige que el pipeline de GHL se mantenga al día | Mostrar también costo por cita, que suele estar mejor capturado |
| **Ventana de atribución** | Una venta puede cerrarse semanas después del clic | Los periodos de GHL no coinciden con los de Meta: se atribuye por creativo, no por periodo |
| **Muestras chicas** | Un ranking sobre 3 ventas es ruido con aspecto de dato | Mínimos explícitos y "datos insuficientes" |
| **Dos integraciones** | Cuando algo falle habrá que saber cuál de las dos | Fases separadas, cada una verificable sola |
