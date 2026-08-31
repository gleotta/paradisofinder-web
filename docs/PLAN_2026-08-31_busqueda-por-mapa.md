# Plan — "Buscar al mover el mapa" (búsqueda por viewport, tipo Airbnb)

**Estado: PLANIFICADO, NO IMPLEMENTADO.** Registrado el 2026-08-31 para retomar
después; hoy hay otras prioridades (decisión de German). Este documento junta
el pedido a P2 (§2, autocontenido para mandarles) y los cambios de P1 (§3),
más las decisiones de producto que quedan pendientes (§4).

**Qué es:** con el toggle activo, arrastrar o zoomear el mapa re-filtra el
listado por el área visible ("N resultados en esta zona del mapa"). Es el
"search as I move the map" de Airbnb. Hoy el mapa de P1 es proyección pura:
los pins salen del criterio de la sesión y moverlo no realimenta nada.

## 1. Por qué necesita un cambio en P2 (verificado 2026-08-31)

El viewport es un rectángulo de coordenadas (bbox). Para que el **listado**
del área visible conserve ranking, contador y paginación server-side, el bbox
tiene que poder viajar como criterio. Hoy no puede — probado contra la
instancia viva (`http://localhost:8000`):

```
POST /search/structured  con filters sobre latitude/longitude
→ 422 {"detail": "filtro con campo no permitido 'latitude'.
        Permitidos: ['area_sqm', 'bathrooms', 'bbq_area', ...]"}
```

Mismo 422 en `/search/map` forma (a). La whitelist de `filters[]` no incluye
`latitude`/`longitude`. (Buen síntoma: P2 valida en vez de ignorar en
silencio, así que el cambio es agregar dos campos a esa whitelist.)

Los **pins**, en cambio, no necesitan nada: P1 ya recibe el universo completo
del criterio por `/search/map` y el viewport lo recorta solo.

---

## 2. Pedido a P2 (autocontenido — copiar/mandar desde acá)

