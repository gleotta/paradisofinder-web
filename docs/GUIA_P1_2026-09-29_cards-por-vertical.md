# Guía de cambios en P1 — Cards por vertical — 2026-09-29

**Para: el equipo de P1 (este repo). Estado: Fase 0 ejecutada el 29/09 — qué se hizo y dónde se apartó de esta guía, en §8. P3 entregó el 30/09 — qué cambia para P1, en §9. P2 entregó el 30/09-01/10 — qué cambió P1 y qué verificó, en §10. German revisó el detalle el 02-03/10 — "Avisos similares" de 5 con foto y el hallazgo de las cards sin Zona, en §11. P3 y P2 entregaron el 31/10 la referencia de precio `price_ref` (un solo número, elegido por P3 entre lo que rodea al aviso y su zona) — qué cambió P1 el 01/11, en §13.**

Qué es este documento: **la guía de ejecución de P1**. Sale de las 21
decisiones cerradas con German el 29/09, que están registradas con su
evidencia en `docs/PLAN_2026-09-29_cards-por-vertical.md` (ese plan es el "por qué"; esta guía es el "qué hacer").
Los pedidos a las otras capas están aparte:
`docs/PEDIDO_P1_A_P2_2026-09-29.md` y `docs/PEDIDO_P1_A_P3_2026-09-29.md`.
Mockup aprobado, con avisos reales del P2 local: https://claude.ai/artifact/WhK4y4TBe6DamiTtTb6geA (privado, de German).

Regla que gobierna todo (spec §5, reglas duras): **P3 calcula, P2 expone, P1
muestra.** P1 no recalcula indicadores ni umbrales, no traduce textos de P3 y
trata `null` como "no informado" (nunca 0, nunca "malo").

---

## 0. Orden de ejecución y dependencias

**P1 se puede ejecutar primero y de manera independiente. Sí.** Con dos
condiciones que son parte del trabajo de P1:

1. Cada bloque nuevo de la card se renderiza **solo si el campo llega**; con
   `null` la ranura queda vacía (como ya hacen la señal y el score hoy). Así
   la card nueva sale a producción con lo que P2 manda hoy y va "encendiendo"
   bloques a medida que P2 y P3 entregan lo suyo.
2. Los mocks de P1 (`src/lib/p2/mocks.ts`) traen los campos nuevos desde el
   primer día, con los mismos avisos del mockup, para que la card completa se
   pueda ver y probar antes de que exista en P2.

**P2 y P3 no son independientes entre sí para los campos nuevos:** P3 crea
las columnas y P2 las lee (P2 lee `master` por SQL; una columna que no existe
rompe la consulta). Orden dentro de esos dos:

| Ítem | Depende de | Orden |
|---|---|---|
| P2 · comparables del detalle con la regla del pool, renta en pesos, `area_sqm` 0 → null, score de compra sin yield, rating de alquiler, vocabulario de textos propios | nada | **P2, cuando quiera** |
| P3 · tendencia del aviso, tipo y tendencia en la serie zonal, pool de rentas con banda, umbral del semáforo, vocabulario de motivos | nada | **P3, cuando quiera** |
| P2 · `price_trend` y compañía, `zone_ref` con tipo, tendencia y rentabilidad promedio | columnas de P3 | **P3 → P2** (o P2 lee las columnas como opcionales y sirve `null` hasta que existan) |
| P1 · pasar de mocks a datos vivos en los bloques nuevos | P2 en el stage | último, sin código: es el mismo render |

Con lo que ya llega hoy, P1 puede mostrar **sin esperar a nadie**: precio y
conversión, posición contra similares (porcentaje, percentil, cantidad),
fechas, chips, sello de clase de lote, m² o hectárea de lote, renta estimada
en dólares para el detalle, y el aviso de estimación. Lo que **espera a P2 y
P3**: flecha de tendencia, bloque Zona (m² por tipo, tendencia, rentabilidad
promedio), renta en pesos, "ver similares" con el pool real, y el color
"solo verde" con el umbral +10 % en venta.

---

---

## 1. Reglas comunes a las cuatro verticales

Valen para Alquilar, Comprar, Lotes e Invertir, en card y en mobile.

| # | Regla | Decisión |
|---|---|---|
| C1 | **Solo verde, nunca rojo.** Se pinta de verde lo bueno para el usuario: el bloque de posición cuando el aviso está por debajo de similares (`deal_rating === "green"`), la flecha "en baja", el bloque Zona cuando la zona sube. Todo lo demás va neutro (lila de la marca). Ningún rojo, amarillo ni índigo en la card. | 12 |
| C2 | **Un solo bloque con fondo verde por card:** el de posición. Zona también puede ir verde. Nada más se pinta. | 19, 21 |
| C3 | **Una sola comparación por card:** la de posición contra similares de P3. La Zona es referencia, sin porcentaje. | 20 |
| C4 | **Sin score visible** en ninguna vertical; sin pastillas de inversión. El dato sigue llegando y ordena la lista; se ve explicado en el detalle. | 19 |
| C5 | **Referencia siempre en dólares.** Mostrar en pesos es presentación (P2 convierte, nunca P1). | 8 |
| C6 | **Tendencia del aviso la marca P3** (en dólares, contra las últimas N corridas). P2 la pasa; P1 pone la flecha. | 9 |
| C7 | **Barra de percentil sin texto en el medio:** "más barato" y "más caro" en los extremos. | 13 |
| C8 | **"Ver similares"** como link en el bloque de posición → comparables del detalle. | 14 |
| C9 | **Lenguaje de usuario:** ninguna sigla ni nombre interno (P1, P2, P3, gap, cap, score, "referencia en dólares"). | 18 |
| C10 | **Aviso de estimación en toda card**, texto exacto: *Valores estimados a partir de avisos publicados, no de operaciones concretadas. Son orientativos.* | 18 |
| C11 | **Estado del inmueble** solo como chip en los extremos declarados: A estrenar, En construcción, A refaccionar. "Excelente"/"bueno" no se muestran. | 5 |
| C12 | **Tags del LLM** (`semantic_qualities`): máximo uno y solo si no hay chips duros. | 7 |
| C13 | **"Publicado hace X · margen para negociar"** solo cuando `days_on_market` supera 60 días en alquiler y 90 en venta y lotes (los mismos cortes de vigencia de P3). "Actualizado hace Y" siempre. | plan §2 |
| C14 | Se elimina el sello "Datos completos" (`quality_tier` es 0/1/2; tier 3 no existe). | 6 |

---

---

## 2. Cambios en P1

### 2.1 Modelo de datos (`src/lib/p2/types.ts`) — todo opcional y `null`-able

```ts
// Tendencia del aviso (P3 → P2, Fase 2). null = sin cambio registrado.
price_trend?: "up" | "down" | null;
previous_price?: number | null;        // nominal, en `currency` del aviso (para "antes $ 480.000")
previous_price_usd?: number | null;
price_change_pct?: number | null;      // en USD, con signo (−8.3)
price_changed_at?: string | null;      // ISO date

// Referencia de zona (P2, Fase 1; tipo y tendencia dependen de P3).
zone_ref?: {
  zone: string;                        // código ("santa_lucia")
  property_type: PropertyType | null;  // null hasta que P3 sume el tipo al grano
  bucket: string;                      // "1" | "2" | "3" | "4plus" | "lote_urbano" | "lote_rural" | "lote_rural_srv"
  median_price_per_sqm: number | null; // vivienda en venta y lotes urbanos (USD)
  median_price_per_hectare: number | null; // lotes rurales (USD)
  median_price: number | null;         // alquiler mensual (USD) — no se muestra en la card de alquiler (decisión 15)
  sample: number;                      // avisos en la celda
  fallback: "macro_zona" | "provincia" | null;
  trend: "up" | "down" | "flat" | null;
  trend_pct: number | null;
  trend_weeks: number | null;
  cap_pct: number | null;              // rentabilidad promedio de la zona (solo venta de vivienda)
  week: string;                        // lunes ISO de la celda
} | null;

// Referencia de precio (P3 31/10 → P2 contrato §4.8; §13): LA única que se muestra.
// Reemplaza a las medianas de `zone_ref`, que siguen llegando y ya no se muestran.
price_ref?: {
  level: "radius" | "zona" | "macro_zona" | "provincia";
  radius_km: number | null;            // 1 (radio 1) · 3 o 5 (radio 2, solo lotes urbanos); null en los niveles de zona
  place: string | null;                // "capital" · "gran_san_juan" / "periferia" / "alejado" · "san_juan"; null con radius
  value: number;                       // USD, por `unit`
  unit: "sqm" | "month" | "hectare";
  sample: number | null;
  bucket: string | null;               // "1" … "4plus" · "todos" (sin distinguir dormitorios) · "lote_*"
} | null;

// Alquiler: renta estimada en pesos (P2 convierte con la tasa de la corrida). Solo detalle.
estimated_monthly_rent_ars?: number | null;
```

Nada de lo existente cambia de nombre ni de tipo.

### 2.2 Qué muestra cada card, de arriba a abajo

`—` = no va. `hoy` = con datos que ya llegan. `P2`/`P3` = se enciende cuando llega el campo.

