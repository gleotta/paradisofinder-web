# Statistiche — de los datos de ejemplo a la observabilidad de P2

18/11/2026 · Pedido de Germán: un tablero con datos interesantes para la gente de la
inmobiliaria, con link en el pie, armado sobre lo que P2 registra de las consultas.
Primera versión con **datos de ejemplo**; este documento dice qué hay, qué falta y en
qué orden se conecta a los datos reales.

## 1. Qué hay hoy

- **Página `/statistiche`**, en italiano y con el diseño del sitio. Se entra por el link
  "Statistiche" del pie. **Sin clave** (decisión de Germán: el sitio de la demo es
  privado).
- **Muestra datos de ejemplo** y lo dice arriba, en una franja ("Dati dimostrativi").
  La franja se va sola cuando la fuente pasa a ser P2. Lo único real hoy es la columna
  de avisos en catálogo por comune (conteo de la base del 18/11).
- **Selector de período**: 7, 30 o 90 días (`?p=`). El período cierra ayer.

Código (repo `paradisofinder-web`, rama `italia`):

| Archivo | Qué es |
|---|---|
| `src/lib/stats/types.ts` | **El contrato** (`StatsReport`): lo que la página necesita, venga de donde venga |
| `src/lib/stats/mock.ts` | Generador de los datos de ejemplo (determinístico, por fecha) |
| `src/lib/stats/source.ts` | **El único archivo que cambia** al conectar P2 (`getStatsReport`) |
| `src/app/statistiche/page.tsx` | La página |
| `src/components/stats/` | Gráfico diario, barras, medidores, barra segmentada |
| `src/app/italia.css` (sección "Statistiche") | Estilos y paleta de gráficos |
| `src/markets/italia/Chrome.tsx` | Link del pie |

## 2. Qué muestra y de dónde saldría cada dato

| Bloque | Dato | ¿Lo registra hoy P2? | Qué falta |
|---|---|---|---|
| Ricerche | Cantidad de búsquedas | Sí: `search_executed`, uno por turno | Nada |
| Visitatori | Visitantes distintos | No en la búsqueda. Solo viaja en los eventos que reenvía P1 | Que P1 mande el `visitor_id` en cada búsqueda y P2 lo guarde (§4.3) |
| Schede aperte | Fichas abiertas | Sí: `detail_viewed` (lo reenvía P1, con `property_id`) | Nada |
| Contatti all'agenzia | Clics en "Chiama l'agenzia" | Sí: `outbound_click` (con `property_id` y `channel`) | Nada |
| Ricerche al giorno | Serie por día | Sí (`created_at` de cada evento) | Nada |
| Dalla ricerca al contatto | Embudo por búsqueda | A medias: los eventos de P1 traen `search_id`; `search_executed` no | Que `search_executed` guarde su `search_id` = `<session_id>.<turno>` (§4.1) |
| Vendita o affitto | Operación | Sí: `vertical` | Nada |
| Domanda e offerta per comune | Búsquedas por comune | Sí: `zona` (lista de comuni entendidos) | El conteo de avisos por comune sale del catálogo (consulta a `p2_it.properties`) |
| Domanda senza offerta | Criterios con 0 o pocos avisos | A medias: hay `total_matches` y la consulta textual | El criterio completo (§4.1) y el lugar pedido fuera del catálogo |
| Tipologia, Camere, Budget, Caratteristiche | El criterio entendido | **No**: hoy solo se guardan operación y comuni | Guardar el criterio completo (§4.1). Es el cambio más importante |
| Immobili più visti | Vistas y contactos por aviso | Sí (`detail_viewed`, `outbound_click`) | Unir con el catálogo para título, comune y precio |
| Contatti per agenzia | Contactos por agencia | No directamente | Unir `property_id` → agencia. Hoy `p2_it.agencies` está vacía: lo tiene que cargar P3 (§4.4) |
| Ultime ricerche | Texto de las últimas búsquedas | Sí: `query` | Filtro de datos personales (§5) |

## 3. Qué registra hoy cada capa

**P2** (`app/repositories/observability.py`): cada evento es un JSON que se agrega a la
lista de Redis `finder:events` (y va al log estructurado). Tipos: `session_created`,
`search_executed`, `llm_clarification`, `empty_results`, `refinement_applied`,
`card_clicked`, `detail_viewed`, `outbound_click`, `conversation_reset`, y los de
WhatsApp y MCP. `search_executed` guarda `query`, `extractor`, `vertical`, `zona`,
`total_results`, `total_matches` y `latency_ms`.
**Nadie lo lee**: `get_recent_events` existe pero no hay endpoint ni pantalla, y la
lista no tiene recorte ni vencimiento.

**P1** (`src/app/api/events/route.ts`): registra TODO en un archivo por día
(`events-YYYY-MM-DD.jsonl`, en el volumen `/data/logs`) y reenvía a P2 lo que entra en
su enum (`card_opened` → `card_clicked`, `property_detail_opened` → `detail_viewed`,
`contact_click` → `outbound_click`, etc.), con `search_id`, `visitor_id` y `vertical`
en el payload. El log de P1 sirve de control cruzado
(`node scripts/events-report.mjs`).

