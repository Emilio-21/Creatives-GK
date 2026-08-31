# Prompt para Claude Design

Rediseña la interfaz de una app interna que ya funciona. No es un concepto: existe, tiene datos y la usa un equipo de agencia todos los días. Necesito que se vea moderna y se sienta rápida, sin perder densidad de información.

## Qué es

Biblioteca de creativos publicitarios. El equipo sube imágenes y videos, los descarga para subirlos a Meta Ads, y registra cómo le fue a cada lanzamiento. No reemplaza a Ads Manager: es la capa de inventario y control de producción. La pregunta que contesta es "qué tenemos, qué ya se quemó, y qué nunca salió al aire".

Equipo cerrado, 3–8 personas, todas ven todo. Uso diario, sesiones cortas: entrar, buscar un creativo, descargarlo, seguir. La velocidad de encontrar algo importa más que cualquier otra cosa.

## Dirección visual

Dark mode como tema principal, con liquid glass: superficies translúcidas con blur, bordes de luz de 1px, profundidad por capas en vez de por sombras duras. Que se sienta material, no plano.

Reglas que no quiero que se rompan:

- El glass va en las capas de navegación y en los overlays (sidebar, header, barra de selección flotante, modales). El contenido denso — tablas, listas de métricas — va sobre superficie sólida. Una tabla de números detrás de un blur es ilegible.
- Los thumbnails de los creativos son el contenido real. Nada de tintes ni overlays de color encima: el color de la marca del cliente no puede competir con el color del creativo.
- Números en tabular-nums, siempre alineados a la derecha. Se comparan entre filas.
- Acento cromático mínimo, un solo color, reservado para estado y acción primaria. El resto en neutros.
- Debe existir light mode también, no como inversión automática sino con sus propios valores.

## Las pantallas

**Shell.** Sidebar izquierdo fijo con "Todos los creativos", "Resumen", y la lista de clientes con su conteo, más "+ Nuevo cliente". Header con logo, usuario y salir. En móvil el sidebar no cabe: hoy es un `<select>` y merece algo mejor.

**Biblioteca (`/` y `/client/[id]`).** Grid de tarjetas: thumbnail cuadrado, nombre, badge de estado (Sin lanzar / En circulación / Finalizado / Archivado), formato. Cada tarjeta tiene checkbox para selección múltiple; al seleccionar aparece una barra flotante abajo con "N seleccionados · Descargar zip". Toggle a vista tabla con columnas de nombre, estado, formato, gasto, CTR, CPA. Arriba: buscador, orden, y dos toggles ("Sin lanzar", "Archivados"). Paginación de 48.

En la vista de un cliente, encima del grid va una franja de 6 KPIs: creativos, lanzados, sin lanzar, gasto, CTR, CPA. "Sin lanzar" es el número que más importa de toda la app y hoy no se distingue lo suficiente.

**Detalle (`/creative/[id]`).** Preview grande (video con poster y `preload="none"`). Acumulado de métricas. Metadata editable en línea. Tabla de lanzamientos con editar/borrar y un modal para registrar uno nuevo — en ese modal, CTR/CPM/CPC/CPA se calculan en vivo mientras escribes y se muestran atenuados. Historial de descargas.

**Subir (`/upload`).** Dropzone múltiple. Cliente obligatorio, formato y tags opcionales para todo el lote. Cada archivo en cola muestra su progreso real de subida, y puede fallar y reintentarse individualmente. Advertencia no bloqueante si el nombre ya existe.

**Resumen (`/dashboard`).** KPIs globales, tabla comparativa por cliente, top 10 por CPA y por CTR, gráfica de barras de producción mensual, lista de creativos con más de 30 días sin lanzarse, y un medidor de uso de R2 (X GB de 10) que se pone en alerta a los 8 GB.

## Estados que sí quiero ver diseñados

La mayoría de los rediseños solo muestran la pantalla llena. Necesito:

- Biblioteca vacía (equipo nuevo, cero creativos) y cliente recién creado sin archivos.
- Subida en curso con tres archivos: uno al 60%, uno terminado, uno fallado con su botón de reintentar.
- Un creativo sin poster (hay codecs que el navegador no puede pintar) — el placeholder tiene que verse intencional, no roto.
- Skeletons de carga del grid y del dashboard.
- El medidor de R2 en estado normal y en alerta.

## Restricciones técnicas

Next.js 15 con App Router, Tailwind v4 y shadcn/ui sobre Base UI. El tema vive en variables CSS (`--background`, `--card`, `--primary`, `--muted-foreground`, `--border`, `--destructive`, `--chart-1..5`). Dame la paleta como esos tokens en oklch para light y dark, para poder pegarlos en `globals.css`.

El blur cuesta: no más de dos o tres superficies con `backdrop-filter` visibles al mismo tiempo, y nunca sobre elementos que se scrollean rápido.

Todo el texto en español.

## Qué espero de vuelta

Los tokens de color en oklch, y las pantallas de arriba en dark mode: shell con sidebar, biblioteca en grid, biblioteca en tabla, detalle de creativo con la tabla de lanzamientos, el modal de registrar lanzamiento, la pantalla de subida con la cola en tres estados, y el dashboard. Más los estados vacíos y de carga. Móvil al menos para biblioteca y detalle.
