# Decisión 2026-09-14 — Cierre del QA de producción del 7/9 (T1–T7)

**Origen.** Pruebas de QA sobre producción (7/9/2026): entre 2 y 8 s sin nada
en pantalla en consultas complejas; lo interpretado no se veía completo;
"None"/"unknown" visibles; el contacto ocurría afuera y no se medía; sin
robots/sitemap ni páginas indexables; la vertical de lotes no existía en la
interfaz. P2 cerró su parte el 13/09 (`docs/API_CONTRACT_P2_2026-09-13.md`,
copia de `API_CONTRACT.md` de P2: filtros duros, aclaración no terminal,
vigencia/antigüedad, lotes, cercanía, 404 de sesión). Este documento registra
qué hizo P1 por cada tarea, qué se verificó y qué queda.

Regla que gobierna todo: **P1 no interpreta ni calcula**. Cada acción del
usuario se traduce a algo que P2 ya entiende (una frase de refinamiento en
la misma sesión, un `vertical_override`, un `offset`) y P2 devuelve el
estado nuevo. Lo que P2 no manda se pidió en
`docs/PEDIDO_P1_A_P2_2026-09-14.md`.

## T1 — Estado visible y streaming progresivo

- **Skeleton + "Buscando…" en el mismo tick del submit**, antes de cualquier
  red (`SearchSkeleton`, `data-state="searching"`). Medido con Playwright
  desde la home: < 500 ms incluida la navegación cliente.
- **Cards al llegar `cards`**, "Entendí: …" con los chips del summary en el
  mismo render; la narración se escribe debajo con cada `response_chunk`
  (volcado por frame). Nada espera `done`. `cards_rendered` lleva
  `t_first_cards` (submit → evento) y `t_first_paint` (submit → efecto tras
  pintar); la diferencia es lo que cuesta pintar (< 200 ms en las corridas).
- **4 s sin `cards`** → bloque "Está tardando más de lo normal" con la
  consulta y el botón **"Buscar con filtros"** → `POST /api/search/sync` →
  `POST /search` de P2 (sync, resumen template, misma sesión: el scroll y el
  mapa siguen por sesión). Evento `search_slow_wait` / `search_fallback_sync`.
- **Aclaración NO terminal** (`few_results`, `terminal: false`, después de
  `cards`): burbuja con el `message` y un botón por `options[]` con su
  conteo; el stream se sigue leyendo hasta `done` (cards + burbuja +
  narración juntas). El chip manda su `label` como `query` en la misma
  sesión (contrato §3.3b) y P2 responde `assumption_note: "Quité X"`. La
  copia dentro de `cards.clarification` se usa como respaldo. Verificado
  con P2 real: "casa de 5 dormitorios con pileta en trinidad hasta 50 mil
  dólares" → 0 resultados + "Quitar el lugar: 85; quitar pileta: 10".