> **De:** P1 (paradisofinder.com) · **Para:** equipo P2 (FINDER Core)
>
> **Pedido:** aceptar `latitude` y `longitude` en la whitelist de `filters[]`
> de `POST /search/structured`, con los operadores de rango que ya usan los
> campos numéricos (`gte`/`lte`). Nada más: sin endpoint nuevo, sin LLM, sin
> tocar la Card. Es la vía que su propia spec sugiere ("si el mapa necesita
> algo nuevo, casi siempre se resuelve mandándole otro criterio").
>
> Uso previsto (bbox del viewport del mapa):
>
> ```jsonc
> { "vertical": "sale", "property_type": "apartment",
>   "filters": [
>     { "field": "latitude",  "operator": "gte", "value": -31.545 },
>     { "field": "latitude",  "operator": "lte", "value": -31.525 },
>     { "field": "longitude", "operator": "gte", "value": -68.545 },
>     { "field": "longitude", "operator": "lte", "value": -68.520 }
>   ],
>   "limit": 10, "offset": 0 }
> ```
>
> Semántica esperada (idéntica a cualquier otro filtro):
> - `total_matches` = avisos del criterio dentro del bbox (los sin
>   coordenadas quedan afuera por definición: `latitude NULL` no cumple un
>   rango — coherente con la regla "null = no informado").
> - Mismo orden determinístico y misma paginación `limit`/`offset`.
> - `related` en la última página, como en cualquier criterio.
>
> Opcionales, si les resultan baratos (P1 puede vivir sin ambos):
> - Los mismos campos en `filters` de `/search/map` forma (a) — P1 hoy
>   recorta client-side, es solo consistencia.
> - Aceptar `filters` transitorios en la paginación de sesión
>   `{session_id, offset, filters}` — dejaría todo en un solo canal, pero
>   entendemos que pisa la semántica de "la paginación no toca nada": si no
>   va, P1 usa `/search/structured` stateless (plan de este documento).
>
> Criterios de aceptación que P1 va a verificar:
> - bbox chico en el microcentro sobre "deptos en venta en capital" →
>   `total_matches` < 421 y el 100% de las cards de cada página dentro del
>   rectángulo.
> - bbox que cubre toda la provincia → mismo `total_matches` que sin filtros
>   **menos** los avisos sin coordenadas (tier 1).
> - Latencia: presupuesto de `/search/structured` (~20-90 ms) — es un WHERE
>   más sobre columnas que ya existen (el gate del mapa las usa).
> - `min > max` en un rango → 422 o cero resultados, pero no 500.
>
> Si prefieren modelarlo como un param `bounds: {south, west, north, east}`
> en vez de la whitelist, a P1 le da igual: avisen la forma y adaptamos.

---

## 3. Cambios en P1 (estimado: 1-2 días, DESPUÉS de que P2 confirme)

### 3.1 `src/components/ResultsMap.tsx` — emitir el viewport

- Nueva prop `onBoundsChange?: (b: {south, west, north, east}) => void`,
  disparada en `moveend`/`zoomend` con **debounce ~500 ms**.
- ⚠️ **Guard anti-loop, la parte delicada:** los `fitBounds()` que el propio
  componente hace tras cada búsqueda (init, página nueva, RO al ganar tamaño)
  también emiten `moveend`. Marcar los movimientos programáticos (flag seteado
  antes de cada `fitBounds`/`setView`, limpiado en su `moveend`) y NO emitir
  `onBoundsChange` por ellos — si no, cada búsqueda re-dispara otra búsqueda.
- Mientras el modo esté activo, NO re-encuadrar el mapa al llegar resultados
  (el usuario está manejando el encuadre; un `fitBounds` se lo pisaría).

### 3.2 `src/components/SearchResultsView.tsx` — la lista con dos fuentes

- **Volver a guardar `context.search_params` del evento `done`.** Se dejó de
  usar el 30/08 al pasar el scroll a paginación por sesión, pero P2 lo sigue
  mandando (vocabulario interno, aceptado como alias por `/search/structured`)
  y es la base del criterio+bbox. Reponer el caso `done` del switch.
- Estado nuevo: `searchByMap: boolean` (toggle) y `mapBounds`. Con el toggle
  activo y bounds nuevos → `POST /api/search/structured` (la route quedó viva
  el 30/08 exactamente para esto) con:
  `{...search_params, filters: [...(search_params.filters ?? []), ...bboxFilters], offset: 0, limit: 10}`.
  - **Mandar `search_params` COMPLETO** (regla §6 del delta: perder
    `preferred_property_type`/`semantic_query` cambia el ranking) y pisar solo
    `limit`/`offset`/`filters` (+ `zones`, según §4.1).
  - Helper `boundsToFilters()` en `src/lib/p2/types.ts`.
- **Listas separadas, sin pisarse:** el modo bbox mantiene su propio
  `{cards, totalMatches, offset}`; apagar el toggle restaura la lista de
  sesión sin refetch. El scroll en modo bbox pagina por `/search/structured`
  con `offset` (no por sesión: la sesión no conoce el bbox); `related` llega
  en la última página igual que siempre.
- Contador en modo bbox: **"N en esta zona del mapa"** (sigue siendo
  `total_matches`, regla 7). Cero en el área ≠ vacío mudo (regla 6): mensaje
  propio ("No hay avisos en esta zona — movete o alejá el zoom"); acá no hay
  `suggestions` de P2 (canal structured), y está bien: el contexto es otro.
- Pills: la de zona pasa a "Zona del mapa" mientras el toggle esté activo
  (ver §4.1). Una búsqueda tipeada nueva apaga el modo y resetea.
- La narrativa/`summary` del turno original se conservan (describen el
  criterio escrito, no el encuadre) — no pedir narrativa nueva por arrastre.

### 3.3 UI

- Toggle sobre el mapa, esquina superior: `[✓] Buscar al mover el mapa`
  (patrón Airbnb). Arranca según §4.3.
- Mobile (overlay fullscreen): al mover el mapa con el toggle activo, la
  lista de atrás ya queda filtrada; al volver con "Ver lista", banner
  arriba: "Mostrando la zona del mapa · N — [Quitar]".

### 3.4 Observabilidad y mocks

- Eventos nuevos (`src/lib/track.ts`): `map_search_toggled {on}`,
  `map_bounds_search {total_matches, pins_visibles}`; `results_page_loaded`
  suma `kind: "bbox"`.
- `mockSearchStructured` (`src/lib/p2/mocks.ts`): aplicar filtros de rango
  sobre lat/lng de las cards generadas — el modo demo tiene que ejercitar el
  flujo completo, incluido el guard anti-loop (regla de la casa: el mock
  imita al real).

### 3.5 Verificación (Playwright, patrón de sesiones anteriores)

- Arrastrar el mapa → el listado cambia y el contador dice "en esta zona".
- Buscar de nuevo → NO se dispara búsqueda extra por el `fitBounds` propio
  (contar requests a `/api/search/structured`: exactamente los del arrastre).
- Toggle off → vuelve la lista de sesión sin red.
- Página corta final en modo bbox → `related` presente.

## 4. Decisiones de producto PENDIENTES (de German, antes de codear)

1. **Bbox vs. zona escrita (choca con la regla 2, "lo que escribe el usuario
   predomina").** Si escribió "en Capital" y arrastra hasta Rawson: ¿el bbox
   reemplaza `zones` (Airbnb suelta la ubicación al mover; recomendado, con la
   pill "Zona del mapa" haciendo visible el reemplazo) o interseca (daría
   vacío)? Recomendación registrada: **reemplaza mientras el toggle esté
   activo**; el resto del criterio escrito (tipo, presupuesto, filtros) se
   conserva intacto.
2. **Avisos sin coordenadas (tier 1) quedan afuera** de toda lista filtrada
   por mapa — la asimetría "N de M con ubicación publicada" pasa a ser la
   lista misma. ¿Alcanza con el aviso del mapa o va nota en la lista?
3. **Default del toggle:** ¿activo (como Airbnb) o apagado hasta que el
   usuario lo prenda? Recomendación: apagado en la primera iteración (cambio
   de comportamiento más chico), medir uso con `map_search_toggled`.

## 5. Plan B — sin tocar P2 (solo si hace falta una demo antes)

P1 ya tiene todos los pins con coordenadas. Al activar el toggle: bajar el
listado completo del criterio en páginas de 100 por `/search/structured`
(421 avisos ≈ 5 requests × ~80 ms ≈ 1,3 MB) y filtrar/paginar client-side por
bbox preservando el orden. Funciona hoy y a escala San Juan es viable, pero es
fuerza bruta (peso en mobile, universo grande = ~2.400) y duplica lógica que
P2 haría con un WHERE. **No integrarlo como solución definitiva.**

## 6. Resumen de esfuerzo

| Parte | Qué | Tamaño |
|---|---|---|
| P2 | `latitude`/`longitude` en la whitelist de `filters` + tests | Chico |
| P1 | §3 completo | 1-2 días |
| Producto | §4 (tres decisiones) | Una charla |
