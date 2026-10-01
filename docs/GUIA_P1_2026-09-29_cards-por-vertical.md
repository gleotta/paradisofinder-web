# Guía de cambios en P1 — Cards por vertical — 2026-09-29

**Para: el equipo de P1 (este repo). Estado: Fase 0 ejecutada el 29/09 — qué se hizo y dónde se apartó de esta guía, en §8. P3 entregó el 30/09 — qué cambia para P1, en §9. P2 entregó el 30/09-01/10 — qué cambió P1 y qué verificó, en §10.**

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
| **Bloque Zona** (nombre, "m² US$ X" o "ha US$ X", flecha; verde si sube) | — | sí | sí | sí, más "Rentabilidad promedio de la zona: X % anual" | `zone_ref` | P2 (+P3) |
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
- Título: "ZONA · {zoneName}". Valor: vivienda "m² US$ {median_price_per_sqm}"; lote urbano ídem; lote rural "ha US$ {median_price_per_hectare}". Invertir agrega "Rentabilidad promedio de la zona: {cap_pct} % anual" cuando `cap_pct != null`.
- Fondo verde con `zone_ref.trend === "up"`; neutro con `"flat"`, `"down"` o `null`. Pastilla: "En suba N %" / "En baja N %" / "Estable" (`trend_pct`); sin `trend` → sin pastilla.
- `fallback != null` → se muestra igual, con "(zona ampliada)" al lado del valor.
- Sin `zone_ref` → ranura vacía.

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
5. **Zona:** ausente en Alquilar; presente en Comprar, Lotes e Invertir cuando `zone_ref` llega, ausente cuando es `null`; verde solo con `trend: "up"`; "ha US$" en rural y "m² US$" en urbano; "(zona ampliada)" con `fallback`.
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

Visto a ojo contra P2 real (versión del 01/10): el alquiler `b69a7ce1…` (75
similares, 37 a la vista) dice "Comparado con 75 alquileres similares en
Capital, 3 dorm. · 37 a la vista · los otros 38 no se muestran porque no
publican foto o superficie", lista 30 y "Mostrar los 7 restantes" despliega los
37; el alquiler `97951e69…` (80 similares) lista exactamente 30 porque los otros
50 son tier 0; el lote rural `c79bf4ee…` dice "Comparado con 4 lotes rurales
similares en Pocito" con sus 4.

### 10.6 Pendiente

- Deploy de P2 al stage y la batería en modo contrato contra el stage
  (aceptación del cableado, §8.7).
- §8.6 (lotes: gap 34,7 con `yellow` y 4 comparables) sigue en el Docker local
  del 01/10; anotado otra vez en la respuesta a P2, que German aprobó dejarlo
  abierto para P2/P3.
- Commit de P1 (los cambios del 29/09 y del 01/10 siguen sin commitear).
- Gate del video (§6), en el stage.
