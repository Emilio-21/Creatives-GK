# Prompt para Claude Design — pantallas restantes

Continuación del diseño de GK Creativos. La pantalla de biblioteca ya está diseñada e implementada; ahora necesito el resto, en la misma dirección visual. No reinventes el lenguaje: extiéndelo.

## Lo que ya está definido y no cambia

Dark mode primario, acento ámbar único (`--primary`), neutros con tinte cálido (hue 80–85), Geist para texto y Geist Mono para números, ids y formatos. Radio 0.75rem.

Patrones establecidos en la biblioteca, respétalos:

- Header con marca "GK" en cuadro ámbar redondeado + "Creativos"; a la derecha usuario, toggle de tema y Salir.
- Sidebar fijo: "Todos los creativos" y "Resumen" con su conteo a la derecha, luego la lista de clientes con conteo, y "+ Nuevo cliente" al final. El activo se marca con fondo sutil, no con barra de color.
- Liquid glass **solo** en header, sidebar, overlays y barras flotantes: `background: var(--glass)`, `backdrop-filter: blur(18px) saturate(1.4)`, borde `var(--glass-border)`, highlight interior `inset 0 1px 0 var(--glass-highlight)`. Nunca detrás de tablas ni de listas de métricas.
- Tarjeta de creativo: 4:5, checkbox arriba a la izquierda sobre fondo oscuro, duración abajo a la derecha en mono, y al pie el nombre más un badge de estado con punto y el formato en mono.
- Números en tabular-nums alineados a la derecha. Un solo acento cromático.

## Pantallas que necesito

### 1. Detalle del creativo

Lo más importante y hoy lo más flojo. Contiene, de arriba abajo:

- Migaja al cliente, badge de estado, y acciones: Descargar, Editar, Archivar.
- Preview grande. Video con póster y controles; imagen a tamaño contenido. Puede ser vertical 9:16 o apaisado: el contenedor tiene que verse bien con los dos.
- Acumulado del creativo: gasto, CTR, CPC, CPA sumados de todos sus lanzamientos.
- Metadata: nombre, concepto, formato, tags, notas, y los datos fijos (archivo original, tipo, peso, dimensiones, duración, fecha). Con modo lectura y modo edición en línea.
- **Tabla de lanzamientos**: periodo (inicio → fin, o "al aire"), campaña y ad set, gasto, impresiones, clics, CTR, CPA, y acciones editar/borrar. Un creativo puede tener 1 o 15 lanzamientos.
- Historial de descargas: quién y cuándo.

Resuélvelo para que se lea de un vistazo qué tan quemado está el creativo, sin scroll infinito.

### 2. Modal de registrar lanzamiento

Campos: fecha inicio (obligatoria) y fin, campaña, ad set, `meta_ad_id`, `meta_adset_id`, y los cinco números base: gasto, impresiones, alcance, clics, resultados, más tipo de resultado. Notas.

Lo distintivo: **CTR, CPM, CPC y CPA se calculan en vivo mientras escribes** y se muestran atenuados, como resultado y no como campo. Tienen que leerse claramente como "esto lo calculo yo, tú no lo capturas". Es el momento en que la app enseña que no hay que meter métricas derivadas a mano.

### 3. Subir

Dropzone grande. Arriba, campos del lote: cliente (obligatorio, es un select de clientes existentes), formato y tags opcionales.

Debajo, la cola de archivos. Diséñala con cinco archivos en estados distintos a la vez: leyendo metadata, listo para subir, subiendo al 62% con barra, terminado, y fallado con su mensaje y botón de reintentar. Cada fila muestra nombre, peso, dimensiones y duración. Uno de ellos con la advertencia amarilla de nombre duplicado, que no bloquea.

### 4. Resumen (dashboard)

- Franja de KPIs: creativos, lanzados, **sin lanzar** (destacado, es el número que importa), gasto, CTR, CPA.
- Tabla comparativa por cliente con esas mismas columnas.
- Top 10 por mejor CPA y top 10 por mejor CTR, lado a lado.
- Barras de producción mensual, 12 meses, una sola serie, sin leyenda.
- Lista de creativos con más de 30 días sin lanzarse.
- Medidor de uso de R2: X GB de 10, con estado normal y estado de alerta a partir de 8 GB.

### 5. Vista de cliente

La biblioteca ya diseñada, pero encabezada por la franja de KPIs de ese cliente y con acceso a su detalle (sus tops, su producción mensual, su inventario olvidado). Muéstrame cómo conviven los números y el grid sin que la pantalla se sienta partida en dos.

### 6. Login

Correo y contraseña, sin registro público. Pantalla sola, sin shell. Es la primera impresión de la app.

## Estados que también necesito

- Cliente recién creado, cero archivos.
- Biblioteca en carga: skeletons del grid y del dashboard.
- Detalle de un creativo que nunca se ha lanzado (tabla de lanzamientos vacía).
- Medidor de R2 en alerta.

## Móvil

Al menos detalle del creativo y subir. El sidebar no cabe: propón cómo se navega entre clientes en pantalla chica, hoy es un `<select>` y da pena.

## Restricciones

Next.js 15, Tailwind v4, shadcn/ui sobre Base UI. Usa los tokens existentes; si necesitas un valor nuevo, decláralo como token y dímelo. Todo el texto en español. El blur cuesta: máximo dos o tres superficies con `backdrop-filter` visibles a la vez.