| Elemento | Alquilar | Comprar | Lotes | Invertir | Fuente | Llega |
|---|---|---|---|---|---|---|
| Foto con sello de clase | — | — | "Lote urbano" / "Lote rural" | — | `land_class` | hoy |
| Flecha de tendencia sobre la foto (izquierda) | sí | sí | sí | sí | `price_trend`, `price_change_pct`, `previous_price` | P3 → P2 |
| Precio | $ /mes + ≈ US$ | US$ + US$/m² | US$ + US$/m² o US$/ha | como Comprar | `price`, `price_usd`, `price_per_sqm`, `price_per_sqm_land`, `price_per_hectare` | hoy |
| Título "Tipo en Zona", datos, dirección | sí | sí, con cubierta y lote | sí, con m² de lote y medidas | como Comprar | `bedrooms`… `covered_area_sqm`, `area_sqm`, `frontage_m`, `depth_m` | hoy |
| **Bloque de posición** (porcentaje grande + "por debajo/encima de similares" + "N similares en Zona, D dorm." + barra de percentil + "ver similares") | sí | sí | sí, "lotes urbanos/rurales en Zona" | sí | `valuation_gap_pct`, `price_percentile`, `comparables_count`, `deal_rating` | hoy |
| **Bloque Zona** (nombre, "m² US$ X" y de dónde sale, flecha; verde si sube) | — | sí | sí | sí, más "Rentabilidad promedio de la zona: X % anual" | `price_ref` (valor) + `zone_ref` (tendencia, rentabilidad) | hoy (§13) |
| **Bloque "Esta propiedad · estimación"** (neutro): "Rentabilidad anual estimada X %", "Podría alquilarse a ≈ US$ Y/mes" + aclaración | — | — | — | sí | `gross_yield_pct`, `estimated_monthly_rent` | hoy (creíble tras P3 §4.3) |
| Fechas (C13) | sí | sí | sí | sí | `days_since_update`, `days_on_market` | hoy |
| Chips duros (orden por vertical, §2.3) | sí | sí | sí | sí | atributos, `condition`, lote | hoy |
| Aviso de estimación (C10) | sí | sí | sí | sí | — | hoy |
| Consultar · Ver aviso original · fuente | sí | sí | sí | sí | sin cambios | hoy |
| Score, Reventa/Renta, contexto de mercado, tags del LLM, "Datos completos", "Renta est." | — | — | — | — | siguen llegando | — |

### 2.3 Reglas de render (presentación; ningún cálculo de indicador)

**Bloque de posición.**
- Porcentaje grande = `Math.round(Math.abs(valuation_gap_pct))` + " %". Texto: gap > 0 → "por debajo de similares"; gap < 0 → "por encima de similares"; `|gap| < 10` → se agrega "· en línea con la zona" (umbral de presentación, no de indicador: solo cambia la frase).
- `valuation_gap_capped === true` → porcentaje "35 %+" y texto "por debajo · verificar el aviso" (o "por encima"). Subtítulo: "diferencia muy grande con similares: conviene verificar el aviso".
- Fondo verde **solo** con `deal_rating === "green"`; cualquier otro valor (incluido `verify_data`, `red`, `yellow`, `outdated`, `null`) → neutro. P1 no mira el porcentaje para decidir el color.
- Sin gap (`valuation_gap_pct == null`) → el bloque no se muestra (ranura vacía).
- Subtítulo: `${comparables_count} ${unidad} en ${zoneName(zone)}${bedrooms ? ", D dorm." : ""}`; unidad: "alquileres" / "casas" / "departamentos" / "lotes urbanos" / "lotes rurales con servicios" (lotes: según `land_class` y `land_services === true`).
- Barra: marcador en `left: ${price_percentile}%`; extremos "más barato" / "más caro"; sin texto central.
- "ver similares" → `detailHref(id) + "#comparables"` (la sección de comparables del detalle recibe `id="comparables"`).

**Flecha de tendencia.**
- `price_trend === "down"` → pastilla blanca, flecha y texto verde: "En baja N % · antes {precio anterior en la moneda del aviso}". N = `Math.round(Math.abs(price_change_pct))`.
- `price_trend === "up"` → pastilla blanca, flecha y texto en tinta de marca: "En alta N %". Sin "antes".
- `null` → nada.

**Bloque Zona** (Comprar, Lotes, Invertir).
- Título: "ZONA · {zoneName}". **Valor (desde el 31/10, §13): el de `price_ref`, único, y de dónde sale**: "m² US$ {value} a menos de {radius_km} km" (`level: radius`) · "… en la zona" (`zona`) · "… en el Gran San Juan" / "en la periferia" / "en los departamentos alejados" (`macro_zona`, según `place`) · "… en la provincia" (`provincia`). Solo `unit: sqm`: la hectárea rural no se muestra (§13) y el mes de alquiler no llega a la card (decisión 15). Invertir agrega "Rentabilidad promedio de la zona: {cap_pct} % anual" cuando `zone_ref.cap_pct != null`.
- Fondo verde con `zone_ref.trend === "up"`; neutro con `"flat"`, `"down"` o `null`. Pastilla: "En suba N %" / "En baja N %" / "Estable" (`trend_pct`); sin `trend` → sin pastilla.
- Solo en el detalle (`full`): "{sample} avisos · sin distinguir dormitorios" (`bucket: todos`) debajo del valor.
- Sin `price_ref` mostrable ni `cap_pct` → ranura vacía. Las medianas de `zone_ref` y la celda `zone_stats_ref` de lotes **no** se usan de respaldo; "(zona ampliada)" ya no existe.

**Bloque "Esta propiedad · estimación"** (Invertir): siempre neutro. "Rentabilidad anual estimada {gross_yield_pct} %" y "Podría alquilarse a ≈ US$ {estimated_monthly_rent}/mes". Aclaración fija: *Según alquileres similares publicados en la zona. Rentabilidad = un año de ese alquiler ÷ precio de este aviso.* Sin ninguno de los dos campos → ranura vacía.

**Chips** (orden fijo, máximo 3 visibles + "+N"): Comprar/Invertir: Apto crédito · A estrenar · En construcción · A refaccionar · Cochera · Patio · Quincho · Pileta · Barrio cerrado · Ascensor. Alquilar: Amoblado · A estrenar · Cochera · Patio · Barrio cerrado · Ascensor · Pileta · Quincho. Lotes: "Con servicios: agua, luz" (solo `land_services === true`) · "En loteo {nombre}" · Apto construcción · "Zonificación {x}" (los que ya existen).

**Fechas:** "Actualizado {fmtAgo(days_since_update)}" siempre; " · publicado {fmtAgo(days_on_market)} · margen para negociar" solo si supera el corte (C13), en tinta de aviso.

**Texto del aviso de estimación:** el de C10, 11 px, cursiva, sobre los botones.

### 2.4 Detalle (`src/app/propiedad/[id]/page.tsx`)

- Sección "Comparables en la zona" con `id="comparables"`; muestra todos los que manda P2 (hasta 30 tras el pedido §3.4).
- Se quita la tabla de "indicadores secundarios" (repite fechas y gap).
- Se quita el sello "Datos completos".
- "Lectura de FINDER": el score explicado, los tres semáforos con sus motivos y el contexto de mercado **se quedan acá** (es donde van lo que la card ya no muestra).
- Alquiler: "Similares en la zona: US$ X (≈ $ Y)" con `estimated_monthly_rent` y `estimated_monthly_rent_ars` cuando llegue.
- Invertir: mismos dos bloques que la card, con `zone_ref.cap_pct`.
- Aviso de estimación (C10) al pie de "Lectura de FINDER".

### 2.5 Mocks (`src/lib/p2/mocks.ts`)

- Sumar los campos de §2.1 a la fábrica de cards; incluir los avisos del mockup como casos fijos (tres por vertical alcanzan): al menos uno con `price_trend: "down"`, uno `"up"`, uno `null`; uno con `deal_rating: "green"`, uno `"yellow"`, uno `"verify_data"` con `valuation_gap_capped: true`; `zone_ref` con `trend: "up"` y con `"flat"`, uno con `fallback`; un lote urbano y uno rural; en Invertir uno con `cap_pct` y uno sin.
- Mantener los "None"/"unknown" a propósito para que la prueba de `clean()` siga vigente.

### 2.6 Pruebas (Playwright, `tests/e2e/`, mobile 380 px primero)

Una spec por vertical contra los mocks, y la misma batería en modo "contrato" contra el P2 local (`BASE_URL` con `P2_MODE=live`) donde solo se afirma presencia de campos.

`cards-alquilar.spec.ts` · `cards-comprar.spec.ts` · `cards-lotes.spec.ts` · `cards-invertir.spec.ts`, y en cada una:

