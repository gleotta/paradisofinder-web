# Decisión 2026-11-02 — Invertir con análisis de inversión (segundo canal) y links del MCP

**Qué es:** el registro de lo que P1 hizo con el handoff de P2 del 01/11
(`docs/HANDOFF_P2_INVEST_2026-11-01.md`), que entrega el endpoint
`POST /api/v1/search/invest` pedido en
`docs/PEDIDO_P1_A_P2_2026-11-01_analisis-inversion.md`, y de las decisiones
que P1 tomó donde German todavía no decidió (plan 01/11 §7). Decisión marco
de German del 01/11: **la inteligencia vive en el core** (P2 planifica,
consulta y redacta; P1 muestra, espera bien y limita el costo) y, en Invertir,
**las dos cosas en paralelo**: el stream de siempre y el análisis.

Regla que gobierna todo: **P3 calcula, P2 expone, P1 muestra.** P1 no agrega
indicadores ni umbrales; cada texto del panel es de P2/P3 tal cual; lo único
que P1 pone es el aviso de estimación al pie (`ESTIMATE_NOTICE`).

---

## 1. Lo que hay en P1 desde el 02/11

| Pieza | Dónde | Qué hace |
|---|---|---|
| Route handler | `src/app/api/invest/analysis/route.ts` | Reenvía el SSE de P2 al browser (topología A). Interruptor, cupos, caché, `X-Visitor-Id`, ledger de costo. 204 si el canal está apagado o el P2 del entorno no tiene el endpoint (Railway hasta su deploy). |
| Cliente de P2 | `searchInvest()` en `src/lib/p2/client.ts` | `POST /search/invest` con `Accept: text/event-stream`, `X-Visitor-Id` y `signal`; devuelve la Response tal cual (el handler decide con 429/404). |
| Cupos | `src/lib/server/invest-quota.ts` (puro) · `src/lib/server/invest.ts` | Por visitante y por IP: 5 análisis cada 10 min; tope diario 300 (D4, valores de la propuesta). Un `skip` se devuelve al cupo. 429 con `code` y `Retry-After`. |
| Caché | `src/lib/server/invest.ts` | En memoria, por consulta normalizada (minúsculas, espacios, puntuación final), 15 min, solo respuestas completas (`skip` o `done` con `partial: false`). Header `X-Invest-Cache: hit|miss`. |
| Estado del análisis | `src/lib/invest-analysis.ts` | Lee el SSE y lo reduce a fases: `waiting → running (plan) → writing (picks) → done`; `skip`/204 → nada; 429 → `quota`; `error`/corte → `error` (solo si ya había plan); 60 s sin `done` → `timeout` con lo que llegó. Emite los eventos. |
| Panel | `src/components/InvestPanel.tsx` + CSS `.invest-*` | "Lectura de FINDER · inversión", arriba del listado, aparece recién con `plan`: pasos con sus conteos y "ver avisos", tabla de comparación (apilada en mobile), prosa por oraciones, "Selección de FINDER" (cards Invertir con la línea "Por qué" de P2, origen `invest_pick`), aviso de estimación. Plegable con estado recordado (`pf_invest_panel`), `aria-live`. |
| Enganche | `src/components/SearchResultsView.tsx` | Dispara el análisis con el texto CRUDO del usuario en el mismo tick que la búsqueda cuando la vertical es Invertir (URL, selector con resultados, chip "Invertir" de una aclaración). Lo cancela en toda búsqueda nueva, al cambiar de vertical, al voltear la asunción y si el `summary` re-sincroniza a otra vertical. Quitar/editar chips, relajar o paginar NO re-analiza (D5). |
| Card | `src/components/PropertyCard.tsx` | Props `reason` (línea "Por qué", `clean()`) y `origin`; el link del detalle lleva `from=invest_pick`. |
| Analítica | `src/lib/track.ts`, `src/lib/server/funnel.ts`, `/interno/embudo` | `invest_analysis_{requested,started,step,answered,skipped,failed,timeout,quota_reached,cancelled}`, `invest_panel_toggled`, `invest_step_clicked`; el server asienta `invest_analysis_server` (costo y `usage` de `done`) aunque el browser se vaya. Tabla "Análisis de inversión" en el tablero. |
| Health y smoke | `/api/health` (`invest_analysis`), `scripts/ci/smoke.mjs` paso 6 | El smoke manda la sonda simple y exige `skip` o `plan`; 204 (apagado / P2 sin endpoint) es una nota, no un fallo. |
| MCP | `next.config.ts` | `/dettaglio/:id → /propiedad/:id` (redirección permanente, 308 en Next; conserva `?utm_source=mcp`). |
| Mock | `mockSearchInvest` en `src/lib/p2/mocks.ts` | Solo `skip`: fallback técnico de `P2_MODE=auto`. No se prueba con él. |
| Pruebas | `tests/e2e/invertir-analisis.spec.ts` | Contra P2 real: simple sin panel y otras verticales sin pedido; comparación completa (pasos, tabla, prosa, picks con "Por qué", aviso, vocabulario, eventos, plegado, sin scroll horizontal); caché; cancelación al buscar otra cosa; selector a Invertir con resultados; redirección de `/dettaglio`. |
| Variables | `.env.example`, `docs/DEPLOY_RAILWAY.md` | `INVEST_ANALYSIS_ENABLED`, `INVEST_QUOTA_PER_VISITOR`, `INVEST_QUOTA_WINDOW_MIN`, `INVEST_DAILY_MAX`, `INVEST_CACHE_TTL_MIN`. Ninguna obligatoria. |

