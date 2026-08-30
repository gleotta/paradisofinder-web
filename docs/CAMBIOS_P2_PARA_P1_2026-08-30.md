# Cambios de P2 que P1 tiene que aplicar · 29-30 de agosto de 2026

**De:** P2 (FINDER Core) · **Para:** el equipo de P1
**Estado de P2:** release gate PASS 9/9 · golden de extracción 121/121 · 352 tests

Documento de DELTA. La fuente de verdad sigue siendo `P1_INTEGRATION_SPEC.md`
y el Swagger vivo (`http://localhost:8001/docs`); acá está solo lo que cambió
desde el handoff del 28/08 y qué hay que tocar de cada lado.

---

## Resumen: qué tiene que hacer P1

| # | Cambio | ¿P1 tiene que tocar algo? |
|---|---|---|
| 1 | `POST /search/map` — el mapa | **Sí**: una llamada reemplaza el workaround |
| 2 | Paginación en `/search` y `/search/stream` | **Sí** si el chat va a paginar |
| 3 | `complemento` → `related`, con semántica nueva | **Sí**: renombre + cambia cuándo llega |
| 4 | Claves de respuesta al inglés | **Sí**: renombres (tabla abajo) |
| 5 | Reglas de verticales (renta/reventa) | No — pero conviene conocerlas |
| 6 | Dúplex: preferencia, no filtro | **Sí**, un detalle del scroll |
| 7 | `order` empieza a devolver 2 valores que ya estaban en el contrato | **Revisar**: ramas nunca ejercidas |

---

## 1. El mapa: `POST /search/map`

Cierra el hueco §4.1 del handoff. Devuelve **TODOS** los pins del criterio,
no la página rankeada: el mapa armado con `/search/structured` + `limit=100`
dibujaba ~79 puntos de ~300.

Dos formas excluyentes: criterio estructurado (portal) o `{session_id}` (chat).

| criterio | coincidencias | pins | antes |
|---|---|---|---|
| deptos en venta en capital | 421 | **333** | 79 |
| casas en venta en rawson | 189 | **139** | 73 |

**P1 cambia UNA llamada y elimina el aviso de parcialidad.** El gate
`quality_tier >= 2` + coordenadas lo aplica P2: no llega jamás un pin sin
ubicación. p95 de 38 ms en el peor caso. Contrato: `P1_INTEGRATION_SPEC.md` §2.

## 2. Paginación en el chat

`POST /search` y `POST /search/stream` aceptan `limit` (default 20) y
`offset`. Para la página siguiente se manda **sin `query`**:

```jsonc
{ "session_id": "b7e2d4f0-…", "offset": 20 }
```

**No cuenta como turno**: no llama al LLM, no mergea, no toca el estado ni el
historial. Medido **14-21 ms** contra los ~2-3 s de un turno con narrativa.
En SSE una paginación emite `cards` → `done` **sin `response_chunk`**.

Errores: request sin `query`, sin `vertical_override` y sin `offset` → 422.
Paginar una sesión que todavía no buscó → 422.

## 3. `complemento` → `related` (⚠️ incompatible)

Cambia el nombre **y cuándo llega**.

| antes | ahora |
|---|---|
| `complemento` | `related` |
| `motivo: "resultados_insuficientes"` | `reason: "structured_exhausted"` |
| `agregadas` | `count` |
| `faltantes` | *(se fue)* |
| llegaba en cualquier página a medio llenar | **solo en la ÚLTIMA página**, máx **10** |

La regla nueva: los resultados salen siempre de la búsqueda estructurada y se
paginan; las relacionadas (embeddings) llegan cuando **ya no hay más
resultados duros que traer**. En las páginas intermedias `related` es `null`.
P1 ya no necesita llamar a `/search/semantic` ni deduplicar: viene resuelto.

## 4. Claves de respuesta al inglés (⚠️ incompatible)

| antes | ahora |
|---|---|
| `riepilogo` | `summary` |
| `riepilogo.zona` / `.tipo` / `.orden` | `summary.zone` / `.property_type` / `.order` |
| `riepilogo.nota_asuncion` | `summary.assumption_note` |
| `riepilogo.total_resultados` | `summary.total_results` |
| `context.zona` / `.tipo` / `.orden` | `context.zones` / `.property_type` / `.order` |
| `context.superficie_min` | `context.area_min_sqm` |
| `citta` | `market` |

**Bug de canal corregido:** el evento SSE emitía los nombres internos, así
que el MISMO dato salía como `campo/operador/valor` por `/search/stream` y
como `field/operator/value` por `/search`. Ahora los dos canales emiten
idéntico. Si P1 tenía un workaround para eso, se puede borrar.

**No cambió:** `context.search_params` conserva el vocabulario interno del
motor — no es contrato de nombres, y `/search/map` y `/search/structured` lo
aceptan igual.