1. **No aparece:** texto "Score", "Reventa", "Renta est.", "Datos completos", "P3", "P2", "cap", "gap", "None", "null", "unknown", "NaN".
2. **Aparece en toda card:** el aviso de estimación (C10), textual.
3. **Posición:** con `deal_rating: "green"` el bloque tiene la clase verde; con cualquier otro valor no la tiene; con `capped` dice "verificar el aviso"; la barra no tiene texto central; el link "ver similares" apunta a `/propiedad/<id>#comparables`.
4. **Tendencia:** `"down"` → pastilla con "En baja" y el precio anterior en la moneda del aviso; `"up"` → "En alta" sin "antes"; `null` → sin pastilla.
5. **Zona:** ausente en Alquilar; presente en Comprar, Lotes e Invertir cuando llega `price_ref` en m² (o `cap_pct` en Invertir), ausente si no; verde solo con `trend: "up"`; el valor dice de dónde sale ("a menos de N km" / "en la zona" / "en el Gran San Juan" / "en la provincia"); nunca "ha US$" (la hectárea rural no se muestra) ni "(zona ampliada)"; la base ("N avisos · sin distinguir dormitorios") solo en el detalle.
6. **Invertir:** bloque "Esta propiedad · estimación" con rentabilidad y alquiler, siempre neutro; "Rentabilidad promedio de la zona" solo con `cap_pct`.
7. **Lotes:** sello de clase; "US$ X/ha" en rural; chips "Con servicios" solo con `true`; nunca "sin servicios".
8. **Fechas:** "margen para negociar" aparece solo cuando `days_on_market` supera el corte de la vertical.
9. **Chips:** orden y máximo 3 + "+N"; "Excelente estado" no aparece; tags del LLM como mucho uno.
10. **Detalle:** `#comparables` existe; sin "indicadores secundarios"; con score explicado y semáforos.
11. **Mobile 380 px:** nada pegado a los bordes, sin scroll horizontal, altura uniforme de cards en la misma fila.

`npm run test:e2e` verde es la aceptación de la Fase 0. La batería en modo contrato contra el P2 del stage es la aceptación del cableado (Fase 1/2).

### 2.7 Archivos

`src/components/PropertyCard.tsx` (layout por vertical; recibe `vertical`), `src/components/signals.tsx` (bloque de posición, flecha, Zona, estimación), `src/lib/format.ts` (fmt de tendencia, zona, hectárea), `src/lib/labels.ts` (unidades, orden de chips), `src/lib/p2/types.ts`, `src/lib/p2/mocks.ts`, `src/app/propiedad/[id]/page.tsx`, `src/app/globals.css` (ranuras nuevas de alto fijo, quitar `.score` de la card), `tests/e2e/cards-*.spec.ts`, `docs/` (esta guía y el plan).

---

---

## 5. Matriz vertical × capa

| Vertical | P3 | P2 | P1 |
|---|---|---|---|
| Alquilar | 4.1, 4.5 | 3.1 (tendencia, renta en pesos), 3.3.1, 3.3.3, 3.3.4, 3.3.5 | §2 completa, sin Zona |
| Comprar | 4.1, 4.2, 4.4, 4.5 | 3.1, 3.2, 3.3.2, 3.3.3, 3.3.4, 3.3.5 | §2 completa, con Zona |
| Lotes | 4.2 (tendencia de la celda, n mín. rural) | 3.2 (tendencia en la celda que ya lee), 3.3.3 | §2 con sello de clase |
| Invertir | 4.3, 4.5 (además de lo de Comprar) | 3.2 (`cap_pct`) | §2 con los dos bloques |

---

---

## 6. Gate del video (consulta de venta)

Sobre el top 20 de la consulta elegida, en el stage, antes de grabar:

- ningún "None"/"unknown"/"NaN"; ninguna sigla interna; ningún "Score" ni "Renta est."; ningún rojo ni amarillo;
- aviso de estimación en toda card; bloque de posición con porcentaje y barra en toda card con gap;
- Zona visible en toda card con celda propia (requiere P2 3.2; con P3 4.2 muestra el tipo correcto);
- al menos una flecha "En baja" en el top 20 (requiere P3 4.1 → P2 3.1; si no llega, el video sale sin flechas y se regraba);
- detalle con comparables, mapa y "Consultar" funcionando.

Invertir **no** va al video hasta 4.3.

---

---

## 7. Fuera de alcance

Todo lo listado en `docs/BACKLOG.md` (B1 a B8).

---

---

## 8. Registro de ejecución — Fase 0 (2026-09-29)

Se ejecutó la §2 completa en P1. La card sale con lo que P2 manda hoy (precio,
posición, fechas, chips, clase de lote, aviso de estimación) y enciende sola
la flecha de tendencia, el bloque Zona y la renta en pesos cuando P2 y P3
entreguen sus campos: es el mismo render.

### 8.1 Dónde quedó cada cosa

| Qué | Dónde |
|---|---|
| Campos nuevos (§2.1), `ZoneRef` | `src/lib/p2/types.ts` |
| Orden de chips por vertical, unidades del bloque de posición, texto del aviso de estimación, cortes de "margen para negociar" | `src/lib/labels.ts` (`CHIP_ORDER`, `POSITION_UNIT`, `ESTIMATE_NOTICE`, `NEGOTIATION_DAYS`) |
| Textos de cada bloque (§2.3); elección del layout | `src/lib/format.ts` (`positionInfo`, `priceTrendInfo`, `zoneRefInfo`, `estimateInfo`, `cardDates`, `cardChips`, `cardVertical`) |
| Bloques | `src/components/signals.tsx` (`PositionBlock`, `TrendPill`, `ZoneBlock`, `EstimateBlock`, `EstimateNotice`) |
| Card | `src/components/PropertyCard.tsx` |
| Detalle (§2.4) | `src/app/propiedad/[id]/page.tsx` |
| Casos fijos del mockup y campos nuevos (§2.5) | `src/lib/p2/mocks.ts` (`FIXTURES`: `sj-mkr0..2`, `sj-mks0..2`, `sj-mki0..2`, `sj-mkl0..2`) |
| Pruebas (§2.6) | `tests/e2e/cards-{alquilar,comprar,lotes,invertir}.spec.ts` sobre la batería común `tests/e2e/cards-vertical.ts` |
| Regla de producto | `CLAUDE.md`, regla 13 |

Salieron de la card y del código: `ScoreDetails`, `RatingChip`, las ranuras
vacías de señal y score, y sus estilos. `SignalBadge` sigue en el detalle.

### 8.2 Dónde se apartó de la guía, y por qué

1. **Alto de los bloques: automático, no ranuras fijas.** §2.7 pedía "ranuras
   nuevas de alto fijo"; el plan registra "alto automático, sin tamaño fijo"
   (German, 29/09) y el mockup aprobado está hecho así. Con ranuras fijas, toda
   card de Comprar tendría un hueco vacío del alto del bloque Zona hasta que P2
   mande `zone_ref`, y en mobile (una columna) ese hueco es scroll perdido. Se
   resolvió así: el bloque existe solo si el dato llega, y las cards de una
   misma fila se emparejan estirándose en la grilla, con el aviso de
   estimación, las acciones y la procedencia anclados abajo. La prueba de
   layout afirma que las cards de una fila miden lo mismo.
2. **Frase "en línea con la zona".** §2.3 dice que con `|gap| < 10` "se agrega"
   la frase; quedó como en el mockup, "por debajo · en línea con la zona" (sin
   "de similares"), que entra en una línea junto al porcentaje.
3. **Link "ver similares" con el contexto de la búsqueda.** El `href` es
   `/propiedad/<id>?s=…&r=…&v=…#comparables`: sin `?v=` el detalle no sabría
   que la vertical es Invertir (§2.4 pide ahí los dos bloques) y sin `?s=&r=`
   se pierde la analítica. El click se mide como `card_opened` con
   `target: "similars"`.
4. **Etiquetas de antigüedad sobre la foto: neutras.** "Aviso antiguo", "Más
   de un año publicado" y "Sin actualizar" iban sobre fondo amarillo; C1
   prohíbe el amarillo en la card. Siguen visibles (contrato 13/09 §4.2), en
   blanco con tinta de marca. En el detalle conservan su color.
5. **La ficha puede ocupar dos líneas.** "5 amb. · 3 dorm. · 3 baños · 250 m²
   cub. · 502 m² lote" no entra en una línea a 380 px y se cortaba justo el
   lote. Las fechas con "margen para negociar" también pueden ocupar dos.
6. **Bloque Zona en el detalle de Comprar y Lotes**, además del de Invertir
   que pide §2.4: la card muestra la referencia de zona y el detalle no puede
   mostrar menos que la card.
7. **`#comparables` existe siempre.** Si P2 no manda comparables, la sección
   queda con una línea que lo dice, para que "ver similares" no lleve a un
   ancla que no está.
8. **Indicador del detalle "Precio frente a similares".** Mostraba el gap con
   signo ("+15 %"), que se lee como "más caro" cuando significa lo contrario.
   Ahora usa la misma frase de la card ("15 % por debajo de similares").
9. **`area_sqm: 0`.** Mientras P2 no lo pase a `null` (pedido §3.3.3), P1 no
   muestra una superficie de 0 m².
10. **El bloque Zona de Lotes ya se enciende hoy.** §0 lo daba como
    dependiente de P2, pero el contrato del 13/09 ya manda en cada lote la
    celda que usó para el gap (`zone_stats_ref`: m² o hectárea de la zona,
    muestra, `fallback`). Sin `zone_ref`, la card de Lotes arma el bloque con
    esa celda: mismo valor, sin pastilla de tendencia, siempre neutro. Cuando
    llegue `zone_ref`, manda `zone_ref`. En vivienda no hay equivalente: sigue
    esperando a P2.

