# Pedido a P2 — `POST /api/v1/search/map` · Especificación propuesta

**De:** P1 (paradisofinder.com) · **Para:** equipo P2 (FINDER Core)
**Fecha:** 2026-08-29 · **Estado: IMPLEMENTADO E INTEGRADO** (mismo día).

> **Cerrado.** P2 lo implementó tal cual y P1 ya lo consume. Verificado contra la
> instancia Docker local (`http://localhost:8000`), datos reales de San Juan:
>
> | criterio | `total_matches` | `total_pins` | antes (mapeables de la página) |
> |---|---|---|---|
> | casas en venta en rawson | 189 | 139 | 73 |
> | deptos en venta en capital | 421 | 333 | 79 |
> | universo sin criterio | 2.381 | 1.824 | — |
>
> Latencia medida: 16 ms (Capital) y 43 ms para el universo completo (375 KB).
> `limit`/`offset`/`order` → 422; sesión inexistente → 404; `len(pins) == total_pins`
> en todos los casos. La fuente de verdad pasa a ser el Swagger vivo; este documento
> queda como registro del pedido y de la verificación.
>
> **Dos detalles del contrato final que P1 tuvo que contemplar:**
> 1. El schema es `additionalProperties: false` (`extra="forbid"`): los params del
>    portal/chat traen `limit`/`offset`/`order` y campos internos de cálculo, así que
>    se filtran con `toMapRequest()` (`src/lib/p2/types.ts`) antes de mandarlos.
> 2. `MapPin` no es una `Card` (no trae `zone` ni fotos, y `currency`/`operation` son
>    nullable): el popup del pin es compacto y navega a `GET /property/{id}`.
**Contexto:** handoff §4.1 (pedido ya registrado el 28/08) y `DECISION_2026-08-29_mapa.md`
(el mapa de P1 ya está en producción alimentándose de `/search/structured` con `limit=100`,
que es el mejor sustituto disponible: dibuja ~79 de ~300 puntos posibles en un criterio
típico).

---

## 1. Motivación (los números del handoff)

Los endpoints actuales topean en `limit=100` y devuelven resultados **rankeados**, no el
universo del criterio:

| criterio | coincidencias | tope API | con `tier >= 2` en la página |
|---|---|---|---|
| casas en venta en rawson | 189 | 100 | 73 |
| deptos en venta en capital | 421 | 100 | 79 |
| alquileres en capital | 271 | 100 | 74 |

El universo mapeable es chico y entra entero en una respuesta: **tier 2 = 2.476 avisos,
100% con coordenadas** (tier 1 = 888 avisos, 0% con coordenadas — por eso el filtro
`>= 2` no es de calidad sino de existencia de ubicación).

## 2. Contrato propuesto

### Request

`POST /api/v1/search/map` — `X-API-Key` obligatorio (topología A, igual que el resto).

Dos formas de invocación, mutuamente excluyentes:

```jsonc
// (a) Criterio estructurado — el MISMO vocabulario público de /search/structured.
//     P1 lo alimenta con extraction.params (portal) o context.search_params (chat).
{
  "vertical": "sale",                  // sale | rent | investment | temporary_rent
  "zones": ["Rawson"],
  "property_type": "house",
  "filters": [ { "field": "pool", "operator": "eq", "value": true } ],
  "currency": "USD",
  "area_min_sqm": 100
  // SIN limit / offset / order: no aplican (ver §3)
}
```

```jsonc
// (b) Sesión conversacional — P2 resuelve el estado acumulado server-side.
{ "session_id": "b7e2d4f0-…" }
```

- **Sin texto libre.** Este endpoint NO interpreta lenguaje natural (cero LLM): recibe
  criterio ya estructurado o una sesión. La extracción vive en `/search/text` y el chat.
- Los nombres de campos siguen el contrato internacional (claves en inglés, alias de
  transición aceptados como en el resto del request público).

### Response

