# Plan — Equipos, asignación y avisos

Copy escribe el brief y se lo pasa a diseño. Diseño sube las piezas y las marca
listas. Media buying se entera y lanza. Hoy ese relevo pasa por WhatsApp y la
app no sabe que existe.

Este documento define cómo meterlo en la app sin construir el SaaS completo de
golpe, y señala cuál es la única decisión que sale cara si se pospone.

---

## 1. Qué hay hoy

```
profiles(id, full_name, role)      role ∈ admin | media | copy | design | member
briefs(client_id, batch_id, title, body, brief_date, created_by, updated_by)
batches(client_id, name, completed_at, campaign_code, adset_code, …)
```

Tres personas: dos admin y una copy. El candado de dominio
(`@growthkingdom.com`) vive en un trigger de `auth.users`, no en la pantalla de
registro — la anon key es pública.

**Lo que falta:** el brief no tiene responsable ni estado. `publishBrief` marca
el batch como completado y ahí se acaba el hilo. Nadie recibe nada.

---

## 2. La decisión cara: `org_id` ahora o migrar después

Todo lo demás en este plan es reversible. Esto no.

Hoy la app asume **una sola agencia**: las policies de RLS dicen
`using (true)` para `select`, o sea que cualquiera autenticado ve todo. Eso está
bien mientras el único requisito de entrada sea tener correo
`@growthkingdom.com`.

El día que quieran meter una segunda agencia —o darle acceso a un cliente para
que vea sus propios creativos— hace falta que cada fila sepa a qué organización
pertenece. Agregarlo **después** significa:

- una columna nueva en `clients`, `creatives`, `batches`, `briefs`, `launches`,
  `downloads` y `profiles`,
- rellenarla con backfill sobre datos de producción,
- y **reescribir las nueve policies de RLS**, que es donde un error no se ve
  hasta que alguien ve lo que no debe.

Agregarlo **hoy** son dos horas: una tabla `orgs` con una fila, una columna con
default, y las policies escritas una sola vez contra
`org_id = (select org_id from profiles where id = auth.uid())`.

**Recomendación: meterlo ahora**, aunque solo exista una organización durante el
próximo año. Es la única parte de este plan que no se puede aplazar barato.

Si la respuesta es "esto nunca va a ser multi-agencia", entonces no se hace y se
ahorra la complejidad. Pero conviene decidirlo explícitamente, no por omisión.

---

## 3. El ciclo de vida del brief

El estado del brief es el que mueve el relevo. Cinco valores:

```
borrador     copy lo está escribiendo, nadie más lo espera
asignado     tiene responsable de diseño y fecha de entrega
en_diseño    diseño lo abrió y está subiendo piezas
listo        las piezas están arriba y revisadas → le toca a media buying
lanzado      derivado, no se guarda: el batch ya tiene lanzamientos
```

`lanzado` **no es una columna**. Sale de `exists (select 1 from launches …)`,
igual que `is_published` en `creative_stats`. Guardar un estado que se puede
derivar es garantizar que algún día contradiga a los datos.

Las transiciones que importan y lo que disparan:

| De → a | Quién | Qué pasa |
|---|---|---|
| borrador → asignado | copy | aviso al diseñador asignado |
| asignado → en_diseño | diseño | (sin aviso: es solo señal de vida) |
| en_diseño → listo | diseño | **aviso a media buying** |
| listo → asignado | media | devuelto, con motivo obligatorio |

La última fila es la que suele faltar en estos flujos: si media buying no puede
rebotar el trabajo, el rebote ocurre igual, pero por WhatsApp y sin registro.

---

## 4. Quién es responsable

**Un solo responsable por brief**, no una lista.

```sql
briefs.assigned_to  uuid references profiles(id)
briefs.due_date     date
briefs.status       text
```

La tentación es una tabla de asignados múltiples para que "el equipo" esté en el
brief. No conviene: cuando responsables hay tres, responsable no hay ninguno.
El campo dice *quién tiene la siguiente acción*, y va cambiando de manos a lo
largo del ciclo — copy mientras escribe, diseño mientras produce, media cuando
está listo.

Para "que todo el equipo se entere" están los avisos por rol (§5), que no
requieren mantener una lista de espectadores que nadie actualiza.

**Clientes por persona**, para que la barra lateral deje de mostrar los 20
clientes a alguien que trabaja con dos:

```sql
client_members(client_id, profile_id, added_at)
```

Es un filtro de vista, no un permiso: si no tienes clientes asignados, los ves
todos. Así no hay que recordar asignar gente para que la app siga sirviendo.

---

## 5. Avisos

Tres opciones, y la diferencia entre ellas es de proyecto, no de detalle:

| | Esfuerzo | Depende de | Sirve cuando |
|---|---|---|---|
| **Dentro de la app** | bajo | nada | la gente abre la app a diario |
| Correo | medio | proveedor (Resend), dominio verificado, deliverability | el relevo es lento |
| Slack | medio | que tengan workspace y app instalada | ya viven en Slack |