**`/interno/embudo`** (P1): tablero interno de San Juan (embudo por día, latencias,
costo del análisis de inversión), en español. No es para la inmobiliaria y en esta rama
no se usa.

## 4. Lo que hay que hacer en P2

### 4.1 Guardar el criterio completo en `search_executed`
En `conversation_service.py`, donde hoy se arma el payload, sumar del criterio ya
resuelto: `search_id` (`<session_id>.<turno>`), `property_type`, `budget_min`,
`budget_max`, `bedrooms`, filtros duros (códigos: jardín, cochera, terraza, ascensor,
amoblado, pileta), `near`, `order_code` y el **lugar pedido cuando no está en el
catálogo** (hoy queda en `lugar` y se pierde para la estadística). Son campos que P2 ya
tiene en la mano en ese punto. Solo las búsquedas posteriores al cambio los tendrán.

### 4.2 Un lugar donde se pueda consultar
La lista de Redis alcanza para la demo (miles de eventos: se lee entera y se agrega en
memoria), pero no para producción: no tiene índice, recorte ni respaldo. Destino: una
tabla propia de P2 en Postgres (`observability.events`: `id`, `created_at`,
`event_type`, `session_id`, `search_id`, `visitor_id`, `canal`, `payload jsonb`), con
escritura en segundo plano como hoy. Decisión pendiente de Germán: en la misma base de
P3 con schema propio, o en una base aparte. Mientras tanto, Redis.

### 4.3 El visitante
P1 ya tiene `visitor_id` (identificador anónimo del navegador). Falta mandarlo en las
llamadas de búsqueda (cabecera `X-Visitor-Id`) y que P2 lo guarde en `search_executed`.
Sin eso, "Visitatori" solo se puede aproximar por sesiones.

### 4.4 Agencias
"Contatti per agenzia" necesita saber de qué agencia es cada aviso. La vista
`p2_it.agencies` está vacía: P3 tiene que cargar las agencias de ERA (el aviso ya trae
teléfono y página de la agencia) y dejar `agency_id` en cada propiedad.

### 4.5 El endpoint
`GET /api/v1/stats/report?days=7|30|90` → un JSON con la forma exacta de `StatsReport`
(`src/lib/stats/types.ts` de P1; pasarlo a `app/models/schemas.py`). Protegido con la
`PORTAL_API_KEY` de siempre: lo llama el servidor de P1, nunca el navegador. Reglas:

- el período cierra ayer (día completo, hora de Italia) y trae también el período
  anterior de igual duración;
- el embudo cuenta cada búsqueda una vez por etapa (por `search_id`);
- "Domanda senza offerta": búsquedas con `total_matches` ≤ 2, agrupadas por comune,
  operación, tipo y tramo de presupuesto, ordenadas por cantidad;
- tráfico propio fuera: excluir los `visitor_id` de pruebas y a los robots (por
  `User-Agent`), o el tablero cuenta nuestras pruebas como demanda;
- tests contra la base y el Redis reales (regla de P2: sin datos simulados).

## 5. Cuidados

- **Datos personales.** Las consultas son texto libre: alguien puede escribir un
  nombre, un teléfono o una dirección. "Ultime ricerche" las muestra tal cual. Antes de
  conectar datos reales: filtrar lo que parezca teléfono o mail y definir cuánto tiempo
  se guardan.
- **Sin clave.** Hoy la página es abierta porque muestra datos de ejemplo en un sitio
  privado. Con datos reales en un dominio público conviene volver a decidirlo.
- **No mezclar.** Mientras la fuente sea el ejemplo, la franja "Dati dimostrativi" no
  se quita: es lo que evita que alguien tome esos números por tráfico real.

## 6. Pasos, en orden

1. P2 — criterio completo y `search_id` en `search_executed` (§4.1). Chico, y cuanto
   antes se haga, antes hay historia.
2. P1 — mandar `X-Visitor-Id` en las búsquedas; P2 lo guarda (§4.3).
3. P2 — endpoint `/stats/report` leyendo de Redis (§4.5), con sus tests.
4. P1 — `getStatsReport` pide a P2 cuando `STATS_SOURCE=p2`; si P2 no responde, cae al
   ejemplo con la franja puesta. Nada más cambia en la página.
5. Comparar una semana de números contra el log de P1 (`scripts/events-report.mjs`).
6. P3 — agencias de ERA (§4.4); después, "Contatti per agenzia" real.
7. P2 — pasar de Redis a Postgres (§4.2) antes de un uso sostenido.

## 7. Cómo probarla

`./scripts/levantar_italia.sh` y abrir `http://localhost:3010/statistiche` (o el link
del pie). No necesita P2 mientras use el ejemplo. Capturas en
`docs/italia/capturas/statistiche_*.png`.