- **Aclaración terminal durante un refinamiento** (visto 14/09: "ordenar por
  precio de menor a mayor" → `sin_senal` con resultados en pantalla): se
  muestra como nota y los resultados quedan; el criterio de la sesión sigue
  intacto (verificado: el turno siguiente lo conserva).
- **429** (rate limit de búsqueda de P2, 30/min por IP): espera de 2,5 s y un
  reintento antes de mostrar error. Las pruebas E2E se auto-limitan por lo
  mismo (2,2 s entre consultas seguidas).
- **Home optimista**: al mandar la consulta desde la home, "Buscando…" y el
  skeleton aparecen debajo del buscador ANTES de que llegue el render de
  `/buscar` (la navegación cliente pide el árbol al server): el primer
  estado visible no depende de la red.
- **Mobile sin mapa montado**: el mapa solo se monta con el overlay abierto
  (antes Leaflet se inicializaba oculto en cada búsqueda, compitiendo con el
  pintado de las cards).
- **404 de sesión** antes del stream (también en el fallback sync): sesión
  nueva y reintento sin mensaje; error humano solo si el reintento falla.
  En la paginación, un 404 rehace la corrida en sesión nueva. Evento
  `session_retried`.

## T2 — Chips de interpretación ("Entendí: …")

`summary.hard_filters` → un chip por filtro duro con la `label` de P2 tal
cual (`InterpretationChips`, lógica en `src/lib/interpretation.ts`).

| acción | cómo se resuelve (misma sesión) | verificado 14/09 |
|---|---|---|
| × quitar | "Quitar el tipo / la zona / el lugar / el presupuesto / los dormitorios / pileta / cochera / quincho / amoblado / apto crédito / la clase de lote…" | `merge_only`, nota "Quité …" |
| zona (selector del catálogo) | "en Rawson" (reemplaza) | ✓ |
| presupuesto (monto + moneda) | "hasta US$ 90.000" / "hasta $ 60.000.000" / "desde …" | ✓ |
| dormitorios (1+…5+) | "de 3 dormitorios" | ✓ |
| tipo | "casa" / "departamento" / "lote" | ✓ |
| clase de lote | "lote urbano" / "lote rural" | ✓ |
| nota "Asumí compra · cambiar a alquiler" | `vertical_override` en sesión | ✓ |
| orden (menú) | "ordenar por score" · "las más baratas primero" · "de mayor a menor precio" · "mucho tiempo publicada, para negociar precio" · "las que están más por debajo del precio de su zona" · "ordenadas por renta" · "cerca de X" | ✓ (las que no funcionan están en el pedido a P2) |

La operación (`vertical`) no se quita: se cambia por el selector o la nota.
`land_class: both` no es un filtro y no se muestra. Eventos: `chip_removed`,
`chip_edited`, `order_changed`, `assumption_flipped` (todos → P2 como
`refinement_applied`).

## T3 — Card honesta

- `clean()` (`src/lib/format.ts`) filtra "None", "null", "unknown", "nan",
  "undefined", "-" en todo string antes de mostrarlo; la ranura queda vacía.
  Los mocks ahora traen "None" a propósito y la prueba T3 recorre 20
  consultas × 10 cards buscando esos textos.
- Precio original + conversión entre paréntesis con `price_usd`/`price_ars`
  (nunca calculada; en ventas USD P2 no manda `price_ars` — pedido 4).
- **Dos fechas**: "publicado hace X" (`days_on_market`) y "actualizado hace
  Y" (`days_since_update`), en relativo humano (`fmtAgo`).
- Etiquetas sobre la foto: `age_flag` ("Aviso antiguo" / "Más de un año
  publicado"), `listing_status: stale` ("Sin actualizar"), `quality_tier ≥ 3`
  ("Datos completos"); tier ≤ 1 = clase `pcard--muted` (menos énfasis, sin
  palabras). `deal_rating` suma `verify_data` ("Verificar datos") y
  `outdated` ("Sin actualizar") con estilo propio y sus reasons.
- Score nunca solo: la primera razón (componente de mayor peso) visible al
  lado; el desplegable lista todos, incluidos `tope_*` (peso 0).
- Lotes: sello "Lote", m² de lote (o ha), frente × fondo, US$/m² de lote
  (`price_per_sqm_land`) o US$/ha, chips "Lote urbano/rural", "Con servicios:
  agua, luz" SOLO con `land_services === true`, "En loteo <nombre>", "Apto
  construcción", zonificación; sin campos de vivienda. `distance_km` → "a
  180 m" / "a 2,3 km" cuando el orden es cercanía.
- Zonas por catálogo (`santa_lucia` → "Santa Lucía"), en card y detalle.
- Mismas reglas en el detalle (`/propiedad/[id]`): `heating: "unknown"`,
  `condition: "unknown"`, lote, dos fechas, etiquetas, rating especial.

## T4 — Consultar

Botón principal **"Consultar"** en cada card y en el detalle
(`ContactButton`): WhatsApp de la inmobiliaria (`contact.whatsapp`) → WhatsApp
de FINDER (`CONTACT_WHATSAPP`, baja al cliente por `ContactConfigProvider`)
→ teléfono (`tel:`) → web → aviso original. Mensaje precargado: tipo y zona,
precio, referencia (`sources[0]`) y el link al detalle (`SITE_URL`). Evento
`contact_click` {property_id, rank/position, channel, target, from, score};
el sobre trae `session_id`, `vertical`, `query`. "Ver aviso original ↗" queda
como secundario, con `source_click` {rank}. En el detalle el `?v=` del link
lleva la vertical para que sus eventos también la tengan.

## T5 — Lotes

Selector **Alquilar · Comprar · Invertir · Lotes** (home y barra). Sesión
nueva: el server anexa ", lotes en venta" (sonda de extracción primero; el
texto manda). Con resultados en pantalla: `vertical_override: "lotes"` en la
misma sesión (verificado: conserva la zona). Re-sincronización por
`summary.vertical` ("Lotes en venta"). Sugerencias de la home: "lotes en
Santa Lucía", "terrenos hasta 30 mil dólares", "lotes en loteo con
servicios". Mapa: `layer="land"` → markers tierra (`price-marker--land`) por
`property_type: land`; el aviso del mapa suma "· lotes".

## T6 — SEO técnico

- `robots.txt` (`src/app/robots.ts`) y `sitemap.xml` (`src/app/sitemap.ts`),
  dinámicos para leer `SITE_URL` en runtime. `robots` excluye `/api/`,
  `/buscar` y `/interno/`.
- Páginas `/<tipo>-en-<operación>-en-<zona>-san-juan` (`src/app/[slug]`):
  tipos departamentos · casas · lotes (solo venta) · propiedades (todas);
  19 zonas → 133 candidatas. **Qué existe lo decide
  `src/data/seo-catalog.json`**, generado por `npm run seo:catalog`
  (`scripts/seo-catalog.mjs`) contra P2 a 25 consultas/min (rate limit
  30/min) con el mínimo de 5 avisos; lo demás es 404. Cada página pide sus
  12 cards y el conteo REAL a `/search/structured`, cacheados 6 h
  (`unstable_cache`, revalidación en segundo plano). Si P2 no responde (el
  rate limit de 30/min cuando un crawler pide decenas de landings frías, o
  una caída), la página igual da 200 con el conteo del catálogo y sin cards;
  después de cada deploy, `npm run seo:warm <url>` las pide a 25/min para
  dejar el cache lleno. Título con conteo, descripción, canonical, Open Graph,
  JSON-LD (CollectionPage + BreadcrumbList), buscador precargado que lleva
  a `/buscar` con mapa, enlaces a las mismas búsquedas en otras zonas y a
  otras búsquedas en la zona. Evento `landing_viewed`.
- Open Graph del detalle: título con precio y zona, imagen del aviso,
  `og:url`, `og:locale es_AR`, `siteName`, twitter card. `metadataBase` en el
  layout desde `SITE_URL`.

## T7 — Métricas

Eventos nuevos en `src/lib/track.ts`: `search_submitted` (antes de la red),
`cards_rendered` (t_first_cards / t_first_paint), `card_opened` (antes
`card_clicked`; a P2 sigue yendo como `card_clicked`), `contact_click`,
`source_click`, `chip_removed`, `chip_edited`, `order_changed`,
`assumption_flipped`, `clarification_choice` (antes
`clarification_chip_selected`), `search_slow_wait`, `search_fallback_sync`,
`session_retried`, `landing_viewed`. El **sobre** de todo evento lleva
`session_id`, `search_id`, `vertical` y `query` (se guardan como columnas en
el JSONL), y los de card llevan `rank`/`position`. Tablero **`/interno/embudo`**
(`src/lib/server/funnel.ts`): por día, búsquedas → cards → card abierta →
consulta (una vez por `search_id` por etapa), clicks de consulta y aviso
original, p50/p95 de `t_first_cards`, ceros, chips, aclaraciones, esperas
> 4 s, errores; y el mismo embudo por vertical. Acceso con `METRICS_TOKEN`
(`?token=`); sin la variable solo fuera de producción.

## Pruebas de interfaz (Playwright, en el repo)

`playwright.config.ts` + `tests/e2e/`: proyectos **mobile (380 px)** primero
y desktop; Chrome del sistema (`channel: "chrome"`); corren contra un P1 ya
levantado (`BASE_URL`), con P2 real o mocks. Una suite por tarea
(`t1-streaming` … `t7-metrics`) más `bloque-f` (paginación sin repetidas,
404 de sesión) y `bloque-g` (380 px sin desborde, botones con nombre, foco
visible, Consultar en el 100 %, sin textos prohibidos). `t1` mide el tiempo
al primer estado visible (< 500 ms) y la diferencia pintar − evento
(< 200 ms). `npm run test:e2e`.

**Nota sobre "Bloques F y G de la batería de QA".** La batería de P2
(`scripts/qa_finder.py`) define A–D y F (paginación y 404). No existe un
bloque G escrito en ningún repo; acá se interpretó G como la batería de
interfaz de P1 (mobile primero) y quedó como `tests/e2e/bloque-g.spec.ts`.
Si German tiene otra definición de G, se ajusta la suite.

## Verificación (14/09, esta máquina: build de producción de P1 + Docker local de P2 con datos reales)

- **Playwright** (`tests/e2e/`, mobile 380 px y desktop): **28/28 en vivo en
  los dos proyectos** (P2 real; el tablero se salta en modo producción sin
  `METRICS_TOKEN`) y **56/58 con mocks** (los 2 restantes son ese mismo
  salto). Corridas paralelas en la misma máquina inflan las mediciones de
  tiempo: correrlas de a una.
- **Latencia en 20 consultas variadas** (`npm run qa:latency`, informe en
  `tests/reports/latency_20260914.md`): primer contenido visible **8–10 ms**
  (20/20 < 500 ms; la home pinta el skeleton antes de navegar); primeras
  cards p50 194 ms desde el submit (el evento `cards` de P2 pasando por P1);
  pintar las cards después del evento **+12 a +37 ms** (19/19 < 200 ms).
  Dos casos que son de P2, no de P1: "casa con pileta y quincho para recibir
  gente en Santa Lucía" tardó 5,2 s hasta `cards` (camino LLM; P1 mostró la
  espera con "Buscar con filtros" a los 4 s, como corresponde), y la consulta
  20 recibió **429 en `POST /sessions`** (rate limit de sesiones de P2 al
  encadenar 20 búsquedas en 2 min): P1 ahora espera 2,5 s y reintenta una
  vez antes de mostrar el error, igual que con el 429 del stream.
- **T3 en 200 cards**: 20 consultas × hasta 20 cards contra P2 real, cero
  "None"/"null"/"unknown", cero cards sin "Consultar".
- **SEO**: `robots.txt` y `sitemap.xml` en 200; catálogo con **72 páginas**
  (≥ 5 avisos) sobre 133 combinaciones; las 72 responden 200 (con el rate
  limit de P2 la primera pasada fría se sirve con el conteo del catálogo).
- **Bloque F** (paginación sin repetidas, 404 de sesión) y **Bloque G**
  (380 px sin desborde, botones con nombre, foco visible, Consultar en todas,
  sin textos prohibidos): PASS en vivo y con mocks.

## Config nueva

| variable | dónde | qué |
|---|---|---|
| `SITE_URL` | server | origen público (canonical, OG, sitemap, link del mensaje de WhatsApp). Default `https://paradisofinder.com`. |
| `METRICS_TOKEN` | server | acceso a `/interno/embudo?token=…`. Sin definir: solo en desarrollo. |
| `CONTACT_WHATSAPP` | server (ya existía) | ahora también es el fallback de "Consultar". |

## Conflictos y supuestos

- El prompt original y `producto-p1.md` no contemplan lotes ni chips
  editables; ganan el contrato de P2 del 13/09 y este pedido.
- Las frases de refinamiento son vocabulario de P2 sondeado a mano; si P2
  cambia el extractor pueden dejar de funcionar → pedido 1 (acción
  estructurada).
- "Invertir" sigue sin vertical propia en P2 (compra por rentabilidad).
- El catálogo SEO refleja el stock del día en que se generó; la página
  muestra el conteo real al servirse. Regenerar semanalmente
  (`npm run seo:catalog` con `P2_BASE_URL`/`P2_API_KEY` de producción).
