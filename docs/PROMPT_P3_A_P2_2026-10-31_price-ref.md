# Prompt para P2 — Valor representativo de precio (`ref_*`) — 2026-10-31

Texto para pegarle al agente de código que trabaja en el repo de P2 (`paradisofinder-core`).
Lo que sigue a la línea es el prompt completo. Acompaña a
`RESPUESTA_P3_A_P1_2026-10-31.md`, que es lo que recibe P1.

---

P3 agregó, para cada aviso de San Juan, un **valor de referencia de precio** listo para
mostrar, y necesito que P2 lo devuelva en la Card como `price_ref`. **`price_ref` reemplaza a
`zone_ref` como referencia de precio: la card muestra un solo número, el de `price_ref`, y la
mediana de `zone_ref` no se muestra más.** Es lo único que cambia: `zone_ref` sigue en la
Card, y **la tendencia de la zona, la rentabilidad de la zona y la semana se siguen mostrando
como hoy**. P2 no calcula nada: lee columnas nuevas de `master.properties` y las sirve tal
cual.

## Contexto

Hasta hoy la card compara el precio del aviso con su zona (`zone_ref`, la celda de
`master.zone_stats`). P3 ahora calcula además los mismos indicadores con lo que **rodea** al
aviso: radio 1 de 1 km y radio 2 de 3 km (zona urbana) o 5 km (rural). Son tres referencias
por aviso y mostrar las tres es demasiado. Por eso **P3 elige una** (decisión de German del
31/10), la que mejor describe el precio de avisos como ese, y la deja en `ref_*`. **Lo que va
en la card es ese valor y ningún otro**, diciendo de dónde sale. Puede venir de un radio o de
la zona: para P2 da igual, el valor ya es el que va.

La elección es una cascada por vertical que P3 midió y mantiene. **No la reimplementes**:
si cambia, cambia en P3 y P2 no se entera.

| Vertical | Cascada de P3 (primer nivel con valor) |
|---|---|
| Venta de vivienda | radio 1 → zona |
| Alquiler de vivienda | radio 1 si usó el tramo de dormitorios del aviso → zona |
| Lote urbano | radio 1 → radio 2 → zona |
| Lote rural | zona |

## Columnas nuevas (migración 040 de P3)

Llegan con el próximo sync de P3 a Railway. Todas nullable.

| Columna | Tipo | Valores |
|---|---|---|
| `ref_nivel` | varchar | `r1` · `r2` · `zona` · `macro_zona` · `provincia` · NULL |
| `ref_valor` | numeric | el valor a mostrar, en la moneda de cálculo (USD en San Juan) |
| `ref_unidad` | varchar | `m2` (por m²) · `mes` (renta mensual) · `ha` (por hectárea) |
| `ref_n` | integer | avisos que respaldan el valor |
| `ref_bucket` | varchar | la celda: `1` · `2` · `3` · `4plus` · `todos` · `lote_urbano` · `lote_rural` · `lote_rural_srv` |
| `ref_lugar` | varchar | nombre de la zona, macro zona o provincia (`capital`, `gran_san_juan`, `san_juan`); NULL en `r1` / `r2` |
| `radio1_km` / `radio2_km` | numeric | km del radio 1 (1,0) y del radio 2 (3,0 o 5,0) |

Los km se leen solo para armar la etiqueta cuando el valor sale de un radio. Las demás
columnas de radio (`r1_*`, `r2_*`, `radio_*`) son el respaldo de P3: **no se exponen**.

## Qué hacer

1. **Registrar las columnas como opcionales** en `P3_OPCIONALES`
   (`app/repositories/postgres_property.py`), igual que las de 038 y 039: `ref_nivel` text,
   `ref_valor` numeric, `ref_unidad` text, `ref_n` int, `ref_bucket` text, `ref_lugar` text,
   `radio1_km` numeric, `radio2_km` numeric. Hasta que llegue el sync se leen como NULL y
   nada se rompe.
