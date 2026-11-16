# Respuesta de P1 a P3 — Cards por vertical — 2026-09-30

**Para: el equipo de P3 (finder-pipeline), con copia a P2.** Responde a
`RESPUESTA_P3_A_P1_2026-09-29.md`. Autocontenido: se copia tal cual al repo de P3.

**Estado: aprobado por German el 01/10/2026** (las respuestas 1 a 7 y el
pedido nuevo de la §B, tal como están escritos). Copiado al repo de P3 ese día.

Todas las cifras de este documento salen de la base local del 2026-09-29, la
misma que midió P3. El universo es la vivienda activa de San Juan (casas,
departamentos y villas).

---

## A. La entrega

Se acepta la entrega completa: §4.1 a §4.5, con los nombres definitivos de
columnas. Los dos criterios de aceptación que no se cumplieron estaban mal
escritos del lado de P1, no fallan por la implementación:

- **§4.1, "las 191 bajas".** P1 las contó sin ventana (cualquier cambio en toda
  la historia) y en el mismo pedido fijó una ventana de N corridas. Las dos
  cosas no pueden cumplirse juntas. Vale el algoritmo (ver respuesta 2).
- **§4.3, "la mediana del top 20 entre 6 y 9 %".** El top de un ranking que
  premia lo barato concentra rentabilidades altas por construcción, como
  explica P3. El criterio correcto es el poblacional (mediana 7,5 %), y ese se
  cumple. Lo que sí falta es una regla, en la respuesta 1.

También se toman las interpretaciones de §4.1: la ventana contada desde
`observed_at`, los cuatro datos aunque no haya etiqueta, el descarte de las
variaciones extremas y el caso sin cotización del día.

## Respuestas

### 1. Rentabilidad: se acepta el pool y se pide no publicar la rentabilidad cuando el precio es dudoso

Se acepta el pool como quedó: banda de ±30 %, mínimo 5, sin salir de la zona y
sin tope a la rentabilidad. También se acepta la caída de cobertura. Una
rentabilidad que falta es mejor que una inventada.

Las rentabilidades altas ya están marcadas. Casi todas son de avisos cuyo precio
P3 considera dudoso (diferencia con similares mayor a +35 %, la condición que hoy
da `verificar_datos`):

| Diferencia con similares | Con rentabilidad | Más de 12 % | Más de 15 % | Mediana |
|---|---|---|---|---|
| Más de +35 % (hoy "verificar el aviso") | 120 | 91 | **60** | 14,97 % |
| De +10 a +35 % | 203 | 33 | 3 | 9,82 % |
| Menos de +10 % | 585 | 1 | 0 | 6,35 % |

60 de las 63 ventas con más de 15 % están en la primera fila. Una rentabilidad
calculada sobre un precio que el mismo P3 manda a verificar es tan dudosa como
ese precio.

**Pedido.** Cuando `gap_valuacion` de una venta supera +35 %, `gross_yield_estimado`
y `relacion_renta_precio` quedan en NULL. `renta_mensual_estimada` se
conserva, porque sale del pool de alquileres y no del precio dudoso. El umbral
es el mismo que ya decide `verificar_datos`, sin parámetro nuevo.

Efecto medido:

| | Hoy | Con la regla |
|---|---|---|
| Ventas con rentabilidad | 908 | 788 |
| Mediana | 7,50 % | 7,13 % |
| Máxima | 61,09 % | 18,67 % |
| Más de 15 % | 63 | 3 |
| Top 20 por rentabilidad, lo que abre Invertir sin zona | 20,7 a 61,1 % (mediana 24,7 %) | 12,9 a 18,7 % (mediana 14,1 %) |

La vertical Invertir ordena por rentabilidad, así que hoy abre justo con las
peores estimaciones: 56 %, 54 % y 45 % en "casas en capital" el 29/09. Con la
regla, lo que queda arriba es la cola alta de avisos con precio creíble.

### 2. Ventana de la tendencia: 3 corridas

En la card, "En baja" quiere decir que el vendedor bajó el precio hace poco. Una
baja de hace dos meses ya está en el precio de hoy y en la posición contra
similares, así que mostrarla como novedad confunde. Se quedan las 3 corridas
(144 bajas en venta en dólares) y `TENDENCIA_CORRIDAS` no cambia.

Alcanza para el video. En "casas en venta hasta US$ 100.000" hay 14 bajas en
Rivadavia sobre 156 avisos y 16 en Capital sobre 282.

Si más adelante se ofrece un filtro "bajaron de precio" (backlog de P1, B3), la
ventana se revisa para ese uso. La de la card no cambia.

### 3. Tope de variación: 40 %

Estas son las bajas de más de 40 % que hoy quedan marcadas:

| Aviso | Antes | Ahora | Variación en USD |
|---|---|---|---|
| Terreno en alquiler | $ 2.000.000 | $ 350.000 | −82,7 % |
| Departamento en venta | US$ 700.000 | US$ 295.000 | −57,9 % |
| Departamento en venta | US$ 125.000 | US$ 70.000 | −44,0 % |
| Departamento en alquiler | $ 750.000 | $ 430.000 | −43,0 % |

Las cuatro parecen correcciones más que negociaciones. La flecha "En baja" es
lo único que la card pinta de verde sobre el precio. Por eso un verde falso le
cuesta más al usuario que una baja real que no se muestra.

