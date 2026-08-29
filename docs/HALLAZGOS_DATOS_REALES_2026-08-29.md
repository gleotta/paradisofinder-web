# Hallazgos de la integración con P2 real (2026-08-29)

Al pasar P1 de mocks a la instancia real (Docker local, `http://localhost:8000`)
aparecieron diferencias entre lo documentado y el contrato vivo. Todas están
corregidas en P1; las dos primeras conviene que P2/P3 las confirmen.

## 1. `deal_rating_reasons`, no `deal_reasons` — CRÍTICO (corregido)

La spec §5 nombra genéricamente `*_reasons`; el contrato real es:

| rating | clave de reasons |
|---|---|
| `deal_rating` | **`deal_rating_reasons`** |
| `resale_investment_rating` | `resale_investment_reasons` |
| `rental_investment_rating` | `rental_investment_reasons` |

P1 leía `deal_reasons` → el chip "Precio" se mostraba **sin explicación**, violando la
regla de producto 4 ("ninguna señal sin explicación"). Se lee con `dealReasons()`
(`src/lib/format.ts`), que acepta ambas. **Pedido a P2:** confirmar si la asimetría es
deliberada o si conviene unificar los nombres.

## 2. El SSE de P2 usa CRLF — CRÍTICO (corregido)

`/search/stream` separa los eventos con `\r\n\r\n`. El parser de P1 buscaba `\n\n`,
que **no existe** dentro de `\r\n\r\n`: el chat quedaba mudo contra datos reales
(HTTP 200, cero eventos procesados, sin error visible). El mock usaba LF y lo tapaba.
Corregido en `src/lib/sse.ts` (normaliza CRLF, incluso partido entre chunks) y el mock
ahora también emite CRLF para no volver a esconderlo.

## 3. La sesión del chat nace vacía: el primer refinamiento se perdía (corregido)

La estrategia híbrida (portal stateless → chat con sesión) tenía un agujero: P2 abre la
sesión sin contexto, así que el primer refinamiento no tiene qué refinar. Medido:

| turno | resultado |
|---|---|
| sesión nueva + `"mejor en alquiler"` | clarificación con chips, 0 cards |
| sesión nueva + `"casa en rawson"` y luego `"mejor en alquiler"` | Alquiler / Rawson / 25 |
| sesión nueva + `"casa en rawson, mejor en alquiler"` | Alquiler / Rawson / 25 |

P1 siembra el primer turno de la sesión anteponiendo la consulta del portal (el
refinamiento va después, así lo último que escribió el usuario predomina); al usuario
se le muestra solo su texto. Esto **resuelve el pendiente de `producto-p1.md` §9**
("estrategia híbrida portal→chat"): se puede quedar en híbrida.

## 4. Campos de la card que no estaban en la spec (integrados)

- **`secondary_indicators[]`**: `{name, value, tooltip}` — indicadores con explicación,
  localizados por P3. Se muestran en el detalle ("Lectura de FINDER").
- **`score_badge_color`** (ej. `"green_dark"`): tipado, todavía sin uso en la UI.
- `heating` puede venir `"unknown"`: es el no-informado de P3, se omite como en
  `condition`.
- `zone` llega en minúsculas (`"rawson"`), y los `zones` del request también.

## 5. Realidades de los datos que afectan la UI (resueltas)

- **Densidad del mapa**: 139 pins reales en Rawson se superponían al punto de que un
  click era imposible → se sumó clustering (`leaflet.markercluster`).
- **Fotos rotas**: varias fotos de los portales 404 o bloquean el hotlink; card y
  galería descartan la que falla y muestran el degradado de la marca.
- **Tier 1 sin coordenadas**: la primera card de "casa en rawson" es tier 1, así que
  aparece en la lista pero no en el mapa. Es lo esperado y el aviso lo explica.