Flujo en pantalla (plan §4.2, tal cual):

```
┌─ barra sticky: [consulta] [Alquilar · Comprar · (Invertir) · Lotes]
├─ 214 resultados · Entendí: hard_filters (como hoy)
├─ ▍Lectura de FINDER · inversión                    Analizando · 4 s ▾
│   ✓ Departamento en Capital hasta US$ 80.000 — 214 avisos · 150 con rentabilidad estimada · ver avisos
│   ✓ Casa en Rivadavia hasta US$ 80.000 — 54 avisos · 3 con rentabilidad estimada · ver avisos
│   [tabla de comparación]
│   «En departamentos en Capital hasta US$ 80.000 encontré 214 avisos… (prosa por oraciones)»
│   Selección de FINDER  [card · Por qué][card · Por qué][…]
│   Valores estimados a partir de avisos publicados, no de operaciones concretadas. Son orientativos.
├─ listado normal por rentabilidad                      │  mapa (como hoy)
```

## 2. Decisiones que P1 tomó (las abiertas del plan §7, con el valor asumido)

Revisadas con German el 02/11: D1 y D3 confirmadas tal como están; la espera
antes de `plan` cambió a un cartel visible (implementado el mismo día). D2, D4
y D5 siguen con el valor asumido hasta que German diga otra cosa. **Railway
queda fuera hasta el OK local de German (02/11): todo se prueba contra el
Docker del 8000.**

| # | Decisión | Qué hizo P1 | Cambiarlo cuesta |
|---|---|---|---|
| D1 | ¿Analizar también texto de inversión con otra vertical elegida? | **No**: solo con Invertir elegido (URL `?v=invertir`, selector o chip). Si el texto manda a otra vertical ("depto para alquilar" con Invertir puesto), el análisis se cancela al llegar el `summary`. **Confirmado por German el 02/11: el análisis arranca solo cuando la consulta se hace desde el selector de Invertir, nunca porque el texto hable de invertir.** P1 elige a qué servicio llamar según el selector; P2 solo decide si la pregunta tiene sustancia (`skip`/`plan`). | — (cerrado) |
| D2 | Tabla de comparación | **Sí**, si P2 la manda (`comparison`): tabla con `columns`/`rows`; en mobile cada opción es un bloque "rótulo: valor". `raw` no se usa todavía. | Quitar un bloque del panel |
| D3 | Automático o botón | **Automático** con la puerta `simple` de P2 y los cupos de P1. **Confirmado por German el 02/11** (automático, desde el selector). | — (cerrado) |
| D4 | Cupos | **5 por visitante (y por IP) cada 10 min; 300 por día** (en memoria del proceso). `skip` no cuenta. | Variables de entorno |
| D5 | "Volver a analizar" tras editar chips | **No** en esta fase: el panel queda con la pregunta original; una búsqueda nueva lo reemplaza. | Un link que llame a `invest.start(urlQuery)` |
| D6 | Golden de 20 | Sigue siendo de German; P2 corre el suyo con `scripts/qa_invest.py --golden`. | — |
| D7 | Modelo y presupuesto | Lo fija P2 (`INVEST_LLM_MODEL`, Opus 5.5 por default). P1 muestra `model` y `cost_usd` en la analítica y en el tablero. | — |
| — | Espera antes de `plan` | **Cartel de espera desde el envío** (German, 02/11; antes no había nada hasta `plan`, por el parpadeo en el caso simple): el panel aparece en fase `waiting` con "Analizando · N s" y el texto "Estoy leyendo el mercado para tu consulta: zonas, precios y rentabilidad estimada. Si hay algo que sumarle al listado, lo vas a ver acá en unos segundos." (`WAITING` en `InvestPanel.tsx`, texto de P1). Con `plan` lo reemplazan los pasos; con `skip`, 204 o fallo antes de `plan` el panel se va (una pregunta simple lo muestra ~1,4 s, y el texto explica por qué puede irse). Sin aviso de estimación mientras espera. | El texto, una constante |
| — | Sesión en el request | `session_id: null`: el análisis arranca en el mismo tick que la búsqueda, antes de que exista la sesión. La correlación va por `search_id`/`session_id` en el sobre de los eventos de P1 (`started`, `answered` salen con la sesión ya abierta). | Disparar después de `POST /sessions` |
| — | `adjustments` del plan | No se muestra; viaja en `invest_analysis_started`. `note` sí (bloque lila). | — |
| — | "ver avisos" por paso | El rótulo del paso es una consulta válida del buscador (sondeado 02/11: "Departamento en Capital hasta US$ 80.000" → Capital · departamento · US$ 80.000, 214) → link a `/buscar?q=<label>&v=invertir` en pestaña nueva. | — |