### 8.3 Hallazgo: los mocks tenían el gap con el signo al revés

En `src/lib/p2/mocks.ts` y en `mocks/search-text-response.json` un gap
negativo era "barato". En el P2 real es al revés: `valuation_gap_pct` > 0 = el
aviso está por DEBAJO de sus similares (es lo que dice §2.3 y lo que muestra
el mockup, hecho con avisos reales). Se corrigió en los dos archivos, y el
semáforo de los mocks ahora es coherente con el número. También se corrigió
que los mocks daban coordenadas a los avisos tier 1 (en P2 real no las tienen).

### 8.4 Bug destapado por el modo contrato: Invertir volvía a Comprar

Con P2 real, elegir **Invertir** buscaba bien (compra ordenada por
rentabilidad) y, al llegar los resultados, el selector se re-sincronizaba a
**Comprar**. `verticalFromSummary()` comparaba la etiqueta del orden con
`"rentabilidad"` exacto y P2 hoy manda "Rentabilidad (mayor a menor)". No se
notaba porque las cards eran iguales en las dos verticales; con la card por
vertical, Invertir habría salido sin su bloque de estimación. Ahora decide por
`summary.order_code === "gross_yield_desc"` (el código es contrato, la etiqueta
es texto de P2) y los mocks mandan la etiqueta real.

### 8.5 Resultado de las pruebas (29/09)

| Corrida | Contra | Resultado |
|---|---|---|
| `cards-*.spec.ts`, mobile y desktop, modo contrato | P1 (`next start`) → P2 local `:8000`, DB de la corrida 2026-09-21 | 72 pasan · 0 fallan · 2 omitidas (renta en pesos: el campo todavía no llega) |
| `npm run test:e2e` completo, mobile y desktop | P1 (`next start`) con `P2_MODE=mock` | ver el cierre de la sesión de trabajo |

Contra P2 real las búsquedas se espacian 5 s (`pace()`): el rate limit es de
30 por minuto y cada búsqueda con vertical son dos llamadas.

### 8.6 Lo que mostraron los datos reales (para P2 y P3)

1. **Rentabilidades imposibles al tope de Invertir.** "casas en capital" en
   Invertir abre con 56 %, 54 % y 45 % de rentabilidad anual estimada, todas
   con "35 %+ · verificar el aviso". Es el problema del pedido a P3 §4.3 (pool
   de rentas sin banda de superficie), agravado porque el orden por
   rentabilidad pone primero justo las peores estimaciones. La card lo muestra
   tal cual llega. Confirma la decisión: Invertir no va al video hasta §4.3.
2. **Lotes: el número y el semáforo no dicen lo mismo.** Lotes urbanos de
   Pocito llegan con `valuation_gap_pct` 34,9 y `deal_rating: yellow`, motivo
   "Precio en línea con la zona". La card dice "35 % por debajo de similares"
   en neutro, que es lo que mandan los dos campos. Hay que definir del lado de
   P2/P3 cuál de los dos manda en lotes.
3. **Posición con 4 comparables.** Un lote rural llega con gap y
   `comparables_count: 4` (motivo "estimación débil"). En vivienda el gap exige
   5; en lotes no. La card muestra "4 lotes rurales en Pocito".
4. **Tags del LLM que parecen estado.** Llega "excelente" como
   `semantic_qualities` de un lote sin chips duros, y por C12 se muestra. No es
   el estado del inmueble (C11), pero se lee parecido: conviene que P3 lo
   filtre en origen.

### 8.7 Pendiente

- Batería en modo contrato contra el P2 del **stage** cuando P2 entregue los
  campos nuevos: es la aceptación del cableado (Fase 1/2).
- Copiar `PEDIDO_P1_A_P2_2026-09-29.md` a su repo, con las observaciones de
  §8.6. (El de P3 ya se copió y ya se respondió: ver §9.)
- Gate del video (§6), en el stage.

---

## 9. Entrega de P3 (30/09)

P3 entregó los seis puntos de su pedido. Los publicó en Railway el 30/09 a las
02:40 y los nombres de columnas son definitivos:
`docs/RESPUESTA_P3_A_P1_2026-09-29.md`. La respuesta de P1 a sus siete
preguntas está en `docs/RESPUESTA_P1_A_P3_2026-09-30.md`. Es un **borrador**:
las respuestas 1 a 3 y el pedido nuevo de su §B esperan a German. En resumen,
P1 propone:

- no publicar la rentabilidad de una venta con diferencia mayor a +35 %;
- ventana de 3 corridas;
- tope de variación en 40 %;
- tendencia zonal solo con muestra de 15 o más y 3 semanas o más.

**P1 no cambia código.** P2 todavía no expone nada de esto, y cuando lo haga es
el mismo render (§8.1). Se verificó que la columna `tipo` nueva en
`zone_stats` no afecta a lo que P2 lee hoy, que son solo las celdas de lote,
con `tipo IS NULL`. Lo que P1 va a ver cuando P2 pase los campos:

1. **Invertir casi sin rentabilidad.** Queda en el 24 % de las casas y en el
   33 % de los departamentos en venta. Fuera de Capital, Rivadavia, Santa
   Lucía y Rawson no hay ninguna. La card omite el bloque "Esta propiedad ·
   estimación" (regla 13 h) y el orden por rentabilidad deja los `null` al
   final (`NULLS LAST` en P2). Pero "invertir en Pocito" va a salir sin un
   solo dato de rentabilidad, ordenado por algo que ningún aviso tiene. **Falta
   que German decida qué muestra Invertir en esas zonas.**
2. **Flechas "En alta" en alquileres.** Son 38 y la suba es real en dólares
   (ver la errata de la decisión 8 del plan). En la card van en color neutro.
3. **La tendencia zonal por tipo tarda.** Las celdas `casa` y `departamento`
   nacieron esta semana: el bloque Zona de vivienda sale con el valor y sin
   pastilla hasta que la celda tenga tendencia. Si se acepta el pedido §B, eso
   ocurre desde su tercera semana. P2 no completa con la tendencia de `todos`.
4. **Más verdes en venta** (673 → 780) por el umbral de +10 %.

**Pendiente de P1: el vocabulario propio del detalle.** "Indicadores de
mercado" sigue diciendo "Percentil de precio en su zona · P28", "Comparables
considerados" y "Renta bruta anual estimada". La sección se llama "Comparables
en la zona" y el puntaje, "Opportunity Score". Es la jerga que se les pidió
sacar a P2 y P3. Con los textos nuevos de P3, el mismo detalle dice "Más
barato que el 72 % de los avisos similares" en una fila y "P28" en otra.

---

## 10. Entrega de P2 (30/09-01/10) y lo que P1 cambió

P2 entregó los cinco puntos del pedido (`docs/RESPUESTA_P2_A_P1_2026-09-30.md`,
actualizada el 01/10 con las reglas nuevas de comparables de P3). Está
commiteado y el Docker local corre la versión del 01/10; el stage de Railway,
a confirmar por P2. La respuesta de P1 a sus cuatro preguntas abiertas
(`docs/RESPUESTA_P1_A_P2_2026-10-01.md`) **la aprobó German el 01/10** tal
como está escrita, igual que la respuesta a P3 del 30/09; las dos se copiaron
a sus repos ese día.

### 10.1 Los campos ya llegan y la card los enciende sin más código

Verificado el 01/10 contra `localhost:8000` (`/api/v1`, versión del 01/10):
`zone_ref` en venta, alquiler y lotes (con `fallback_ref` y `trend_weeks` 2),
`price_trend` y compañía en alquileres de Capital, `estimated_monthly_rent_ars`
a la centena, `comparables_pool` en el detalle y la lista de alquiler sin tope
(75 similares → 37 a la vista). Lo que la §0 llamaba "pasar de mocks a datos
vivos" ocurrió sin tocar el render: era el mismo. Diferencias de tipo contra lo
que P1 había escrito en §2.1: `zone_ref.sample` puede ser null, `zone_ref`
suma `fallback_ref` (nombre del nivel, p.ej. `gran_san_juan`), y la moneda de
un comparable admite null en el Swagger.

### 10.2 Lo que P1 cambió por los cuatro avisos de P2

1. **`area_sqm` null (antes 0).** Ya se omitía; los mocks traen null en una de
   cada 17 viviendas para que la prueba lo cubra.
2. **Comparables = conjunto entero + `comparables_pool`.** La sección del
   detalle se llama **"Avisos similares"** (`#comparables` sigue). Cabecera
   (`comparablesPoolInfo`): "Comparado con 80 alquileres similares en Capital,
   3 dorm. · 30 a la vista · los otros 50 no se muestran porque no publican
   foto o superficie"; con `scope: adjacent_zones` dice "y zonas vecinas", con
   `macro_zone` "y alrededores". Cada similar (`miniCardMeta`): tipo, zona solo
   si no es la del aviso, dormitorios, cubierta o m² de lote, US$/m² de P2.
   **El recorte es de P1:** `ComparablesGrid` muestra 30 y "Mostrar los N
   restantes" despliega el resto (evento `comparables_expanded`); en venta y
   lotes el botón nunca aparece.