2. **`price_ref` en la Card**, con un builder en `app/repositories/card_helpers.py` al estilo
   de `make_zone_ref`. Es **la** referencia de precio del aviso. `zone_ref` se queda donde
   está, con todos sus campos: de él siguen saliendo `trend`, `trend_pct`, `trend_weeks`,
   `cap_pct` y `week`. Mapeo sugerido:

   | Campo | Sale de |
   |---|---|
   | `level` | `radius` si `ref_nivel` es `r1` o `r2`; si no, `ref_nivel` tal cual (`zona` · `macro_zona` · `provincia`, el mismo vocabulario que `zone_ref.fallback`) |
   | `radius_km` | `radio1_km` si `r1`, `radio2_km` si `r2`; null en los niveles de zona |
   | `place` | `ref_lugar` |
   | `value` | `ref_valor` |
   | `unit` | `ref_unidad` → `sqm` · `month` · `hectare` |
   | `sample` | `ref_n` |
   | `bucket` | `ref_bucket` |

   Los nombres finales los decide P2. Lo único fijo es que el valor, la unidad y el nivel
   vienen de P3 sin tocar.
3. **Cuándo es null.** `ref_nivel` NULL → `price_ref = null` → **la card no muestra
   referencia de precio**. No se cae a `zone_ref` en ningún caso. De los 5.402 avisos visibles
   de San Juan son 50: habitaciones y temporarios (que tampoco tienen `zone_ref` hoy) y 20
   avisos de **parte indivisa, cesión o boleto**, cuyo precio no es el de un inmueble entero
   (hoy `zone_ref` sí les trae valor). Los avisos **sin coordenadas** sí tienen `price_ref`:
   sale de la zona.
   **Orden de publicación**: P2 publica este cambio **después** del sync de P3. Antes del
   sync las columnas no existen, `price_ref` vendría null en todos los avisos y la card se
   quedaría sin referencia.
4. **Moneda.** `ref_valor` está en USD, igual que las medianas de `zone_ref`. Si el alquiler
   se muestra además en pesos, con la misma regla que ya usan para `zone_ref.median_price`.
5. **Tests.** Uno de paridad: cuando `ref_nivel` es `zona`, `macro_zona` o `provincia`,
   `ref_valor` es exactamente el valor de referencia de `zone_ref` del mismo aviso (P3 lo
   verificó sobre su base: 3.492 de 3.492 iguales). Más un test por cada caso de null.

## Qué no hacer

- No recalcular la cascada ni elegir entre zona y radios del lado de P2.
- No mostrar la mediana de `zone_ref` (m², hectárea ni precio mensual) junto a `price_ref`,
  ni como respaldo cuando `price_ref` es null: un solo número de referencia por aviso.
- No sacar `zone_ref` de la Card ni dejar de mostrar su tendencia y su rentabilidad: lo único
  que se reemplaza es el precio de referencia.
- No tocar el gap ni los semáforos: siguen por zona.
- No exponer todavía `r1_*` / `r2_*` ni filtrar por radio ("a menos de 2 km de…"): es otro
  pedido de P1.

## Para controlar después del sync (base de P3 del 31/10)

Avisos visibles de San Juan (`is_active AND quality_tier >= 1`): 5.402.

| `ref_nivel` | `m2` | `mes` | `ha` |
|---|---|---|---|
| `r1` | 2.384 | 182 | — |
| `r2` (solo lotes urbanos) | 493 | — | — |
| `zona` | 1.528 | 294 | 116 |
| `macro_zona` | 142 | 53 | 99 |
| `provincia` | 33 | 28 | — |
| NULL | 50 en total | | |

Texto que va a usar P1 según el nivel (no lo arma P2, queda como referencia): `r1` "a menos
de 1 km", `r2` "a menos de 3 km" o "de 5 km" según `radio_km`, los niveles de zona "en
{lugar}". Con `bucket = todos` la comparación es contra todos los tamaños del tipo.
