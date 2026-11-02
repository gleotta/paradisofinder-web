# Plan 2026-11-01 — Invertir con análisis de inversión en el core, y FINDER por MCP (ChatGPT y Claude)

**Qué es este documento: la propuesta para decidir con German**, con la
evidencia medida el 01/11 contra P2 local. Origen: pedido de German del 01/11
("quiero trabajar en la parte de inversión: una búsqueda más inteligente,
resuelta por el LLM tipo agente con varias consultas, cuyo texto responda a
una consulta compleja de inversión y muestre las propiedades más acordes; y
después, cómo integramos todo con MCP para ChatGPT y Claude"). Retoma B9 y B10
de `docs/BACKLOG.md`.

**Decisión de German del 01/11 (tarde): la inteligencia vive en el core.**
"Cuando integro con los LLM, integro desde el core, no desde la web." La
primera versión de este plan recomendaba el agente en el server de P1 (para
no abrir una ronda con P2); esa recomendación quedó superada. Lo que sigue
describe el reparto decidido: **P2 planifica, consulta y redacta; P1
muestra, espera bien y limita el costo.** El pedido a P2 está en
`docs/PEDIDO_P1_A_P2_2026-11-01_analisis-inversion.md`. Las decisiones que
siguen abiertas, en §7.

Regla que gobierna todo (spec §5, reglas duras y regla 13): **P3 calcula, P2
expone, P1 muestra.** El pipeline **no calcula indicadores ni fija umbrales**:
planifica consultas, lee lo que P3 ya calculó y lo cuenta en prosa con los
textos de P3.

---

## 0. Evidencia (01/11, P2 local `:8000`, Docker `finder-core` + `finder-pipeline-db-1`)

### 0.1 Línea de base: qué hace hoy FINDER con una consulta compleja de inversión

Consulta de prueba: *"Tengo 80 mil dólares para invertir en San Juan y quiero
comprar algo para alquilar. ¿Me conviene un departamento en Capital o una casa
en Rivadavia? Priorizá la rentabilidad y que esté por debajo del precio de
similares."*

| Capa | Qué pasó |
|---|---|
| Extracción de P2 (`/search/text`, LLM Haiku 4.5, 2,3 s) | Bien: `vertical: sale`, `zones: [capital, rivadavia]`, `budget_max: 80000`, `order: gross_yield_desc`, `semantic_query: "para alquilar, subvaluada respecto de la zona"`. |
| Turno conversacional (`POST /search`) | **Una sola búsqueda**, 490 resultados, ordenados por rentabilidad. La pregunta ("¿depto en Capital o casa en Rivadavia?") se **aplana**: no compara las dos opciones, no responde. El texto es el resumen template. Los tres primeros: casas en Capital a US$ 70-80 mil con 17-18 % de rentabilidad y 30 % por debajo de similares. |
| P1 (web) | Invertir = frase canónica "para invertir y alquilar, ordenadas por renta" → compra ordenada por `gross_yield_desc`. La card muestra "Esta propiedad · estimación" y "Rentabilidad promedio de la zona" cuando llegan (regla 13 d). |

Conclusión: la **interpretación** ya es razonable; falta **descomponer en
varias consultas, comparar y redactar una respuesta**.

### 0.2 Lo que ya existe en P2 y nadie usa

- **La vertical `investment` SÍ es alcanzable por `/search/structured`**
  (`{"vertical": "investment", ...}`): 384 departamentos en Capital, y el score
  cambia de clase (`inversion`: la rentabilidad puntúa con peso 0,15;
  `score_components` trae `gross_yield`). Lo que NO la alcanza es el **canal
  conversacional**: "invertir" y `vertical_override: "invertir"` se mapean a
  `compraventa` + "para invertir". Corrige lo anotado el 01/09.
- **Whitelist de `filters[]`** útil para inversión: `gross_yield_pct`,
  `valuation_gap_pct`, `price_percentile`, `opportunity_score`,
  `days_on_market`, `price_usd`, `area_sqm`, `bedrooms`, `condition`,
  `mortgage_eligible`… Más `semantic_query`, `near` + `distance_asc`, `place`,
  `limit ≤ 100`, `offset`.
- **Por card** llegan rentabilidad y renta estimada, posición frente a
  similares y percentil, `deal_rating` + motivos, los dos semáforos de
  inversión + motivos, `score_components` con `description`, `zone_ref`
  (tendencia, `cap_pct`), `price_ref`, `price_trend`, `days_on_market`,
  `location_confidence`. Todo lo que hace falta para argumentar **sin calcular
  nada**.
- **Detalle** (`GET /property/{id}`): el conjunto entero de similares,
  semáforos con motivos, contexto de mercado.
- **En P2 ya hay** proveedor de LLM con Claude (`app/providers/llm.py`, con
  `complete` y `stream_complete`), prompts de extracción y narrativa,
  `narrative_guard` (verifica oración por oración que cada número tenga
  respaldo), sesiones, observabilidad y el adaptador MCP. Es lo que el
  pipeline reutiliza.

### 0.3 Cobertura de los indicadores de inversión por zona

Medido vía `/search/structured` (vivienda en venta activa, tier ≥ 1; sin
tocar la DB). Script: `scripts/cobertura-inversion.py` (se corre con
`python3 -I scripts/cobertura-inversion.py src/data/zones.json` contra el P2
local; respeta el rate limit de 30/min, tarda ~80 s).

| Indicador | Venta de vivienda (2.345) |
|---|---|
| Con comparación de precio (`valuation_gap_pct`) | 1.975 · **84 %** |
| Con rentabilidad estimada (`gross_yield_pct`) | 874 · **37 %** (480 casas · 394 departamentos) |
| Rentabilidad: mediana · p90 · máxima | 7,7 % · 12,6 % · **18,6 %** (ya sin los imposibles: P3 la anula con gap > +35 %) |
| De las 874 con rentabilidad: `deal_rating: green` | 232 |
| … semáforo "para alquilar" (`rental_investment_rating`) | verde 132 · amarillo 385 · rojo 357 |
| … semáforo "reventa" (`resale_investment_rating`) | verde 113 · amarillo 440 · rojo 321 |
| … con tendencia zonal · con `cap_pct` · con `price_ref` · con coordenadas | 862 · 413 · 871 · 679 |
| Precio mediano del conjunto con rentabilidad | US$ 120.000 |

| Zona | Ventas de vivienda | Con rentabilidad | |
|---|---|---|---|
| Capital | 983 | 573 | 58 % |
| Rivadavia | 463 | 209 | 45 % |
| Santa Lucía | 274 | 67 | 24 % |
| Rawson | 244 | 25 | 10 % |
| Pocito | 122 | 0 | — |
| Chimbas | 95 | 0 | — |
| Zonda · Albardón · Caucete · Ullum · Iglesia · 9 de Julio | 37 · 30 · 23 · 20 · 15 · 13 | 0 | — |
| Las otras 7 zonas | 1 a 8 cada una | 0 | — |

Lectura: la rentabilidad existe **solo en el Gran San Juan central** (4 zonas,
el 84 % del stock en venta). En las otras 15 no hay ninguna, porque no hay
alquileres similares publicados con los que P3 estime la renta (P3, regla 038
d: mismo tipo, dormitorios, superficie ±30 %, misma zona, mínimo 5). **Pero
en esas zonas sí hay comparación de precio, tendencia zonal y referencia de
precio**: hay con qué hablar, siempre que se diga qué falta.

### 0.4 El MCP que P2 ya tiene (`POST /mcp`, probado `tools/list` el 01/11)

Tres tools, Streamable HTTP **sin estado** y con respuestas JSON (lo que
Claude.ai y ChatGPT esperan), **sin auth**, rate limit 10/min por sesión
(`MCP_RATE_LIMIT_RPM`) + por IP:

| Tool | Hace | Problemas vistos |
|---|---|---|
| `finder_create_session` | crea sesión (opcional) | — |
| `finder_search(query, session_id?, vertical?)` | el mismo motor conversacional; devuelve texto para LLM + hasta 5 cards con **foto en base64** | `vertical: invertir` = compra + "para invertir" (no usa el score `investment`); el texto dice "Opportunity Score N/100"; 5 cards es poco para comparar; el base64 engorda cada respuesta |
| `finder_property_detail(property_id)` | detalle + 3 comparables | el link es `{FINDER_FRONTEND_URL}/dettaglio/<id>` → en producción **404** (B10) |

No hay tool de zona, de comparación ni de similares. El agente que arma la
respuesta es el **LLM cliente** (Claude o GPT): P2 solo le da texto. Para MCP
eso es correcto, y es lo que la Parte 2 conserva.

### 0.5 Lo que no existe en ningún lado

- Un endpoint de **estadísticas por zona** (`zone_stats` solo viaja dentro de
  cada card): "¿en qué zona conviene invertir?" se responde buscando por zona
  y resumiendo lo que traen las cards (así lo hace el paso 2 del pipeline,
  hasta que P2 exponga `zone_stats` de vivienda, B2).
- Rentabilidad **neta** (expensas 0 %, B4), vacancia, tiempo hasta alquilar,
  apreciación proyectada (B13). Nada de esto se inventa.

---

## 1. Qué es "una búsqueda inteligente de inversión"

Cuatro tipos de pregunta, y qué hace el pipeline con cada una:

| Tipo | Ejemplo | Consultas que arma | Qué responde |
|---|---|---|---|
| **Selección** | "con 80 mil, qué compro para alquilar" | 1-3 búsquedas `investment` (por tipo, por zona), 50 cards cada una | Las 3-6 propiedades más acordes **con el motivo de P3**, y cuántas quedaron fuera por qué |
| **Comparación** | "depto en Capital o casa en Rivadavia" | una búsqueda por opción | Comparación lado a lado: rentabilidad y posición **de los avisos encontrados**, tendencia de la zona, stock; elige y dice por qué, o dice que no se puede elegir |
| **Zona / mercado** | "en qué zona conviene invertir" | una búsqueda por zona candidata | Zonas con rentabilidad (4) y sin ella (15): **lo dice**, y en las segundas argumenta con posición, tendencia y referencia de precio |
| **Una propiedad** | "¿este aviso es buena inversión?" | detalle + similares | Lo que P3 ya dice de esa propiedad, en prosa, y 2-3 alternativas del mismo conjunto |

**Solo Invertir, y solo cuando la pregunta lo pide.** Alquilar, Comprar y
Lotes son preguntas de "mostrame X": una extracción, una búsqueda, cards en
~85 ms (regla 1). Dentro de Invertir, "departamentos para invertir en
Capital" también es simple: el paso 1 del pipeline lo detecta y no hay
análisis. El pipeline corre solo con señales de decisión (comparación,
elección, pregunta de zona, presupuesto sin zona ni tipo). Las piezas son
genéricas; su uso en otra vertical es otra decisión, fuera de este plan.
Lotes como inversión queda fuera de la Fase 1 (P3 no les calcula rentabilidad).

**Lo que la respuesta puede y no puede decir** (reglas duras + regla 13 +
regla 4): cada número sale de una card o de un resumen; los juicios son los de
P3 con sus textos, sin umbrales propios ni "mala inversión"; puede describir
el conjunto encontrado ("de los 48, la mitad entre 6 y 9 %") rotulado así;
vocabulario sin jerga (guía §10) y `ESTIMATE_NOTICE` al pie, que agrega P1;
cero resultados o cero rentabilidad nunca es un vacío mudo (regla 6); no
cambia zona, tipo ni presupuesto en silencio (regla 2). El detalle, en el
pedido §1.3.

---

## 2. Dónde vive: en el core (decidido)

| Opción | A favor | En contra |
|---|---|---|
| **B. En P2** (decidido) | La integración con LLM sale del core (principio de German); P2 ya tiene proveedor de LLM, prompts, `narrative_guard`, sesiones, observabilidad y MCP; **las mismas funciones** sirven al análisis de la web y a las tools MCP (la reutilización real está en las herramientas, no en el bucle); `producto-p1.md` no cambia (P1 sigue sin LLM); las búsquedas internas del pipeline no pasan por HTTP y no consumen el rate limit del sitio | Es una ronda con P2, y grande (German relaja su regla del 04/10 para esto); P1 depende del contrato nuevo para ver algo |
| A. En el server de P1 | Sin ronda con P2; itera rápido | Un LLM en la web contradice el principio; duplica con MCP las herramientas; cambia el alcance de P1; paga tokens desde P1 |
| C. Solo el LLM cliente (MCP) | Cero costo de tokens | No sirve para la web: ahí no hay LLM cliente |

Por qué **pipeline en tres pasos y no agente con bucle de tools**: el
proveedor de LLM de P2 expone `complete` (JSON) y `stream_complete`, sin uso
de tools; planificar como JSON → ejecutar en proceso → redactar con guard
encaja con lo que P2 ya hace (extracción JSON + narrativa con guard), son
**dos** idas al modelo en vez de seis a ocho, y cada paso se prueba por
separado.

---

## 3. El pipeline en P2 (resumen; el contrato completo en el pedido)

1. **Planificar** (LLM, JSON, ≤ 4 s): `question_type` (`seleccion |
   comparacion | zona | propiedad | simple`), 1 a 6 búsquedas
   `StructuredSearchRequest` con `vertical: "investment"` forzado y `limit ≤
   50`, resúmenes de zona opcionales, `note` con lo asumido. **`simple` →
   `skip`**: la puerta que evita pagar y esperar donde el flujo normal alcanza.
2. **Ejecutar** (sin LLM, en proceso): cada búsqueda contra
   `app.core.structured_search`; por búsqueda un **resumen del conjunto
   encontrado** (cantidad, con rentabilidad, mediana y rango de rentabilidad,
   mediana de posición, conteos de semáforos, `zone_ref`, `price_ref`);
   candidatos = unión sin duplicados por `opportunity_score` de clase
   inversión, tope 12, con la card completa.
3. **Redactar** (LLM en streaming): `picks` (3 a 6 ids de los candidatos con
   `motivo` ≤ 140 caracteres que cita un motivo de P3, con la card completa),
   `comparison` opcional (tabla con los valores del paso 2), prosa de 60 a
   150 palabras por `narrative_guard` oración por oración.

Eventos SSE (CRLF): `plan → step* → picks → [comparison] → answer_chunk* →
done`, o `skip`, o `error`. Límites: 45 s en total (`done.partial: true`),
cancelación al desconectarse el cliente (no se paga el paso 3), 6 búsquedas,
rate limit propio. Modelo del paso 3 por variable (propuesta Opus 5.5;
Sonnet 5.5 si la latencia pesa). Aceptación en el pedido §4.

---

## 4. Lo que hace la web (P1)

Tamaños: chico = horas · medio = uno o dos días · grande = más. "D" = necesita
decisión de German (§7).

### 4.1 Contrato y flujo

| # | Qué | Tamaño |
|---|---|---|
| 1 | **Pedido a P2** con el contrato (hecho: `docs/PEDIDO_P1_A_P2_2026-11-01_analisis-inversion.md`; se copia al repo de P2 cuando German lo apruebe) | — |
| 2 | **Route handler `/api/invest/analysis`**: reenvía el SSE de P2 al browser como `/api/search/stream`; topología A intacta | chico |
| 3 | **Dos canales en paralelo**: la misma consulta dispara la búsqueda normal (cards en < 1 s) y el análisis; una consulta nueva aborta el análisis en curso (`AbortController`, y P2 cancela del otro lado); el análisis nunca bloquea cards, mapa, chips ni scroll | medio |
| 4 | **Disparador**: solo en modo Invertir y solo por envío explícito del usuario; nunca desde páginas SEO, prefetch ni bots; `skip` de P2 → no se muestra nada. **D1**: ¿también cuando el texto es de inversión con otro vertical elegido? | chico |

### 4.2 Panel y espera

| # | Qué | Tamaño |
|---|---|---|
| 5 | **Panel "Lectura de FINDER · inversión"** arriba del listado. Estados: analizando (pasos a medida que llegan + segundos transcurridos), respuesta en streaming, selección, error, tiempo agotado, cupo alcanzado, interruptor apagado (no existe). Aparece recién con `plan` (sin parpadeo en consultas simples). Plegable con estado recordado (`localStorage`). Mobile 380 primero, `aria-live="polite"`, aire lateral | grande |
| 6 | **Mensaje de espera honesto**: "Puede tardar hasta un minuto" desde el primer paso, con el listado ya visible | chico |
| 7 | **Tiempo máximo del cliente**: 60 s sin `done` → lo que llegó o "No alcancé a terminar el análisis; el listado está completo" | chico |
| 8 | **Selección de FINDER**: `PropertyCard` con layout Invertir + línea "Por qué: …" marcada como texto del análisis; detalle en pestaña nueva con `?s=&r=` y origen `invest_pick` | medio |
| 9 | **Prosa y comparación**: texto por chunks como la narrativa; la tabla `comparison` dibujada si llega. **D2**: tabla sí/no | medio |
| 10 | **`ESTIMATE_NOTICE` al pie siempre**, lo agrega P1 | chico |
| 11 | **Zonas sin rentabilidad en el listado**: si el orden es por rentabilidad y las primeras cards no la traen, una línea lo dice y ofrece "Ordenar por oportunidad" en la misma sesión (frase ya validada en `interpretation.ts`) | chico |

```
┌─ barra sticky: [consulta] [Alquilar · Comprar · (Invertir) · Lotes]
├─ Entendí: hard_filters (como hoy)
├─ ▍Lectura de FINDER · inversión                          ← panel nuevo (desde `plan`)
│   ✓ Departamentos en Capital hasta US$ 80.000 — 212 avisos
│   ✓ Casas en Rivadavia hasta US$ 80.000 — 61 avisos        · 14 s
│   [tabla de comparación, si llega]
│   «De las dos opciones, los departamentos en Capital … (prosa por chunks)»
│   Selección de FINDER  [card][card][card][card]   ← picks con "Por qué"
│   Valores estimados a partir de avisos publicados… (ESTIMATE_NOTICE)
├─ 490 resultados · listado normal                     │  mapa (como hoy)
```

### 4.3 Costo y límites

| # | Qué | Tamaño |
|---|---|---|
| 12 | **Interruptor por entorno** `INVEST_ANALYSIS_ENABLED`: apagado, Invertir funciona como hoy. La palanca si el costo se dispara | chico |
| 13 | **Caché del análisis en el server de P1** por consulta normalizada + vertical, unos minutos (memoria o `CACHE_DIR`): recargas, back/forward y links compartidos no vuelven a pagar | medio |
| 14 | **Cupos**: por visitante y por IP (propuesta 5 análisis cada 10 min) y tope diario global por variable (propuesta 300). Superado, mensaje claro en el panel y el listado sigue. **D4**: valores | medio |
| 15 | **Una ejecución por pregunta**: sin reintentos automáticos; quitar o editar un chip no re-analiza. **D5**: ¿link "Volver a analizar" manual? | chico |
| 16 | **D3 (producto): automático o botón.** Automático con la puerta `simple` de P2 y los cupos (recomendado), o botón "Analizar como inversión" que hace el costo opt-in (plan B) | — |

### 4.4 Analítica, pruebas y despliegue

| # | Qué | Tamaño |
|---|---|---|
| 17 | **Eventos** en `src/lib/track.ts`: `invest_analysis_requested`, `_started` (con `analysis_id`), `_step`, `_answered` (latencia, pasos, `usage`, costo, n picks, `partial`), `_skipped`, `_failed`, `_timeout`, `_quota_reached`, `invest_pick_opened`, `invest_panel_toggled`; fila "modo inversión" en `/interno/embudo` | chico |
| 18 | **Playwright** `tests/e2e/invertir-analisis.spec.ts`, mobile primero, contra P2 real: panel, pasos, selección, tabla, aviso, plegado, interruptor apagado, cupo, abort al buscar otra cosa | medio |
| 19 | **Golden set de 20 preguntas** (las escribe German, **D6**) corrido con `scripts/invest-eval.mjs` contra P2 local: guarda plan, pasos, picks, prosa, `usage`, latencias; rúbrica del pedido §4 | medio |
| 20 | **Gate de stage**: el smoke verifica que el endpoint responde a una sonda `simple` (`skip`, sin paso 3); no corre análisis reales en cada deploy | chico |
| 21 | **Fallback técnico de `P2_MODE=auto`**: mock mínimo del endpoint para que P1 no rompa sin P2; no se usa para probar | chico |
| 22 | **Redirección `/dettaglio/:id → /propiedad/:id`** (301, `next.config.ts`), prueba en `dominio-iconos.spec.ts`: arregla hoy los links que el MCP de P2 entrega | chico, **se puede hacer ya** |
| 23 | **Documentación**: `DECISION_2026-11-01_invertir-core.md`, regla nueva en CLAUDE.md, `.env.example`, `docs/DEPLOY_RAILWAY.md` con las variables | chico |

---

## 5. Parte 2 — FINDER por MCP para ChatGPT y Claude

### 5.1 Requisitos de los clientes (verificados el 01/11; confirmar en la doc oficial antes de implementar)

**Claude.ai (conectores personalizados):** transporte Streamable HTTP (SSE
legado en retirada); **sin auth o OAuth 2.1** con registro dinámico de
clientes (callback `https://claude.ai/api/mcp/auth_callback`); tools, prompts
y resources; las conexiones salen de la nube de Anthropic (servidor público por
HTTPS); límites citados: 300 s por llamada y ~150.000 caracteres por
resultado. Fuentes:
[Building custom connectors via remote MCP servers](https://support.claude.com/en/articles/11503834-building-custom-connectors-via-remote-mcp-servers),
[claude.com/docs/connectors/building](https://claude.com/docs/connectors/building.md).

**ChatGPT:** servidor público HTTPS en `/mcp`; acceso completo a tools con
**Developer Mode** (Settings → Apps & Connectors → Advanced), cuya
disponibilidad por plan **varía según la fuente**; los conectores de *deep
research* exigen dos tools `search` y `fetch` (con `id`, `title`, `url`);
conectores personalizados marcados como no verificados; sin auth u OAuth; el
Apps SDK permite devolver *widgets* con las cards. Fuentes (terceros):
[Vercel: MCP server as ChatGPT connector](https://vercel.com/kb/guide/mcp-server-chatgpt-connector?from=graph),
[ChatGPT custom MCP connectors with Developer Mode](https://medium.com/@alexeylark/chatgpt-custom-mcp-connectors-with-developer-mode-d791fde17d25),
[How to add an MCP server to ChatGPT (2026)](https://designrevision.com/blog/add-mcp-server-to-chatgpt.md),
[How to add MCP tools to ChatGPT](https://www.getdrio.com/blog/how-to-add-mcp-tools-to-chatgpt),
[Acceldata: search docs in ChatGPT using MCP](https://docs.acceldata.io/pulse/user-guide/search-docs-in-chatgpt-using-mcp-server).

El `/mcp` de P2 ya cumple la forma y German ya tiene un conector
"ParadisoFinder" cargado en claude.ai. Lo que falla es el **contenido**
(§0.4) y lo que falta son las **tools de inversión**.

### 5.2 Camino decidido: ampliar el `/mcp` de P2 con las mismas funciones del pipeline

Con la inteligencia en el core, la Parte 2 es natural: las funciones del paso
2 (búsqueda `investment`, resúmenes, comparación, similares) se exponen como
tools (`finder_invest_search`, `finder_zone_summary`, `finder_compare`,
`finder_similar`, más los alias `search`/`fetch` para ChatGPT), con
`structuredContent`, fotos por URL y links a `/propiedad/<id>`; se corrigen el
link del detalle y el vocabulario; `finder_search` con `vertical: invertir`
pasa a usar la vertical `investment` real. El LLM cliente sigue siendo el
agente: **no hace falta exponer el pipeline** por MCP, y si se expone
(`finder_invest_analysis`) va apagado hasta tener OAuth o cuota por cliente,
porque cuesta tokens a FINDER por cada llamada de cualquier cliente. Detalle
en el pedido §2.

Lo que P1 hace en esta parte: la redirección de `/dettaglio` (§4.4, #22),
`utm_source=mcp` en los links para medir en el embudo, y probar los
conectores en Claude.ai y en ChatGPT Developer Mode cuando P2 entregue.

---

## 6. Costo y latencia estimados (por análisis, dos idas al modelo)

Supuestos: planificar con el extractor actual (~4 k tokens de entrada, ~0,6 k
de salida); redactar con ~15 k de entrada (plan + resúmenes + 12 candidatos
compactos, prompt cacheado) y ~1,5 k de salida. Precios de la API al 01/11.

| Paso 3 con | ≈ por análisis | 100 análisis/día |
|---|---|---|
| Opus 5.5 (`claude-opus-5-5`, US$ 4 / 20 por M) | ≈ US$ 0,10 | ≈ US$ 10/día |
| Sonnet 5.5 (`claude-sonnet-5-5`, 2 / 10) | ≈ US$ 0,07 | ≈ US$ 7/día |
| Haiku 5.5 (`claude-haiku-5-5`, 0,10 / 0,50) | < US$ 0,01 | < US$ 1/día |

La puerta `simple` y los cupos de P1 (§4.3) son lo que mantiene el volumen
bajo: la mayoría de las consultas de Invertir son simples y no pagan nada.
Latencia: `plan` 2-4 s, búsquedas < 1 s en total, redacción 5-15 s →
**10-25 s** hasta `done`; por eso el panel aparece con `plan` y muestra los
pasos, y el listado normal está desde el segundo 1.

---

## 7. Decisiones que siguen abiertas (German)

> **02/11:** P2 entregó (`docs/HANDOFF_P2_INVEST_2026-11-01.md`) y P1 integró
> asumiendo la propuesta de cada fila (D1 no, D2 sí, D3 automático, D4 5 cada
> 10 min / 300 por día, D5 no). Qué se hizo con cada una y lo que sigue
> abierto: `docs/DECISION_2026-11-02_analisis-inversion.md` §2 y §4. D8 quedó
> resuelta por los hechos: P2 implementó el pedido.

| # | Decisión | Propuesta |
|---|---|---|
| D1 | Disparador también por texto de inversión con otro vertical elegido | no en Fase 1: solo con Invertir elegido (regla 2 se respeta igual: el texto manda sobre zona/tipo) |
| D2 | Tabla de comparación estructurada | sí, opcional, P2 la manda solo en `comparacion` y `zona` |
| D3 | Automático o botón | automático con la puerta `simple` + cupos; botón como plan B |
| D4 | Cupos | 5 análisis / 10 min por visitante; 300 por día en total; variables de entorno |
| D5 | "Volver a analizar" manual tras editar chips | no en Fase 1 |
| D6 | Golden set de 20 preguntas | las escribe German antes de que P2 entregue, para que P2 también las use |
| D7 | Modelo del paso 3 y presupuesto mensual | Opus 5.5; Sonnet 5.5 si la latencia pesa; tope mensual a definir |
| D8 | Aprobar el pedido a P2 tal como está escrito y copiarlo al repo de P2 | — |

Resueltas el 01/11: la inteligencia vive en el core (B); solo Invertir y
solo si la pregunta lo pide; Lotes fuera de la Fase 1; el pipeline no se
expone por MCP sin auth.

---

## 8. Fases y orden

| Fase | Qué | Depende de |
|---|---|---|
| **0 — hoy** | Este plan; medición de §0.3; el pedido a P2 (borrador); redirección `/dettaglio` (#22) | D8 para copiar el pedido |
| **1 — P2** | El endpoint del pedido §1 con sus pruebas y variables en Railway | D2, D7; golden set (D6) |
| **1 — P1, en paralelo** | #2-#23 de §4 contra el Docker local de P2 a medida que P2 entrega; `DECISION_*`; Playwright y `invest-eval.mjs` | D1, D3-D5 |
| **2 — MCP** | Pedido §2 en P2; P1 prueba los conectores en Claude.ai y ChatGPT; `utm_source=mcp` | Fase 1 estable |
| **3 — después** | `zone_stats` por zona en P2 (B2) para reemplazar el resumen por cards; OAuth si se expone el pipeline; otras verticales si German lo pide | uso real de la Fase 2 |

Orden de salida a producción: `price_ref` (sync P3 → P2 → P1, pendiente al
01/11) sale antes o junto, porque el pipeline y la card lo leen.

---

## 9. Referencias

- Pedido a P2: `docs/PEDIDO_P1_A_P2_2026-11-01_analisis-inversion.md`.
- Backlog B9 (inteligencia de inversión) y B10 (inversiones por MCP):
  `docs/BACKLOG.md`.
- Cards por vertical, Invertir: `docs/GUIA_P1_2026-09-29_cards-por-vertical.md`
  §2, §9, §13.
- Contrato de P2: `docs/API_CONTRACT_P2_2026-09-13.md` §2.1, §4.1, §4.6-4.8.
- MCP de P2: `app/adapters/mcp.py` y `docs/MCP_INTEGRATION.md` del repo
  `paradisofinder-core`.
- Scoring de P2 por clase (`inversion` con `gross_yield` 0,15):
  `app/core/scoring.py` y `SCORING.md` del repo de P2; guard de narrativa:
  `app/core/narrative_guard.py`.
- Reglas de P3 para la renta estimada: `CLAUDE.md` del repo `finder-pipeline`,
  puntos 16 d y 16 h.