**Recomendación: empezar dentro de la app.** Una tabla `notifications`, una
campanita con contador y una bandeja. Es la fuente de verdad de todos modos: el
correo y Slack serían despachadores que leen de ahí.

```sql
notifications(
  id, profile_id, kind, brief_id, client_id,
  title, body, read_at, created_at
)
```

Se escriben desde las mismas funciones que hacen la transición, en la misma
transacción. Si el aviso se escribe aparte, tarde o temprano hay transición sin
aviso.

**Avisar por rol, no por nombre:** cuando diseño marca *listo*, el aviso va a
todos los `role = 'media'` de la organización. Nadie tiene que acordarse de
etiquetar a Chris.

El correo entra cuando alguien diga "no me enteré": ahí ya hay un registro de
avisos y se le cuelga un digest diario sin rehacer nada.

---

## 6. Permisos: por qué NO endurecerlos

La tentación con roles es prohibir: que copy no pueda subir diseños, que diseño
no pueda editar el brief.

**Recomendación: no.** Son tres personas y la agencia se mueve rápido. Si Chris
ve un typo en el brief de Catalina un domingo, tiene que poder arreglarlo. Una
app que responde "no tienes permiso" a alguien que trabaja ahí genera un
WhatsApp, no disciplina.

Los roles sirven para **ordenar, filtrar y avisar**, no para bloquear:

- la bandeja de diseño muestra lo asignado a diseño,
- el aviso de *listo* va a media buying,
- el botón de "Asignar a diseño" aparece primero para copy.

Lo que sí queda cerrado es lo destructivo, que ya está así: borrar creativos y
clientes es de admin. Y `enforce_email_domain` sigue siendo el perímetro real.

Si algún día hay clientes externos con acceso, eso **no es un rol** — es otra
organización, y se resuelve con §2.

---

## 7. Esquema propuesto

```sql
-- 0015_orgs.sql            (solo si §2 se aprueba)
orgs(id, name, domain, created_at)
profiles.org_id, clients.org_id, …   + reescritura de las 9 policies

-- 0016_asignacion.sql
briefs.status        text not null default 'borrador'
briefs.assigned_to   uuid references profiles(id)
briefs.due_date      date
brief_events(id, brief_id, from_status, to_status, actor, note, created_at)
client_members(client_id, profile_id, added_at)

-- 0017_avisos.sql
notifications(id, profile_id, kind, brief_id, client_id, title, body,
              read_at, created_at)
transition_brief(p_brief uuid, p_to text, p_assigned uuid, p_note text)
  → security definer: valida la transición, escribe el evento y los avisos
```

`brief_events` es el historial: quién lo movió, cuándo y por qué. Sin eso, la
pregunta "¿por qué este brief lleva seis días parado?" no tiene respuesta.

`transition_brief` va por función y no por update directo, por lo mismo que
`assign_creatives_to_batch`: la policy de `briefs` no alcanza para expresar
"solo desde estos estados, y además escribe estas otras dos tablas".

---

## 8. UI

- **Bandeja** (`/inbox`) — lo asignado a mí y mis avisos sin leer. Es la primera
  pantalla al entrar, por encima del tablero.
- **Campanita** en el shell, con contador.
- **Tarjeta de brief** — responsable, estado y fecha de entrega visibles sin
  abrir. Hoy hay que entrar para saber en qué va.
- **Tablero de briefs por cliente** — columnas por estado, igual que el de
  creativos. Reusa `BoardColumn`.
- **Equipo** (`/equipo`) — la gente, su rol y sus clientes. Es el "haces tu
  equipo y etiquetas a la gente": alta, rol, clientes asignados.

---

## 9. Orden

| | Qué | Por qué en ese lugar |
|---|---|---|
| **1** | `org_id` y policies | lo único que se encarece con el tiempo |
| **2** | estado + responsable + eventos | el relevo ya funciona sin avisos: se ve en el tablero |
| **3** | avisos en la app + campanita | cierra el círculo sin WhatsApp |
| **4** | pantalla de equipo y clientes por persona | hasta aquí, sirve de sobra para tres personas |
| **5** | correo o Slack | solo cuando alguien diga "no me enteré" |

Las fases 2 y 3 son las que resuelven lo que pediste. La 1 es seguro. La 4 y la
5 son cuando crezcan.

---

## 10. Lo que NO está aquí, a propósito

- **Cobro, planes y límites.** Eso sí es el SaaS, y no se diseña hasta que haya
  una segunda agencia que quiera pagar.
- **Invitaciones por correo.** Hoy cualquiera con correo `@growthkingdom.com` se
  registra solo. Invitaciones solo tienen sentido con varias organizaciones.
- **Permisos por cliente.** "Catalina solo ve a John MacGregor" es una regla de
  seguridad, y el `client_members` de §4 es solo un filtro. Si de verdad hace
  falta esconder clientes, se hace con RLS sobre `client_members`, pero conviene
  no construirlo hasta que alguien lo pida.
- **Comentarios en el brief.** Se ve barato y no lo es: menciones, avisos,
  ediciones, hilos. Merece su propio plan.