*Validación:* caracterización diferencial de 24 escenarios
(`tests/migration_snapshot/`) — la única diferencia admitida entre antes y
después es esta tabla de renombres.

## 5. Reglas de verticales (no requiere cambios en P1)

Tres de las cuatro intenciones son COMPRAS. **"renta" nunca significa
alquilar**: significa comprar para rentar. Igual "reventa".

1. **¿Hay verbo de compra?** (comprar / invertir / adquirir / "en venta") →
   COMPRA, sin importar qué venga después. *"comprar depto para alquiler
   profesional"* es una compra.
2. **Sin verbo de compra**: "renta"/"reventa" → compra; cualquier otro
   "alquilar/alquiler" → INQUILINO, siempre.

Si un usuario se queja de "busqué para alquilar y me mostró alquileres": está
bien, es la regla del mercado AR.

## 6. Dúplex: preferencia, no filtro — **un detalle del scroll**

Quien busca DEPARTAMENTO ve los dúplex; quien busca DÚPLEX ve primero los que
lo son y detrás los departamentos. Llega como `property_type: null` +
**`preferred_property_type: "apartment"`** + `semantic_query: "dúplex"`.

⚠️ **Lo único que P1 tiene que cuidar:** al paginar se reenvía
`extraction.params` a `/search/structured`. **Mandalo COMPLETO**, sin filtrar
campos desconocidos. Si se pierde `preferred_property_type` (o
`semantic_query`), la página 2 cambia de ranking — medido: difiere desde la
posición 2.

`preferred_property_type` es preferencia BLANDA: **ordena, no filtra**.
Existe porque P3 no tipifica el dúplex (14 de 60 quedaron como `house`) y un
filtro duro los excluía.

**No es un campo transitorio.** Sirve para cualquier categoría que P3 no
tipifique. Cuando P3 tipifique el dúplex, el campo sigue existiendo y P1 no
tiene que tocar nada: lo único que cambiará es que el dúplex dejará de usarlo
y pasará a llegar como un `property_type` normal — un valor nuevo en un enum
que P1 ya reenvía tal cual. **Integrar hoy no se rehace mañana.**

## 7. `order`: dos valores del contrato que hasta ahora nunca llegaban

**El contrato NO cambia** — `gross_yield_desc` y `days_on_market_desc` ya
estaban en la lista de `order` del spec (§5b) desde el principio. Lo que
cambia es que **ahora se emiten de verdad**.

Hasta el 30/08 el prompt de extracción le ofrecía al LLM 5 de los 8 órdenes,
así que esos dos nunca salían: una consulta como *"la renta más alta"* caía en
`price_desc` — el orden opuesto al pedido. Corregido en `ar-1.10.0`.

Impacto medido en la prueba de fuego del 30/08: **48 de 100** consultas de
inversión-para-renta pasaron a `gross_yield_desc` (antes: ninguna).

⚠️ **Lo único que P1 tiene que mirar:** si hay un `switch`/mapa de `order` →
etiqueta visible ("Ordenado por precio", "Ordenado por oportunidad"), las
ramas de `gross_yield_desc` y `days_on_market_desc` **nunca se ejercitaron**.
Conviene confirmar que no caen en un default vacío. Mismo chequeo para
`price_per_sqm_asc` y `price_percentile_asc`, que llegan poco.

---

## Checklist de migración para P1

- [x] Renombrar `complemento` → `related` y su shape (`reason`/`count`), y
      esperar que llegue **solo en la última página**.
- [x] Renombrar las claves de la tabla §4 (`summary`, `market`, `context.*`).
- [x] Borrar cualquier workaround por la discrepancia sync/SSE. *(P1 no tenía.)*
- [x] Reenviar `extraction.params` COMPLETO al paginar (§6). *(Resuelto de
      raíz: P1 pagina con `{session_id, offset}` — el criterio vive en P2.)*
- [x] Cambiar el mapa a `POST /search/map` y sacar el aviso de parcialidad.
      *(Ya estaba hecho el 29/08.)*
- [x] (Opcional) Paginar el chat con `{session_id, offset}`. *(Adoptado como
      mecánica única del scroll; `/search/semantic` eliminado de P1.)*
- [x] Revisar el mapa de `order` → etiqueta: `gross_yield_desc` y
      `days_on_market_desc` empiezan a llegar (§7). *(Las 8 ramas existen en
      `src/lib/labels.ts`; la etiqueta visible sale de `summary.order`, texto
      de P2.)*

*Checklist marcado por P1 el 2026-08-30 al aplicar la migración (verificada
E2E contra la instancia viva).*

## Qué NO cambió

La **Card** no se tocó: mismo shape, mismas reglas de display, mismos
`content_language` y semáforos. `/search/text`, `/search/structured` y
`/search/semantic` conservan su contrato salvo los renombres de §4 y el
`offset` nuevo en `/search/text`.