## 3. Verificado el 02/11 (P1 dev `:3001` → P2 Docker local `:8000`)

| Prueba | Resultado |
|---|---|
| Simple por P1 ("departamentos para invertir en Capital") | `skip` en **1,4 s**, `X-Invest-Cache: miss`; la misma pregunta con mayúscula y punto final → `hit`, al instante. |
| Comparación por P1 (70 mil, Capital vs. Santa Lucía) | `plan → step×4 → picks → comparison → answer_chunk×5 → done` en **8,3 s**; `cost_usd 0,0511`, `narrative: llm`. Ledger `invest_analysis_server` en `logs/events-2026-11-02.jsonl` con costo y `usage`. |
| Desconexión | SSE cortado a los 3 s (tras `plan` y los 4 `step`): el log de P2 registró `outcome: cancelled`, `stage: write`, `cancelled: true` con 115 tokens de salida (la redacción ya había arrancado y se cortó). Cerrar el SSE sí frena el gasto. |
| 429 de P2 | Sondeado el 01/11 contra P2 directo: 7.ª request en el minuto con el mismo `X-Visitor-Id` → 429 `{"error": "Rate limit exceeded: 6 per 1 minute"}` **sin `Retry-After`** (el handoff lo anuncia; P1 asume 60 s). |
| Cupo de P1 | Prueba a mano del módulo puro (`InvestQuota`): ventana por clave, IP compartida entre visitantes, devolución por `skip`, tope diario con `Retry-After` hasta las 00:00 UTC, reinicio al día siguiente. |
| `vertical_override` en sesión (handoff §9.1) | `"invertir"` cae en **Compra · Opportunity Score**; pero **`"investment"` (en inglés, como dice el handoff) SÍ entra**: `summary.vertical = "Compra para inversión"`, orden `opportunity_score` con el componente "Rentabilidad estimada" (la clase de score de inversión de P3, la misma de los picks y del MCP), mismos 214 avisos, y se mantiene al refinar ("hasta 60 mil" → 145) y al paginar. Sondeado 02/11 (segunda pasada; la primera solo probó `invertir`). En sesión NUEVA no hay atajo: `query` + override juntos borran el texto (2.426 sin filtros) y el texto "para invertir" solo queda en Compra por score; hay que hacer dos turnos, y el segundo espera a que termine la narrativa del primero (cards a ~2,1 s aunque se corte el primer stream). La frase de hoy ("ordenadas por renta") pasa por el extractor LLM (~1,9 s) y da el mismo ~2 s. **Es un cambio solo de P1** (§4.2); la decisión es de German. |
| Playwright `invertir-analisis.spec.ts` | Ver §5 (registro de la corrida). |

Latencias medidas por P2 (20 preguntas): `plan` 1,3-2,1 s, `picks` 5,3-6,9 s,
`done` 6-9,5 s. Por eso el estado del panel es "Analizando · N s" con los
pasos, y el listado está desde el primer segundo.