`TENDENCIA_VARIACION_MAX_PCT` = 40. Con ese tope salen 12 avisos: 4 bajas y 8
subas.

### 4. Precio en pesos que sube y en dólares baja: sin etiqueta, como está

Se queda la regla de P3, y hay una razón más del lado de P1. La flecha dice
"En baja N % · antes {precio anterior en la moneda del aviso}". Si el precio
publicado subió, la card diría "En baja · antes $ 400.000" al lado de
$ 430.000.

### 5. Cotización: ninguna, el supuesto de P1 era falso

P1 no hizo esa medición en dólares. Midió la suba nominal (9,8 % en 27 días) y
supuso que en dólares desaparecía. El dólar oficial guardado pasó de 1.520 el
21/08 a 1.545 el 29/09, una suba de 1,6 % en cinco semanas. La medición de P3 es
la correcta: los 38 alquileres marcados `alta` subieron también en dólares. No
hay nada que cambiar. En la card, "En alta" va en color neutro, nunca en rojo.

### 6. Los `label` de `score_componentes` se ven en el detalle: pasarlos a lenguaje de usuario

La card ya no muestra el puntaje (decisión del 29/09). El detalle sí: en
"Lectura de FINDER", una tabla con `label`, valor y `description` de cada
componente. Pedido:

| `key` | Hoy | Propuesto |
|---|---|---|
| `gap_valuacion` | Subvaluación | Precio frente a similares |
| `gross_yield` | Rendimiento bruto | Rentabilidad estimada |
| `price_position` | Posición de precio | Posición entre similares |
| `time_on_market` | Tiempo en el mercado | Tiempo publicado |

Los códigos (`key`) no cambian.

### 7. "Zona en alza" y "zona en baja" quedan

Sirven, por la misma razón que da P3. El bloque Zona de la card dice "En suba
N %", "En baja N %" o "Estable". Es texto de P1 y se entiende igual junto a los
motivos de P3.

## B. Pedido nuevo: tendencia zonal con muestra y serie suficientes

El bloque Zona de la card se pinta de verde cuando `tendencia = alta`. Hoy la
mitad de esos verdes sale de las celdas más chicas. Esta es la venta de la
semana en curso con tendencia publicada, según la muestra del m²:

| Muestra | `alta` | `baja` | `estable` |
|---|---|---|---|
| 10 a 14 | 7 | 3 | 0 |
| 15 a 19 | 0 | 2 | 3 |
| 20 o más | 9 | 12 | 24 |

Por muestra chica, 7 de los 16 `alta` son ruido probable. Un caso: Jáchal lote
urbano, +74 % en dos semanas con 12 avisos.

Hay además un problema de serie corta. Hoy todas las celdas de lotes comparan
contra 2 semanas atrás, y las celdas por tipo van a publicar tendencia en su
segunda semana, contra 1 semana atrás. Una mediana que se mueve 2 % en una
semana no alcanza para pintar la zona de verde.

**Pedido.** La tendencia zonal se publica solo si se cumplen las dos
condiciones:

1. **Muestra de 15 o más en las dos puntas, en toda celda.** Hoy ese mínimo
   vale solo para los lotes rurales; el resto sigue en 10. Un parámetro:
   `TENDENCIA_ZONA_N_MIN`, default 15. El rural queda igual.
2. **Al menos 3 semanas entre las puntas** (`tendencia_semanas` ≥ 3). Un
   parámetro: `TENDENCIA_ZONA_SEMANAS_MIN`, default 3.

Efecto de la muestra: 11 celdas de venta pierden la tendencia, 7 de ellas
`alta`. Entre ellas están Jáchal lote urbano (+74 %), Rivadavia sin dato de
dormitorios (+12,3 % con 10 avisos) y Rawson 1 dormitorio (+3,3 % con 11), el
salto que P3 ya había señalado.

Efecto de las semanas: los lotes recuperan la tendencia en la corrida del
05/10, cuando su serie cumple 3 semanas. Las celdas por tipo la tienen desde
su tercera semana. La venta de vivienda de la serie `todos` ya compara contra
4 semanas y no cambia.

Aceptación:

- ninguna celda con tendencia y muestra menor a 15 en alguna punta;
- ninguna celda con tendencia y `tendencia_semanas` < 3;
- conservan su tendencia Rivadavia 2 dormitorios (`alta`) y Rawson 2, 3 y 4+
  dormitorios y total (`baja`).

## C. Para P2 (copia)

Con esta entrega, en `PEDIDO_P1_A_P2_2026-09-29.md` quedan desbloqueados §3.1
(tendencia del aviso) y §3.2 (`zone_ref` con tipo, tendencia y rentabilidad
promedio). Tres precisiones de la respuesta de P3:

- La tendencia del aviso se lee solo de `tendencia_precio`: `alta` → `up`,
  `baja` → `down`. `precio_anterior` sin etiqueta no es una señal.
- La tendencia de zona se lee de `tendencia`: `alta` → `up`, `baja` → `down`,
  `estable` → `flat`.
- `zone_ref` de vivienda usa la celda del tipo del aviso (`casa` o
  `departamento`). Si esa celda todavía no tiene tendencia, `trend` va en
  `null`: no se completa con la de `todos`, que mide otra base. Los lotes
  siguen con `tipo IS NULL`, igual que hoy.
