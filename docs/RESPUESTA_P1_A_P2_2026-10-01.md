# Respuesta de P1 a P2 — Cards por vertical — 2026-10-01

**Para: el equipo de P2 (finder-core), con copia a P3.** Responde a
`RESPUESTA_P2_A_P1_2026-09-30.md` (actualizada el 01/10). Autocontenido: se
copia tal cual al repo de P2.

**Estado: aprobado por German el 01/10/2026** (las respuestas 1 a 4, tal como
están escritas). Lo que P1 cambió en su código (sección A) está hecho y probado
contra los mocks y contra el Docker local de P2, que ya corre la versión del
01/10 (commit hecho; el stage de Railway, a confirmar por P2).

---

## A. La entrega

Se acepta la entrega completa: §3.1 a §3.5, con los nombres definitivos. P1
verificó los campos contra su Docker local de P2 (`localhost:8000`, versión
del 01/10, base de la corrida de P3 del 29/09): `zone_ref` llega en venta,
alquiler y lotes con `fallback_ref` y `trend_weeks` 2; `price_trend` y sus
cuatro compañeros llegan en alquileres de Capital (por ejemplo `down`, −10,9 %,
antes $ 500.000); `estimated_monthly_rent_ars` llega redondeado a la centena;
`area_sqm` llega `null` en cinco de los primeros cuarenta alquileres;
`comparables_pool` llega en los detalles probados. La lista sin tope del 01/10
está: un alquiler de Capital con 75 similares lista 37 (`listed: 37`,
`not_listed: 38`) y P1 muestra 30 con "Mostrar los 7 restantes"; otro con 80
lista exactamente 30 porque los otros 50 no se pueden mostrar
(`not_listed: 50`).

Los dos criterios de §3.2 que no se cumplieron tal como estaban escritos (94 %
y 84 % con celda propia) estaban mal medidos del lado de P1: el pedido se midió
sobre la base del 21/09 y sin el tipo en el grano. Con las celdas por tipo, 89 %
y 85 % de celda propia es lo esperable y alcanza.

### Lo que P1 cambió por los cuatro puntos de "Lo que P1 tiene que tener en cuenta"

| Punto | Qué hizo P1 |
|---|---|
| 1. `area_sqm` null | Ya se omitía (null = no informado); el guardado contra el `0` de antes queda, no molesta. Los mocks traen `null` en una de cada 17 viviendas para que la prueba lo cubra. |
| 2. Comparables = conjunto entero + `comparables_pool` | La sección del detalle pasó a llamarse **"Avisos similares"**. Cabecera con el conjunto: "Comparado con 80 alquileres similares en Capital, 3 dorm. · 30 a la vista · los otros 50 no se muestran porque no publican foto o superficie". Cada similar muestra tipo, dormitorios, cubierta (o m² de lote) y US$/m² de P2. **El recorte es de P1:** se ven 30 y un botón "Mostrar los N restantes" despliega el resto (en venta y lotes nunca aparece). Con `scope: adjacent_zones` la cabecera dice "en Capital y zonas vecinas"; con `macro_zone`, "y alrededores". |
| 3. Alquiler caro: `capped` + `red` | "verificar el aviso" (frase y nota) depende ahora de `deal_rating === "verify_data"`; el "35 %+" sigue saliendo de `valuation_gap_capped`. Un alquiler más de 35 % por encima se ve "35 %+ por encima de similares", en neutro: la card no pinta rojo. Prueba nueva en `cards-alquilar.spec.ts`. |
| 4. Textos nuevos | Ninguna prueba de P1 comparaba textos de P2. Los mocks pasaron a los textos vigentes (componentes `gap_valuacion`, `price_position`, `tope_gap_fuera_de_rango`; motivo `sobreprecio`; orden "Más baratas entre avisos similares"). |

Además, el vocabulario propio del detalle de P1 (la deuda que anotó la guía §9)
quedó sin jerga: "Percentil de precio · P28" → "Posición entre similares: más
barato que el 72 % de los similares" (misma lectura que el componente
`price_position` de P2); "Comparables considerados" → "Avisos similares
comparados"; "Renta bruta anual estimada" → "Rentabilidad anual estimada";
"Opportunity Score" → "puntaje de oportunidad".

## Respuestas

### 1. Comparables de alquiler: alcanza con `not_listed`, y que el conjunto no cambie otra vez

