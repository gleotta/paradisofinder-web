# Registro de decisión — Mapa en resultados (2026-08-29)

**Decisión:** German pidió construir el mapa AHORA con interfaz tipo Airbnb (listado a la
izquierda, mapa a la derecha). Esto **revierte la decisión del 28/08** ("no se construye por
ahora") registrada en `HANDOFF_P1_2026-08-28.md` §4.1, CLAUDE.md regla 8 y
`producto-p1.md` §0. Este archivo es el registro de conflicto que exige la regla de
conflicto de CLAUDE.md.

## Qué se construyó (dentro de las reglas duras vigentes)

- **Split view** en `/buscar`: lista a la izquierda + mapa sticky a la derecha (≥1024px,
  ocultable con "Ocultar mapa"); en mobile, overlay fullscreen con botón flotante
  "Ver mapa" / "Ver lista".
- El mapa dibuja las cards filtradas por la regla dura spec §5.7 (`quality_tier >= 2` y
  lat/lon presentes). **Integración intermedia (mismo día):** con el mapa visible, P1 hace
  UNA llamada extra a `POST /search/structured` con los params vigentes y `limit=100`
  (tope actual, fast-path sin LLM) y alimenta el mapa con esos hasta ~100 rankeados —
  más que las 10-30 cards de la lista, pero todavía NO el universo. En modo portal los
  params son `extraction.params`; en chat salen de `context.search_params` del evento
  `done`. Hasta que llega el feed (o si falla), el mapa cae a las cards de la página.
  La spec del endpoint definitivo está en `P2_PEDIDO_SEARCH_MAP.md`.
- **Aviso de parcialidad SIEMPRE visible** sobre el mapa ("N de M en el mapa — solo lo
  cargado en esta página"), como exige el handoff §4.1 para cualquier mapa hecho con los
  endpoints actuales.
- **Ninguna llamada nueva a P2**: cero requests extra; markers = cards del estado local.
- Markers de precio (precio ORIGINAL del aviso en notación compacta es-AR), popup
  mini-card con link al detalle, resaltado cruzado card ↔ marker.
- Tiles: OpenStreetMap estándar con atribución (sin API keys). Leaflet 1.9.

## Qué NO cambia

- El pedido a P2 de `POST /search/map` **sigue abierto** (handoff §4.1): mismo criterio que
  `/search/text`, payload liviano, filtro `tier >= 2`, sin tope de 100. Cuando exista, el
  mapa pasa de "lo que hay en la página" al universo del criterio (2.476 avisos con
  coordenadas, 100% del tier 2) y el aviso de parcialidad se elimina.
- Los límites medidos del 28/08 siguen vigentes mientras tanto: los endpoints topean en
  100 rankeados; "deptos en venta en capital" = 421 coincidencias → ~79 puntos dibujables.
  Con la paginación 10×3 de P1, el mapa muestra como máximo ~30 puntos por consulta.