```jsonc
{
  "total_matches": 421,      // avisos que cumplen el criterio en DB (mismo valor que /search/*)
  "total_pins": 338,         // subconjunto mapeable: tier >= 2 (todos tienen lat/lon)
  "citta": "san_juan",
  "params_applied": { "vertical": "sale", "zones": ["Rawson"], "property_type": "house" },
  "pins": [
    {
      "id": "sj-000123",
      "latitude": -31.5351,
      "longitude": -68.5386,
      "price": 65000,          // SIEMPRE el original del aviso
      "currency": "USD",       // USD | ARS
      "price_usd": 65000,      // única base comparable entre monedas (regla display §5)
      "rental_period": null,   // day | week | month | null — sin esto un precio de
                               // alquiler no es interpretable (regla dura #5)
      "property_type": "house",
      "operation": "sale"
    }
  ]
}
```

**Por qué estos campos y no menos:** el marker muestra `price`+`currency` (originales);
`price_usd` permite a P1 colorear/filtrar por rango sin violar la regla de "no comparar
nominales entre monedas"; `rental_period` evita mostrar un precio por día como si fuera
mensual. **Por qué no más:** el detalle completo ya existe (`GET /property/{id}`); el
popup de un pin fuera de la página cargada navega al detalle.

Sin `content_language`: la respuesta no contiene textos de P3.

## 3. Reglas de comportamiento

1. **Sin tope de resultados.** Devuelve TODOS los pins del criterio (peor caso absoluto:
   2.476, el universo tier 2 completo). Sin paginación.
2. **Filtro server-side fijo:** `quality_tier >= 2` (y coordenadas no nulas, que en tier 2
   es el 100%). P1 no recibe jamás un pin sin ubicación.
3. **Sin `order`:** un mapa no tiene ranking; el orden de `pins[]` es indistinto (se
   sugiere determinístico por `id` para respuestas estables/cacheables).
4. **`total_matches` consistente** con lo que `/search/text`/`/search/structured` devuelven
   para el mismo criterio (P1 muestra "N de M en el mapa").
5. **Session mode (b):** usa el estado acumulado de la sesión tal como lo dejó el último
   turno; sesión inexistente/expirada → **404** (P1 recrea sesión como ya hace).
6. Fast-path puro (SQL, sin LLM): el presupuesto de latencia esperado es el de
   `/search/structured` (~20-90 ms) + el volumen extra de filas.

## 4. Errores (§6 del contrato, sin cambios)

401 key · 404 sesión (solo forma b) · 422 params inválidos · 429 rate limit · 500
sanitizado. Se pide sumar el endpoint al bucket de rate limit de **búsqueda (30/min)**.

## 5. Criterios de aceptación que P1 va a verificar

- "deptos en venta en capital" → `total_matches` = 421 (igual que hoy), `total_pins` ≈ 338
  (todos los tier 2 del criterio, no 79).
- `pins.length == total_pins` en toda respuesta (sin tope).
- Cero pins con `latitude`/`longitude` nulos o `quality_tier < 2`.
- p95 < 300 ms con el criterio más gordo del mercado.
- Mismo criterio por forma (a) y por forma (b) con sesión equivalente → mismos pins.

## 6. Cómo lo consume P1 (integrado el 29/08)

- Una llamada por criterio, solo con el mapa visible (`POST /api/search/map` → P2).
- **Forma (b)** con `session_id` en los turnos de chat: P2 resuelve el estado acumulado,
  así P1 no tiene que reconstruir el criterio del turno. **Forma (a)** con
  `toMapRequest(extraction.params)` en el modo portal.
- El aviso sobre el mapa ya no habla de "esta página": dice **"N de M con ubicación
  publicada"**, que es la diferencia real entre `total_pins` y `total_matches` (los
  avisos tier 1 no tienen coordenadas).
- **Clustering** (`leaflet.markercluster`): 139 pins reales en Rawson se superponían al
  punto de ser inclickeables. Los clusters se abren con zoom/click.