Se queda como está. La cabecera dice cuántos son y cuántos se ven, y eso es
honesto con el usuario: la comparación se hizo contra 80 y acá hay 30 para
mirar. Las dos alternativas se descartan:

- **Conjunto de alquiler solo con avisos visibles.** Cambiaría los gaps y
  semáforos por tercera vez en una semana, y recortaría el conjunto justo
  donde más hace falta (el alquiler por dormitorios ya es el menos exigente).
  Un aviso sin foto sigue siendo un precio publicado: sirve para comparar
  aunque no sirva para mostrar.
- **Filas tier 0 sin link.** Una fila con precio y sin foto, sin superficie y
  sin a dónde ir no le dice nada al usuario, y rompe la regla del contrato de
  que tier 0 no se muestra.

Lo único que P1 pide es que el texto de `not_listed` siga significando "sin
foto o sin superficie", porque la cabecera lo explica así.

### 2. Propia o fallback por el valor de referencia: se acepta

La interpretación de P2 es mejor que el pedido literal. El caso que da P2 (un
alquiler de Capital con 31 avisos servido con la macro zona porque pocos
publican superficie) es exactamente lo que P1 no quería. Se queda.

### 3. Redondeo a la centena: se acepta

$ 600.000 y no $ 600.001. En el detalle se muestra "Similares en la zona:
US$ 453 (≈ $ 650.000)".

### 4. Guía §8.6: sigue abierto, y P1 lo volvió a ver hoy

No era parte del pedido, se anota para que no se pierda. En el Docker local
del 01/10 el primer lote rural de "lotes en Pocito" sigue llegando con
`valuation_gap_pct` 34,7, `deal_rating: yellow` ("Precio atractivo, pero hay
pocos avisos similares para comparar (4)") y `comparables_count: 4`. La card
dice "35 % por debajo de similares · 4 lotes rurales en Pocito", en neutro,
que es lo que mandan los dos campos. Hace falta que P2 o P3 decidan: o el gap
de un lote exige el mismo mínimo de 5 que la vivienda, o el semáforo de lotes
sigue al gap. P1 muestra lo que llega, en cualquiera de los dos casos.

## B. Pedidos

1. **Deploy al stage.** El Docker local ya tiene la versión del 01/10 y la
   batería `cards-*.spec.ts` de P1 en modo contrato pasa entera contra ella.
   La aceptación del cableado (guía §8.7) es esa misma batería contra el
   stage de P2: avisar cuando el stage tenga esta versión.
2. **`trend_weeks` 2.** P1 pinta "En suba N %" (verde) o "Estable" con lo que
   llega, también con dos semanas de serie. El pedido de P1 a P3 de publicar la
   tendencia zonal solo con muestra ≥ 15 y ≥ 3 semanas
   (`RESPUESTA_P1_A_P3_2026-09-30.md` §B) sigue esperando a German; si se
   aprueba, P2 no cambia nada (lee lo que P3 publica).
3. **"Score máximo N" en los topes.** Es el único "Score" que queda visible: se
   lee en la tabla del detalle. Cuando toquen esos textos, "Puntaje máximo N"
   o "El puntaje no pasa de N" alcanza. No urge.

## C. Lo que P1 vio en el Docker local (01/10)

- `score_components` de venta llega con `gap_valuacion`, `price_position`,
  `time_on_market`, `freshness` y, en tier 1, `tope_tier_1` ("Datos
  incompletos … Score máximo 89"). Sin `gross_yield`: cumple §3.3.2.
- `secondary_indicators` llega con los mismos cuatro textos. P1 no lo muestra
  desde el 29/09 (la tabla repetía fechas y gap), no hay conflicto.
- `zone_ref` de alquiler trae `median_price` (453,07 en Capital, 2 dormitorios)
  y P1 no lo muestra en la card de Alquilar (decisión 15 del plan). En el
  detalle va en "Similares en la zona" con `estimated_monthly_rent`.
- `zone_ref.property_type: "land"` y `bucket: lote_rural` en lotes, con m² y
  hectárea. El bloque Zona de la card muestra la hectárea en rural y el m² en
  urbano, como antes con `zone_stats_ref` (que sigue llegando idéntico).
- `price_trend` en venta de Capital: ninguno en las primeras cinco casas; en
  alquiler, dos de los dos primeros con `down`. Coincide con lo que P2 midió
  (128 bajas en 2.457 ventas).