## 4. Qué queda abierto (German) y qué espera P1

1. **Railway**: el endpoint llega con el próximo deploy de `develop` de P2
   (+ sus variables, handoff §7). Hasta entonces P1 en stage/producción
   responde 204 y no muestra nada; no hace falta apagar nada. Después del
   deploy de P2, correr `BASE_URL=https://paradisofinder.com npx playwright test invertir-analisis`.
2. ~~Invertir con la vertical de inversión de verdad~~ **Decidido por German el
   02/11 y hecho el mismo día (§6).**
3. **Valores de los frenos** de P2 (4 / 500 / 6 por minuto) y de P1 (5 cada
   10 min / 300): ajustar con el tráfico real; se ven en `/interno/embudo`.
4. **Golden de 20** (D6): corrido el 02/11 contra el P2 local con las 20 de P2
   (`tests/invest_evaluation/golden_invest.json` del repo de P2, su guion
   `qa_invest.py --golden`), en cuatro tandas porque el guion no manda
   `X-Visitor-Id` y cae en el freno de 6/min a partir de la séptima: **20/20
   según la rúbrica de P2**, 16 con análisis y 4 `skip`, US$ 0,71 en total.
   Las 20 respuestas enteras, con la expectativa de P2 en palabras y un
   espacio para el veredicto, en `docs/GOLDEN_INVERSION_2026-11-02.md`.
   **Falta el veredicto de German** sobre cuáles valen como referencia.
5. **MCP**: probar los conectores en Claude.ai y ChatGPT (Developer Mode)
   contra el P2 desplegado; medir `utm_source=mcp` en el embudo (hoy la
   redirección ya está; el parámetro todavía no se asienta en
   `property_detail_opened` — chico, cuando haya tráfico).
6. **Fallo de P2 antes de `plan`** (502/503 `llm_unavailable`): P1 no muestra
   nada (queda en `invest_analysis_failed`), porque no sabe si la pregunta era
   simple. Si se quisiera avisar siempre, es una línea en `reduceInvestEvent`.
7. ~~Cartel de espera~~ Hecho el 02/11 (§2, fila "Espera antes de `plan`"):
   se muestra desde el envío y se retira sin frase de cierre; el texto ya
   anticipa que puede irse. Si German quiere otro texto, es la constante
   `WAITING`.

## 5. Registro de corridas

- 02/11 — `BASE_URL=http://localhost:3001 npx playwright test invertir-analisis`
  (dev → P2 Docker `:8000`): **12/12** (6 por proyecto, mobile 380 px primero).
  Las primeras pasadas destaparon dos cosas que se arreglaron: (a) en dev,
  StrictMode desmonta y vuelve a montar en el mismo tick y el abort del hook
  mataba el análisis recién pedido (`requested` sin `skip` ni `plan`) → el
  abort de desmontaje va diferido un tick; (b) la prueba de cancelación tiene
  que buscar desde la barra sticky (in-app): con `goto` el browser tira el
  evento junto con la página. Una tercera pasada mostró un comportamiento de
  producto, no un bug: con "priorizá la rentabilidad" en el texto y **Comprar**
  elegido, P2 ordena por renta y el selector se re-sincroniza a Invertir
  (regla 2) **sin análisis** (D1 = no); el click en "Invertir" ahí lo apaga.
  Si German quiere que el texto de inversión dispare el análisis aunque el
  selector diga otra cosa, es D1 = sí (un `if` en el handler de `cards`).
- 02/11 — `node scripts/ci/smoke.mjs http://localhost:3001` con cruce contra
  P2: OK, paso 6 "sonda simple → skip (caché)".
- 02/11 — regresión de `t7-metrics`, `cards-invertir` (con la batería común
  `cards-vertical`) y `t2-chips` contra el mismo dev: **30/30** (2 saltadas:
  el tablero del embudo exige `METRICS_TOKEN` en este entorno; verificado a
  mano con el token: la tabla "Análisis de inversión (Invertir)" muestra los
  pedidos, paneles, skips, cancelados, latencias y el costo acumulado del día).