3. **"verificar el aviso" se decide por `deal_rating === "verify_data"`**, no
   por `valuation_gap_capped` (`positionInfo`). El "35 %+" sigue saliendo del
   flag. Un alquiler más de 35 % por encima llega `capped` con gap −35 y
   `red`: la card dice "35 %+ por encima de similares", en neutro (C1). Esto
   corrige la §2.3 de esta guía, que ataba la frase a `capped`.
4. **Textos nuevos de P2.** Ninguna prueba los comparaba. Los mocks pasaron a
   los textos vigentes (componentes `gap_valuacion`, `price_position` nuevo,
   tope `tope_gap_fuera_de_rango`; motivo `sobreprecio`; orden "Más baratas
   entre avisos similares").

### 10.3 Vocabulario propio del detalle (la deuda de §9)

"Percentil de precio en su zona · P28" → "Posición entre similares: más barato
que el 72 % de los similares" (`percentilePhrase`: la misma lectura que el
componente `price_position` de P2, presentación del mismo número); "Comparables
considerados" → "Avisos similares comparados"; "Renta bruta anual estimada" →
"Rentabilidad anual estimada"; "Opportunity Score" → "puntaje de oportunidad";
"Comparables en la zona" → "Avisos similares". La prueba del detalle afirma que
nada de eso vuelve. Queda visible el "Score máximo N" de los topes, que es
texto de P2 (pedido en la respuesta, sin urgencia).

### 10.4 Mocks

`sj-mkr0` tiene 80 similares y el detalle lista 42 (`comparables_pool`
80/42/38); `sj-mkr6` es el alquiler caro (`red`, acotado, "sobreprecio");
el detalle de cualquier card arma el conjunto por `comparables_count` (hasta 30,
o el 53 % en alquiler por encima de 30), ordenado por precio en USD, y
`scope: adjacent_zones` cuando el conjunto tiene menos de 5.

### 10.5 Resultado de las pruebas (01/10)

`npm run lint`, `tsc --noEmit` y `npm run build` limpios. Playwright, proyecto
`mobile` (380 px), contra `next start` del build:

| Corrida | Contra | Resultado |
|---|---|---|
| `cards-{alquilar,comprar,invertir,lotes}.spec.ts` | P1 `:3001` con `P2_MODE=mock` | 37 pasan · 0 fallan (una corrida previa tuvo 1 timeout de búsqueda en "chips" de Alquilar mientras t3 corría en paralelo contra el mismo server; sola, pasa) |
| `cards-*.spec.ts`, modo contrato | P1 `:3002` con `P2_MODE=live` → P2 Docker local `:8000` (imagen del 30/09, base de P3 del 29/09) | 36 pasan · 0 fallan · 1 omitida en la primera corrida (renta en pesos; la prueba pasó a correr también en vivo y pasa: "US$ 485 (≈ $ 750.000)") |
| `t3-card`, `t4-consultar`, `detalle-mapa`, `compartir-og-sitemap` | P1 `:3001` con `P2_MODE=mock` | 11 pasan |
| **`cards-*.spec.ts`, modo contrato, PRODUCCIÓN** (aceptación del cableado, §8.7) | `https://paradisofinder.com` (P1 `0ba1a2d`) → P2 de Railway por la red privada, versión del 01/10 | **37 pasan · 0 fallan** (4,6 min) |

**Gate del video (§6), medido en producción el 01/10 sobre el top 20 de dos
consultas de venta, en Comprar:**

| Criterio | "casas en venta en capital" | "casas en venta hasta 100 mil dólares" |
|---|---|---|
| Sin "None"/"unknown"/"NaN", sin siglas, sin "Score"/"Renta est." | cumple (0 de 20) | cumple (0 de 20) |
| Ningún rojo ni amarillo (fondos de bloques y etiquetas) | cumple | cumple |
| Aviso de estimación en toda card | 20 de 20 | 20 de 20 |
| Bloque de posición en toda card con gap | 20 de 20 (todas verdes: el orden por oportunidad pone primero las de mayor descuento) | 20 de 20 |
| Zona visible en toda card con celda propia | 20 de 20, todas propias | 20 de 20, 19 propias y 1 "(zona ampliada)"; 2 en suba (verde) |
| Al menos una flecha "En baja" en el top 20 | 2 | 1 |
| Detalle: similares, mapa y "Consultar" | 30 similares, mapa, Consultar | 29 similares de 30 ("el otro no se muestra…"), mapa, Consultar |

**El gate pasa: se puede grabar.** Invertir sigue fuera del video hasta que P3
aplique la regla de rentabilidad null con diferencia mayor a +35 % (respuesta
aprobada el 01/10).
Visto a ojo contra P2 real (versión del 01/10): el alquiler `b69a7ce1…` (75
similares, 37 a la vista) dice "Comparado con 75 alquileres similares en
Capital, 3 dorm. · 37 a la vista · los otros 38 no se muestran porque no
publican foto o superficie", lista 30 y "Mostrar los 7 restantes" despliega los
37; el alquiler `97951e69…` (80 similares) lista exactamente 30 porque los otros
50 son tier 0; el lote rural `c79bf4ee…` dice "Comparado con 4 lotes rurales
similares en Pocito" con sus 4.

### 10.6 Pendiente

- Hecho el 01/10: P1 (`0ba1a2d`) y P2 (versión del 01/10) en producción;
  batería en modo contrato contra producción, 37/37; gate del video, pasa.
- §8.6 (lotes: gap 34,7 con `yellow` y 4 comparables): abierto para P2/P3,
  anotado en la respuesta a P2 (German aprobó dejarlo así).
- P3: aplicar la §B y la rentabilidad null con gap > +35 % (aprobadas el
  01/10); hasta entonces Invertir no va al video.
- Grabar el video (§6) con una de las dos consultas medidas.
- Gate del video (§6), en el stage.

---

## 11. "Avisos similares" de 5, con foto, y las cards sin Zona (02-03/10)