**02/11, segunda corrida (cartel de espera; dev `:3001` → P2 Docker `:8000`).**
`tsc` y `eslint` limpios. Playwright `invertir-analisis` **12/12** (mobile 380 px y
escritorio): la pregunta simple muestra el cartel en fase `waiting` y el panel se
va con `skip` (la prueba demora 1,5 s la respuesta REAL de P2 en el browser con
`page.route`, no es un mock, porque con la caché de P1 el `skip` llega en ~30 ms);
la comparación muestra el cartel y con `plan` lo reemplazan los pasos (presupuesto
distinto por corrida para que la primera pasada sea un miss y la prueba de caché
un hit). Sondeo en el browser con una pregunta simple nueva: `waiting` de los 583
a los 1.430 ms, después `idle`; las cards a los 4,5 s. Capturas del cartel a 380
y 1.280 px revisadas: título, "Analizando · N s", texto en una o dos líneas,
arriba del esqueleto, sin scroll horizontal. Golden de 20: ver §4.4. Railway no
se tocó (German: todo local hasta el OK).

**02/11, cuarta corrida — Docker local antes de commitear (`docker compose up -d
--build`: la misma imagen que Railway, `:3000` → P2 Docker `:8000`).** Imagen
reconstruida con todo lo del día (cartel de espera, Invertir = `investment`,
`/api/invest/analysis`, 308 de `/dettaglio`); arranque sin avisos;
`/api/health?deep=1` OK con `invest_analysis: true`. Smoke contra `:3000`: OK
(sonda simple → skip). Batería Playwright **completa** (18 specs, mobile 380 px y
escritorio, con `METRICS_TOKEN`; cupo subido a 40 por visitante solo para la
corrida): **184/186 en 22 min**. Los 2 fallos (`t2-chips` "cambiar el orden" en
mobile y "nota de asunción" en escritorio) son el mismo síntoma, "No pude iniciar
la búsqueda": `POST /sessions` de P2 respondió **429** dos veces seguidas (14:59:49
y 15:11:40; P1 reintenta una vez y después muestra el error). Es el freno por IP
de P2 bajo la carga de la batería — todas las llamadas salen de la misma IP y
`t1-streaming` + `t2-chips` abren una sesión por búsqueda — con el rastreo del
sitemap de fondo (lo disparó `compartir-og-sitemap` al pedir `/sitemap.xml`: 57
llamadas a `/search/structured` en 413 s) y, entre 15:03 y 15:05, 55 × 429 en
`/search/structured` que coinciden con las páginas SEO de `t6-seo` sobre la caché
fría del container nuevo. Las dos pruebas solas, después: `t2-chips` **8/8** en
17 s. No es una regresión de código: es el límite por IP de P2 ya documentado
(`rate_limit_search` 30/min, compartido con el sitemap). Ledger del día en el
volumen: 9 análisis servidos (7 skip, 2 done), US$ 0,10. Ruido esperable en el
log del container: "The destination stream closed early" ×5 (las pruebas cierran
la pestaña con el SSE abierto). El container quedó con los cupos por defecto (5
cada 10 min, 300/día) para el OK local de German; el compose deja pasar las
`INVEST_*` desde el shell o el `.env` (`docs/DOCKER.md` §4). Railway no se tocó.

## 6. Invertir = la vertical de inversión de P2 (German, 02/11)

**Decisión.** "Si Invertir es inversión, cuando el usuario busque con Invertir
se activa la vertical de inversión; distinto es cuando busca para alquilar o
comprar." Hasta hoy Invertir era Comprar ordenado por rentabilidad (la frase
"para invertir y alquilar, ordenadas por renta"); el handoff de P2 (§9.1) pedía
pasar al override `investment`.

**Qué hace P1 ahora.**