German vio la sección con 29 fichas en cuadrícula y la rechazó: "no sé de
dónde salió, se ve feo; como mucho 10, y con miniatura de la foto". Pidió
saber de dónde salen los 30, dónde tocar, y por qué hay cards sin el bloque
Zona. Aprobó el mockup (https://claude.ai/artifact/FKzocz41C9GX55MsUqnmPG),
propuesta A, **con 5**.

### 11.1 De dónde salen los 30, y por qué el recorte es de P1

- **P3** arma el conjunto con el que mide el precio (`_select_comparables`):
  misma zona (vecinas si hay menos de 3), misma categoría, cubierta ±30 %, y
  en departamentos el mismo tramo de dormitorios; si quedan más de 30 se queda
  con las 30 de superficie más parecida (`COMPARABLE_MAX`). Es la muestra de
  la mediana, el porcentaje y el percentil: no se toca por una razón de
  pantalla.
- **P2** reconstruye ese conjunto exacto y lista todos los que se pueden
  mostrar, por precio (01/10). Dejó por escrito que el recorte visual es de
  P1, y la cabecera "comparado con 30" necesita el conjunto entero.
- **"Podrían interesarte"** (fin del listado) es otra cosa: las elige P2 por
  parecido semántico con la **consulta**, no con una propiedad, y solo cuando
  el listado se agota. No entran al detalle y no se mezclan.

### 11.2 Lo que P1 cambió

| Qué | Dónde |
|---|---|
| A la vista, las **5 de superficie más parecida** (el criterio de P3), por precio, con la propiedad intercalada en su lugar ("Esta casa"); "Ver los N similares" despliega el conjunto entero en las mismas filas (`comparables_expanded`) | `pickSimilars`, `selfIndexByPrice` en `src/lib/format.ts`; `SIMILARS_VISIBLE`, `SELF_LABEL` en `src/lib/labels.ts`; `similarRows()` en `src/app/propiedad/[id]/page.tsx`; `SimilarsSection` en `src/components/detail.tsx` |
| **Tira de precios**: los precios del conjunto entero sobre una línea, la propiedad marcada; pasar por un punto resalta su fila | `priceStrip` en `format.ts`; `.pstrip*` en `globals.css` |
| **Filas con miniatura**: precio, US$/m², conversión, ficha ("Casa · 3 dorm. · 100 m² cub. · 341 m² lote") | `miniCardMeta` (con el lote en casas), `miniCardSqm` |
| **Miniatura sin depender de P2**: `/og/propiedad/<id>.t.jpg` (352×264, ~12 KB), misma caché que la og:image; cuando P2 mande `photo_url` en el similar se usa directa | `src/app/og/propiedad/[file]/route.ts` |
| **", 3 dorm." solo cuando el conjunto se arma por dormitorios** (alquiler; departamentos en venta por tramo). En casas en venta y lotes era falso: entre las 30 casas similares de una de 3 dormitorios hay casas de 1 y 2 | `poolByBedrooms`, `poolWhere` en `format.ts` (card y cabecera del detalle) |
| Pedido a P2: `photo_url` en `MiniCard` y `zone_ref` para vivienda sin dormitorios | `docs/PEDIDO_P1_A_P2_2026-10-03.md` (copiado al repo de P2) |

Se fue `ComparablesGrid` (la cuadrícula). Las pruebas del detalle afirman 5
filas como máximo, la fila propia, la tira, el orden por precio, miniaturas
con la ruta propia y el botón "Ver los N similares" → N filas.

### 11.3 Por qué hay cards sin el bloque Zona (medido el 03/10)

Dos causas, ninguna un bug de P1:

1. **Alquilar no muestra Zona por decisión** (decisión 15 del plan, 29/09):
   la celda de alquiler trae `median_price` (alquiler mensual típico) y P1
   la deja para el detalle ("Similares en la zona: US$ 453 (≈ $ 650.000)").
   Toda card de Alquilar sale sin el bloque. **Revisar con German:** hoy
   `zone_ref.median_price` llega en el 85 % de los alquileres y podría ir en
   la card como "Alquiler típico en Capital, 2 dorm.: US$ 453/mes".
2. **Vivienda sin dormitorios informados → `zone_ref: null`.** La celda de P3
   es por tipo y tramo de dormitorios; sin dormitorios P2 no sirve ninguna,
   porque el pedido de P1 del 29/09 decía "sin dormitorios → null, no todos"
   (error de P1). Medido sobre el Docker local: 11 % de los departamentos en
   venta de Capital, 7 % de los de alquiler; en toda la base 32 de 708
   departamentos en venta, 36 de 356 en alquiler, 9 de 1.748 casas. Casas en
   venta, lotes y las consultas del video: 0 %. P3 publica la celda `todos`
   del tipo (13 a 19 zonas) y una `sin_dato` (5 zonas): el pedido del 03/10
   le pide a P2 servir `todos` con `bucket: "todos"`. P1 no cambia: el bloque
   no muestra el bucket.

Un caso suelto: un alquiler con `bedrooms: 0` sin celda (está en el pedido).

### 11.4 Por qué hay cards sin el bloque de posición (lo que German preguntaba)

La pregunta de German era por el **bloque de posición** (el porcentaje contra
similares), no por Zona. P1 lo muestra siempre que `valuation_gap_pct`
llega; cuando falta, hasta hoy quedaba un hueco. Medido el 03/10 sobre la base
local (vivienda activa, tier ≥ 1):

| Causa | Cuántas | Dónde se arregla |
|---|---|---|
| **Alquiler sin cubierta con gap calculado por P3** que P2 descarta (`gap_ok` exige cubierta también en alquiler, donde el conjunto es por dormitorios) | 97 de 543 alquileres (18 %) | P2 (`PEDIDO_P1_A_P2_2026-10-03.md` §3) |
| **Gap calculado con 3 o 4 comparables** (P3 calcula desde 3; P2 exige 5) | 54 ventas, 14 alquileres | P3 amplía la zona hasta 5 (`PEDIDO_P1_A_P3_2026-10-03.md` §4); alternativa P2 acepta 3 |
| **Departamentos sin cubierta con total** | 171 de 708 (24 %) | P3: usar la total como base (§1) |
| **Casas sin cubierta** | 225 de 1.748 (13 %) | decisión de German: nada, o comparación por dormitorios marcada (§3) |
| **Vivienda con cubierta sin dormitorios** | 26 departamentos en venta y parte de 55 alquileres | P3: conjunto por banda sin tramo (§2) |
| Conjunto de 1 o 2 avisos | 15 ventas | se queda así |

En las consultas ordenadas por oportunidad (las del video) el top 100 no tiene
ninguna sin gap, porque el orden premia el descuento; en las consultas por
zona el agujero va del 3 % (casas en Capital) al 29 % (casas en Rawson) y al
34 % (departamentos en Capital).

**Lo que P1 hizo:** la card ya no deja el hueco. Sin gap muestra el motivo
de P2/P3 tal cual (`positionMissingReason`: "Sin superficie cubierta: no se
puede comparar el precio por m²", "Hay menos de 5 avisos similares en la
zona: no alcanza para comparar el precio"), en neutro, en el lugar del
bloque. Verificado contra P2 real: en "casas en venta en Caucete", 9 de las 10
primeras cards salen con el motivo ("Hay menos de 5 avisos similares en la
zona…" en 8, "Sin superficie cubierta…" en 1) en lugar del hueco.

**Regla nueva de German (03/10): prohibido probar con mocks, para siempre.**
Toda verificación de acá en adelante corre contra P2 real (Docker local o
producción). Las aserciones de casos fijos de la batería no se corren más.

### 11.5 Resultado de las pruebas (03/10)

`tsc`, `eslint` y `npm run build` limpios. Playwright, proyecto `mobile`, contra
`next start` del build final y **P2 real** (Docker local, versión del 01/10):

| Corrida | Resultado |
|---|---|
| `cards-{alquilar,comprar,invertir,lotes}.spec.ts`, modo contrato, build final (similares de 5, motivo sin gap, ", dorm." corregido) | 37 pasan · 0 fallan (4,1 min) |

Visto a ojo con datos reales: Casa en Rawson `45cd6b1f…` ("Comparado con 30
casas similares en Rawson · 29 a la vista · el otro no se muestra porque no
publica foto o superficie"; a la vista US$ 35.000 · 45.000 · **47.000 (Esta
casa)** · 55.000 · 58.000 · 59.000, las 5 de 100 m² cubiertos; miniaturas de
352×264 desde la ruta propia; "Ver los 29 similares" despliega las 29 y vuelve
con "Ver solo los 5 más parecidos"); y "casas en venta en Caucete", donde 9 de
las 10 primeras cards muestran el motivo de P2 en lugar del hueco.

### 11.6 Deploy local y gate (04/10)

Commit `4521dd8` en `develop`: el CD local pasó las guardias (lint, tsc,
build), rebuildeó el Docker del :3000 y el smoke contra el P2 real dio OK
("casas en rawson": 204 coincidencias en los dos lados). El gate del video
(`scripts/video-gate.mjs`) se adaptó al detalle nuevo: cuenta las filas
`similar-row` (1 a 5), exige la foto cargada en todas, una `similar-self`,
la tira de precios, mapa y Consultar. Contra el :3000 con "casas en venta
hasta 100 mil dólares": las 8 comprobaciones pasan; detalle de la #1 (Rawson)
= 5 similares, 5 de 5 fotos, "Ver los 29 similares". **El video se graba
contra producción con el guion como texto**: queda para cuando P2 y P3
entreguen sus pedidos; ese día el gate se corre contra
`https://paradisofinder.com` (handoff §7).

---

## 12. Entrega de P2 del 04/10: similares con foto, Zona sin dormitorios y comparación sin cubierta

P2 respondió el pedido del 03/10 (`docs/RESPUESTA_P2_A_P1_2026-10-04.md`)
junto con las reglas nuevas de P3 (`docs/RESPUESTA_P3_A_P1_2026-10-03.md`; la
segunda vuelta de P3 sobre la respuesta de P1 del 30/09 está en
`docs/RESPUESTA_P3_A_P1_2026-10-04.md`). **Está en el Docker local de P2
(`localhost:8000`, sobre la corrida de P3 del 03/10); en producción todavía
no.** Con esto se cierra casi todo lo de §11.3 y §11.4.

### 12.1 Qué llega ahora (medido el 04/10 sobre el Docker local)

Recorriendo `/search/structured` (2.039 avisos de vivienda: todos los
departamentos, todos los alquileres y 800 casas en venta):

| Qué | Antes | Ahora |
|---|---|---|
| Departamentos en venta sin cubierta (`total_area_basis: true`, 177) | sin m² ni comparación, motivo "Sin superficie cubierta…" | m² sobre la total y comparación; 12 quedan sin comparación por tener menos de 5 similares |
| Alquileres sin cubierta | sin comparación (P2 la ocultaba) | comparación como cualquier otro; 81 alquileres traen `total_area_basis` |
| Vivienda sin dormitorios (`comparables_by_area_only: true`, 31 ventas y 32 alquileres) | sin comparación y sin Zona | comparada por superficie sola; `zone_ref` con `bucket: "todos"` |
| Departamentos en venta con `zone_ref` | 89 % en Capital | 707 de 707 |
| Comparación con 3 o 4 similares | P3 la calculaba, P2 la descartaba | no existe: el mínimo es 5 en los dos |
| Similares del detalle | sin foto | `photo_url` en todos |
| Casas en venta sin cubierta | sin comparación | igual (decisión de German del 04/10): es el único caso que conserva "Sin superficie cubierta…" |

Esta semana `zone_ref` llega sin `trend` en las celdas por tipo y de lotes
(P3 exige ahora 15 avisos y 3 semanas de serie); el bloque Zona sale sin la
flecha y vuelve solo cuando la serie alcance.

### 12.2 Lo que P1 cambió

| Qué | Dónde |
|---|---|
| **m² rotulado** cuando el aviso se midió sobre la total: "US$ 907/m² total" en la card (con `title` que lo explica), "US$ 907/m² sobre superficie total" junto al precio del detalle | `pricePerSqm` (`long` para el detalle) en `src/lib/format.ts`; `PropertyCard.tsx`; `page.tsx` del detalle |
| El mismo rótulo en la fila de un **similar medido por la total** (`covered_area_sqm` null y `area_sqm` con valor, contrato §4.7) y en la fila propia | `miniCardSqm` |
| **Conjunto por superficie sola**: "12 departamentos de superficie similar en Capital" en la card; "Comparado con 12 departamentos de superficie similar en Capital, con cualquier cantidad de dormitorios" en el detalle. Sin ", D dorm." | `poolUnit`, `poolByBedrooms`, `comparablesPoolInfo` |
| **Conjunto de 1 a 4, sin comparación**: la cabecera de "Avisos similares" ya no dice "Comparado con 2…"; va el motivo de P2 tal cual, y el indicador dice "Avisos similares encontrados" | `comparablesPoolInfo` (`summary: null` sin `valuation_gap_pct`), `positionMissingReason`, `indicatorList` |
| **Miniatura = `photo_url` del similar**, directa. La propia (`/og/propiedad/<id>.t.jpg`) queda de respaldo: sin el campo (P2 de producción hasta su deploy) o si la foto no carga, también cuando falla antes de la hidratación | `similarRows()` en `page.tsx`; `thumbFailed` y `SimilarsSection` en `src/components/detail.tsx` |
| En **alquiler**, la fila propia de "Avisos similares" no lleva m²: P2 manda `price_per_sqm` en alquileres pero sus similares no, porque se comparan por precio mensual | `similarRows()` |
| "a esta departamento" → "a este departamento" en la nota de la sección (error del 03/10) | `similarRows()` |
| Tipos: `total_area_basis`, `comparables_by_area_only`, `MiniCard.photo_url`, `bucket: "todos"` | `src/lib/p2/types.ts` |

Lo que **no** hizo falta tocar: `has_covered_area` nunca se usó para ocultar
el bloque de posición (sale siempre que llega `valuation_gap_pct`); el
bloque Zona no muestra el bucket, así que `todos` entra sin texto nuevo; el
alquiler sin cubierta enciende su bloque solo. Los mocks no se tocaron: son
solo el fallback de `P2_MODE=auto`.

El cambio es compatible hacia atrás: con el P2 de producción (01/10) los
campos nuevos no llegan, no aparece ningún rótulo nuevo y la miniatura sale
de la ruta propia, como hasta hoy. Lo único que cambia sin esperar a P2: la
cabecera sin "Comparado con" cuando no hay comparación, la fila propia sin
m² en alquiler y la concordancia de la nota.

### 12.3 Visto con datos reales (Docker local, 380 px)

| Aviso | Qué se ve |
|---|---|
| `ac233f21…` departamento en venta, Capital, 54 m² totales | Card "US$ 907/m² total", 26 % por debajo en verde, "30 departamentos en Capital, 1 dorm.". Detalle: "Comparado con 30 departamentos similares en Capital, 1 dorm."; entre los 5 a la vista, dos medidos por la total y rotulados |
| `aa03382d…` departamento en venta con 2 similares | Card con el motivo "Hay menos de 5 avisos similares en la zona…". Detalle: ese motivo como cabecera, las 2 filas (de Rivadavia), "Avisos similares encontrados: 2" |
| `b673d948…` departamento en venta sin dormitorios | "12 departamentos de superficie similar en Capital"; Zona "m² US$ 1.090" (celda `todos`) |
| `55fea243…` alquiler sin dormitorios, Rivadavia | "13 alquileres de superficie similar en Rivadavia"; filas sin m² |
| `0279f27b…` medido por la total, a verificar | "35 %+ por debajo · verificar el aviso", en neutro |

"departamentos en venta en capital", 70 cards: 23 con el m² sobre la total,
2 por superficie sola, 2 sin posición (con su motivo), 0 sin Zona. Las
miniaturas cargan 30 de 30 directas del portal; con las fotos del portal
bloqueadas en el navegador, 30 de 30 por la ruta propia.

### 12.4 Dos detalles vistos, que NO se mandan a P2 ni a P3

German dio por cerrada la iteración el 04/10: no se abre otra ronda por
detalles. Quedan acá solo como registro, fuera de la respuesta a P2.

- El alquiler con `bedrooms: 0` (`975d753f…`, un solo aviso) trae `zone_ref`
  con `todos` pero 0 similares: para la Zona el 0 es "sin dato" y para el
  conjunto no.
- El motivo dice "menos de 5 avisos similares en la zona" también cuando la
  zona ya se amplió (`scope: macro_zone`). P1 lo muestra tal cual.

### 12.5 Resultado de las pruebas (04/10)

`tsc`, `eslint` y `npm run build` limpios. Playwright contra `next start` del
build final y **P2 real** (Docker local, versión del 04/10):

| Corrida | Resultado |
|---|---|
| `cards-{alquilar,comprar,invertir,lotes}.spec.ts`, proyecto `mobile` | 38 pasan · 0 fallan (4,5 min) |
| `cards-alquilar` y `cards-comprar`, proyecto `desktop` | 20 pasan · 0 fallan |

Una corrida anterior contra `next dev` (cards + `t3-card`, los dos proyectos)
dio 82 pasan y 2 fallan: las dos, la aserción "alquileres en" de
`cards-alquilar`, que no conocía "alquileres de superficie similar en"; se
corrigió la prueba. Prueba nueva en `cards-comprar`: toda card con m² lo trae
sobre la cubierta ("m² cub." en la ficha) o rotulado "total", y el conjunto
por superficie sola no dice dormitorios. Los textos de la cabecera y la
miniatura de la batería aceptan las dos formas (con y sin los campos del
04/10).

No se probó el camino sin los campos nuevos contra el P2 de producción: la
miniatura propia sí se ejercitó, bloqueando las fotos del portal en el
navegador (30 de 30 por la ruta propia).

### 12.6 Pendiente

- P1 a producción: push a `stage` (gate + smoke) y promover. Puede salir
  antes que P2. El commit en `develop` es del 04/10.
- Deploy de P2 y sync de P3 a Railway (los decide German).
- `docs/RESPUESTA_P1_A_P2_2026-10-04.md` es un borrador de cierre, sin
  pedidos: German decide si se copia al repo de P2 o no se manda.
- El video contra producción (§11.6) sigue esperando el deploy de P2 y P3.

## 13. Referencia de precio `price_ref`: un solo número, diciendo de dónde sale (31/10-01/11)

**Origen.** Pedido de P1 a P3 del 31/10 (indicadores por radio,
`docs/PEDIDO_P1_A_P3_2026-10-31_indicadores-por-radio.md`); respuesta de P3
del mismo día (`docs/RESPUESTA_P3_A_P1_2026-10-31_indicadores-por-radio.md`)
y su prompt a P2 (`docs/PROMPT_P3_A_P2_2026-10-31_price-ref.md`); contrato
§4.8 de P2. **Decisión de German del 31/10:** zona, radio 1 (1 km) y radio 2
(3 km urbano / 5 km rural) son tres referencias por aviso y mostrar las tres
es demasiado; **P3 elige una** con una cascada por vertical (venta r1 → zona;
alquiler r1 solo en su tramo de dormitorios → zona; lote urbano r1 → r2 →
zona; lote rural zona), **P2 la sirve como `price_ref`** y **reemplaza a la
mediana de `zone_ref`**. Lo único que cambia: tendencia, rentabilidad
promedio y semana siguen saliendo de `zone_ref`. Las tres preguntas
abiertas de P3 las resuelve P1 solo (§13.3): **a P3 no se le contesta nada,
la entrega está cerrada** (German, 01/11; regla de no abrir rondas).

### 13.1 Qué llega (Docker local de P2, 01/11)

- `price_ref` en toda card y en el detalle:
  `{level, radius_km, place, value, unit, sample, bucket}`. Visto en 60
  cards: venta con `radius` de 1 km (bucket propio o `todos`), `zona` y
  `macro_zona` con `place: gran_san_juan`; alquiler en `month`; lotes urbanos
  con `radius` de 1 y de 5 km (Nueve de Julio: radio 2 rural) y `zona`;
  lotes rurales en `hectare` por `zona` y por `macro_zona` con
  **`place: alejado`** — la macro zona no es solo `gran_san_juan`: también
  `periferia` y `alejado`, y P1 les pone nombre.
- En los niveles de zona el valor coincide con la mediana de `zone_ref` del
  mismo aviso (visto aviso por aviso en esa muestra), como P2 garantiza.
- Railway: todavía no (sync de P3 y deploy de P2, los decide German).

### 13.2 Lo que P1 cambió

- `src/lib/p2/types.ts`: `PriceRef` y `Card.price_ref`; `ZoneRef` queda
  entero con la nota de que sus medianas ya no se muestran; `zone_stats_ref`
  deja de ser respaldo.
- `src/lib/format.ts`: `priceRefInfo` (solo `unit: sqm`; texto por nivel: "a
  menos de N km" / "en la zona" / "en el Gran San Juan" / "en la periferia" /
  "en los departamentos alejados" / "en la provincia"; `basis` = "N avisos ·
  sin distinguir dormitorios"). `zoneRefInfo` ya no lee las medianas de
  `zone_ref` ni `zone_stats_ref`: sin `price_ref` mostrable ni `cap_pct`, sin
  bloque. `ZoneRefInfo.widened` ("(zona ampliada)") desaparece; entran
  `where` y `basis`.
- `src/components/signals.tsx`: `ZoneBlock` muestra `where` en un `<small>`
  y, con `full` (detalle), la base. **Defecto visto en la captura y
  corregido:** el espacio inicial dentro del `<small>` (inline-block) se
  colapsa y salía "US$ 1.340a menos de 1 km"; el espacio va ahora como nodo
  de texto propio. (El "(zona ampliada)" anterior tenía la misma estructura.)
- `src/app/propiedad/[id]/page.tsx`: `<ZoneBlock full />`. `globals.css`:
  `.zoneblock-basis`.
- `src/lib/p2/mocks.ts` (fallback técnico, no se prueba con ellos):
  `priceRef()`, `mockPriceRef()` derivado de la celda zonal generada, y los
  casos fijos: `sj-mks0` zona 857, `sj-mks1` radio 1 km 1.245, `sj-mks2`
  macro zona 809; lotes radio 1 y 3 km; rural hectárea por provincia;
  alquiler en `month`.
- Pruebas: `PRICE_REF` en `tests/e2e/cards-vertical.ts` (m² + de dónde sale;
  nunca "ha US$"; la base no está en la card); casos fijos actualizados en
  la batería, `cards-comprar` ("m² US$ 857 en la zona") y `cards-lotes` (el
  rural sin bloque Zona).

### 13.3 Decisiones de P1 (01/11) — las tres preguntas de P3, resueltas acá

1. **Hectárea rural: no se muestra.** P3 midió que la hectárea mediana de la
   zona se aparta 139 % del precio típico de un lote rural; un número así
   desinforma aunque P1 no lo pinte. `unit: hectare` → sin referencia; la
   card del lote rural queda sin bloque Zona. P3 sigue calculándolo. Una
   línea para revertir.
2. **Radios de lotes rurales: con la zona.** A 5 km llegan al mínimo el 2 %;
   mientras la hectárea no se muestre, no cambia nada visible. No se abre.
3. **`is_shared_or_partial` en la serie zonal: sí, pero cuando P3 toque
   `zone_stats`.** 17 avisos; anotado en B7, no es pedido.
4. **Alquiler: el `month` no se muestra** (decisión 15: la card de Alquilar
   no lleva bloque Zona). Queda disponible.
5. **"N avisos · sin distinguir dormitorios" solo en el detalle**; en la card
   no entra (380 px).

### 13.4 Resultado de las pruebas (01/11)

- `cards-{comprar,lotes,invertir,alquilar}.spec.ts`, proyecto `mobile`,
  contra un P1 de desarrollo (:3001) apuntado al **Docker local de P2**
  (`localhost:8000`, `P2_MODE=live`): **38 passed (5,0 min)**.
- Tras el arreglo del espacio, las pruebas de Zona de las cuatro verticales:
  **7 passed (54.0s)**.
- Capturas a 380 px (card de venta con "m² US$ 900 a menos de 1 km" y
  bloque del detalle con "25 avisos · sin distinguir dormitorios" y la
  pastilla "Estable") enviadas a German el 01/11.
- `tsc --noEmit` y `eslint` limpios (las dos advertencias de
  `scripts/qa-bajas-fuente.mjs` son previas).

### 13.5 Pendiente

- Nada para P3 ni para P2: la entrega está cerrada.
- **Orden de salida: sync de P3 a Railway → deploy de P2 → deploy de P1.**
  Si P1 sale antes, las cards de producción quedan sin referencia de precio
  (ya no cae a `zone_ref`). El cambio está en el árbol de trabajo de
  `develop`, sin commit (no se pidió).
- El Docker de P1 del :3000 sigue con la imagen anterior; se rehace con el
  commit en `develop` (hook). Listo para el commit (German lo pide); el push
  espera a P3 y P2.

### 13.6 Navegación completa del 01/11 y un bug previo del mapa

German pidió verificación, navegación y pruebas de que todo anda (y nada
para P3). Recorrido con Chrome vía Playwright, a 380 px y a 1280 px, sobre
el **build de producción** (`next build` + `next start -p 3001`) apuntado al
Docker local de P2: home → búsqueda escrita en el campo ("casas en venta en
capital") → 599 resultados, chips "Entendí", resumen, mapa (escritorio: "466
de 599 con ubicación publicada") → scroll infinito (10 → 20 cards) → selector
Lotes, Alquilar e Invertir con resultados en pantalla → detalle (galería,
Lectura de FINDER con el bloque Zona y su base, Avisos similares, Consultar,
Ubicación). Sin "None/null/undefined/NaN", sin errores de consola ni HTTP
propios, sin scroll horizontal en mobile. Capturas en el registro de la
sesión; a German se le mandaron la card y el bloque del detalle.

**Bug previo, visto en escritorio:** al cambiar de vertical con el selector
(Comprar → Lotes, y también → Invertir), la página quedaba con scroll
horizontal (1.445 px sobre 1.280) de forma permanente. Idéntico en el Docker
viejo del :3000 (imagen anterior a este cambio), así que no lo introdujo
`price_ref`. Causa: `ResultsMap` renderizaba el `div` host con un
`className` que dependía de la capa; Leaflet agrega sus clases
(`leaflet-container`, la del `overflow: hidden`) a ese mismo elemento, y al
cambiar la capa React volvía a escribir `className` y se las borraba: teselas
y marcadores (`price-marker--land`) quedaban fuera del mapa, pasados del
borde. La prueba "layout: sin scroll horizontal" no lo veía porque carga por
URL, sin cambiar de vertical. **Arreglo:** `className="leaflet-host"` fijo;
la capa ya viajaba en `data-layer` (`leaflet-host--land` no tenía CSS).
Prueba nueva en `cards-lotes.spec.ts` ("cambiar a Lotes con resultados en
pantalla no desborda la página"): cambia de vertical con el selector y exige
que el host siga siendo `leaflet-container`.

**Segundo bug previo, destapado por la batería completa:** `/propiedad/<id>`
con un id que no es UUID daba **500** (página de error), también en el Docker
viejo. P2 responde 500 (no 404) a todo id sin forma de UUID, y la página del
detalle llamaba a P2 sin atrapar el error (`generateMetadata` sí lo atrapaba).
**Arreglo** en `getProperty` (`src/lib/p2/client.ts`): en `live`, un id que
no tiene forma de UUID es "no existe" → 404 de P1 sin llamar a P2; en `auto`
se deja pasar para que los ids de los mocks sigan cayendo al fallback con P2
caído. Un UUID inexistente ya daba 404 (P2 responde 404 y P1 lo mapea). Prueba
nueva en `compartir-og-sitemap.spec.ts` ("un id que no es de P2 da 404, no
500", solo en `live`).

### 13.7 Batería completa del 01/11 (build de producción, Docker local de P2)

| Corrida | Resultado |
|---|---|
| Las 16 specs, proyecto `mobile` (380 px) | **78 passed · 1 failed · 1 skipped** (9,3 min) |
| Las 16 specs, proyecto `desktop` (1280 px) | **79 passed · 1 skipped** (9,5 min) |
| Tras los dos arreglos: `cards-lotes` + `compartir-og-sitemap`, mobile y desktop, con las dos pruebas nuevas | **28 passed** (3,0 min) |

La única falla (mobile, "sitemap: propiedades con lastmod y páginas que
existen") no era del código: el `next start` local cargó del disco un
snapshot del sitemap del 01/10 generado con mocks (`.cache/property-sitemap.json`,
gitignored), que listaba `/propiedad/sj-mks0`, y esa URL daba el 500 de
arriba. El refresco en segundo plano lo reemplazó durante la corrida (en
escritorio la misma prueba pasó) y el sitemap quedó con **4.037 propiedades
reales y 0 ids de mocks**; el Docker del :3000 nunca tuvo ese snapshot. La
prueba saltada es la misma en los dos proyectos (condición de entorno de la
spec, no una falla). Verificado además a mano sobre el build nuevo: 404 en
`no-existe`, `sj-mks0` y un UUID inexistente; 200 en una propiedad real; sin
desborde en escritorio durante 12 s tras cambiar a Lotes, ningún elemento
fuera del mapa pasado del borde.

### 13.8 QA de datos de `price_ref` (01/11)

German pidió una prueba de calidad de los datos nuevos:
`docs/QA_DATOS_2026-11-01_price-ref.md`. Resumen: 5.346 avisos de
`/search/structured`, `price_ref` en el 99,5 %, 0 violaciones del contrato,
paridad exacta con `zone_ref` (2.262) y con las columnas `ref_*` de P3
(5.321); el radio 1 km queda más cerca del precio del aviso que la zona (venta
24 % contra 26 %, lotes urbanos 26 % contra 45 %); la hectárea rural no sirve
(69 % de mediana, p90 481 %), ratificado §13.3. Los extremos son avisos con
precio o superficie mal cargados en el portal, ya marcados como "verificar el
aviso". Nada para P2 ni P3.