| Situación | Antes | Ahora |
|---|---|---|
| Sesión nueva con Invertir elegido (home, `?v=invertir`, texto nuevo con Invertir puesto) | frase canónica anexada → extractor LLM ~2 s → Compra por `gross_yield_desc` | `prepareTurn`: sonda `/search/text` (como siempre) → si el texto es compra/sin vertical y no pide aclaración, **siembra** `POST /search` sync con el texto crudo (~190 ms, sin narrativa) y el turno real es `{session_id, vertical_override: "investment"}` → `summary.vertical` "Compra para inversión", orden por puntaje de oportunidad de inversión, zona/tipo/presupuesto intactos; cards a ~10 ms + narrativa |
| Selector Invertir con resultados / chip "Invertir" de una aclaración | frase como refinamiento | `vertical_override: "investment"` como las otras tres |
| Texto que manda a otra vertical ("para alquilar", lotes) con Invertir puesto | crudo, el selector se re-sincroniza | igual (la sonda lo detecta antes de sembrar) |
| Otra ciudad ("en Mendoza") con Invertir puesto | aclaración por el stream | igual (la sonda marca `clarification_needed` → texto crudo) |
| "ordenadas por renta" en Comprar | el selector saltaba a Invertir | queda en Comprar (una compra ordenada por renta no es Invertir) |
| Fallback "Buscar con filtros" (sync) | frase | siembra + `POST /search` con el override, sin `query` (P2 lo acepta, verificado) |
| Re-sincronización del selector | `order_code === "gross_yield_desc"` | código del filtro duro `vertical` del `summary` (`investment` / `sale` / `rent` / `land`; `temporary_rent` = sin selección) y, sin él, la etiqueta |

**Por qué sembrar con sync.** Verificado 02/11 contra el Docker: con `query` y
`vertical_override` juntos en sesión NUEVA el override pisa el texto (2.426
avisos sin filtros); ningún texto llega a `investment` ("para invertir", "como
inversión", "compra para inversión" quedan en Compra); un turno de stream
después de otro espera a que termine la narrativa del anterior (~2 s, aunque se
corte el stream); `/search/text` NO siembra la sesión; `POST /search` sync SÍ
la siembra, en ~190 ms y sin LLM, y el override por stream que sigue da las
cards a ~10 ms. Resultado: el camino nuevo es más rápido que la frase vieja,
que pasaba por el extractor LLM (~1,9 s).

**Qué cambia para la persona.** Primero salen las propiedades con mejor
puntaje de inversión (rentabilidad + precio frente a similares + tiempo
publicado + actualización), no las de mayor renta a secas: en el ejemplo
probado, primero un 13,8 % verde oscuro y bien posicionado en vez de un 14,3 %
verde claro publicado hace más de 6 meses. El listado, la "Selección de
FINDER" del panel y el MCP usan el mismo criterio. El chip "Entendí" muestra
"Compra para inversión" (etiqueta de P2). El chip "Para renta" de la home sigue
sumando su frase: con Invertir, siembra con esa frase (orden por renta) y el
override conserva el orden.

**Costo.** Una búsqueda nueva en Invertir hace tres llamadas a P2 (sonda,
siembra, stream) en vez de dos; cuentan para `rate_limit_search` (30/min). La
narrativa se paga una sola vez.

**Código.** `src/lib/vertical.ts` (`VERTICAL_OVERRIDE.invertir`,
`verticalFromSummary` por código, `VERTICAL_PHRASE` sin invertir),
`src/lib/server/compose-query.ts` (`prepareTurn`), rutas `api/search/stream` y
`api/search/sync`, `SearchResultsView` (`changeVertical`, `OVERRIDE_BY_CHIP`),
mocks (`investment` → "Compra para inversión", override `investment`).
Prueba nueva `tests/e2e/invertir-vertical.spec.ts` (sesión nueva, selector ida
y vuelta con el mismo total, texto de alquiler, otra ciudad, "ordenadas por
renta" en Comprar): registro en §5.

**02/11, tercera corrida (Invertir = vertical de inversión; dev `:3001` → P2 Docker `:8000`).**
`tsc` y `eslint` limpios. Playwright `invertir-vertical` **10/10** (mobile y
escritorio): sesión nueva con Invertir → chip "Compra para inversión" con
Departamento · Capital · hasta US$ 80.000 intactos, selector Invertir, card
con layout Invertir, primeras cards antes de 2,5 s; Comprar → click Invertir →
mismo total de resultados con la vertical de inversión → click Comprar vuelve;
"para alquilar" con Invertir queda en Alquiler sin panel ni `started`; "en
Mendoza" con Invertir da la aclaración; "ordenadas por renta" en Comprar sigue
en Comprar. Regresión `invertir-analisis cards-invertir t2-chips t1-streaming
t7-metrics`: **52/52** (2 saltadas por METRICS_TOKEN). Medido en el browser
(`data-first-cards-ms`): Invertir **399 ms** y **336 ms** ("casa en Rawson")
contra Comprar 268 ms — antes la frase vieja daba ~2 s (extractor LLM) y hasta
4,5 s con la narrativa. Smoke contra `:3001`: OK.
Railway no se tocó.
