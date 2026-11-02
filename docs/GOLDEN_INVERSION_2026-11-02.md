# Las 20 preguntas de referencia del análisis de inversión · corrida del 02/11/2026

**Para German.** Son las 20 preguntas que P2 escribió como referencia del análisis
de inversión, corridas hoy contra el P2 real del Docker local (`:8000`) con el
modelo que redacta (`claude-opus-5-5`) y el que planifica (`claude-haiku-4-5`).
Acá están las 20 respuestas enteras, tal como las manda P2, para que las leas
como las leería un inversor y digas cuáles valen como referencia y cuáles hay
que cambiar (la pregunta, la respuesta esperada o las dos).

**Cómo leerlo.** Cada pregunta trae: lo que P2 esperaba (su rúbrica, en
palabras), lo que hizo FINDER (búsquedas, tabla, selección y la lectura en
prosa, sin tocar una coma) y un espacio para tu veredicto. En la web, la
persona ve exactamente esto en el panel "Lectura de FINDER · inversión": los
pasos con sus conteos, la tabla, la prosa y la selección con el «Por qué».

**Resultado de la corrida.** Las 20 pasaron la rúbrica de P2: 16 con
análisis y 4 en las que P2 decidió que el listado alcanza. Costo total
US$ 0.71 (16 análisis, unos 4,5 centavos cada uno). Hubo que
correrlas en cuatro tandas: el guion de P2 no manda `X-Visitor-Id` y cae en el
freno de 6 por minuto a partir de la séptima (la web de P1 sí lo manda, así que
no la afecta). Reportes crudos de P2 en `paradisofinder-core/tests/reports/invest_qa_20261102_*_p1golden*.md`.

## Resumen

| # | Pregunta | Qué hizo FINDER | Búsquedas | Terminó en | Señales de la rúbrica de P2 | Tu veredicto |
|---|---|---|---|---|---|---|
| 1 | departamentos para invertir en Capital | sin análisis (el listado alcanza) | 0 | 0,9 s | — | |
| 2 | Tengo 80 mil dólares para invertir en San Juan y quiero comp | análisis de comparación | 2 | 8,6 s | todo en orden | |
| 3 | qué conviene comprar para invertir en Pocito | análisis de selección | 2 | 8,2 s | todo en orden | |
| 4 | en qué zona de San Juan conviene invertir en departamentos | análisis de zona | 2 | 7,8 s | todo en orden | |
| 5 | tengo 60 mil dólares, ¿qué me conviene comprar para rentar e | análisis de selección | 2 | 9,2 s | todo en orden | |
| 6 | ¿conviene más un dúplex en Rivadavia o un departamento de 2  | análisis de comparación | 2 | 8,3 s | todo en orden | |
| 7 | tengo 30 millones de pesos, ¿qué puedo comprar para alquilar | análisis de selección | 2 | 9,5 s | todo en orden | |
| 8 | quiero comprar algo para revender en un par de años, ¿qué me | análisis de selección | 2 | 15,4 s | no cubre todas las opciones; 1 descarte(s) de la guardia | |
| 9 | ¿Rawson o Chimbas para invertir en casas? | análisis de comparación | 3 | 7,4 s | todo en orden | |
| 10 | ¿qué rentabilidad puedo esperar en Santa Lucía? | análisis de zona | 1 | 7,6 s | todo en orden | |
| 11 | busco un departamento cerca de la universidad para alquilarl | análisis de propiedad | 1 | 8,4 s | todo en orden | |
| 12 | ¿conviene invertir en Capital ahora o la zona está cara? | análisis de zona | 2 | 8,4 s | no cita las lecturas | |
| 13 | casa con cochera y patio para alquilar a una familia, en Riv | análisis de propiedad | 1 | 8,4 s | todo en orden | |
| 14 | departamento de 1 dormitorio o monoambiente en Capital, ¿cuá | análisis de comparación | 2 | 8,5 s | no cita las lecturas | |
| 15 | ¿me conviene invertir en un lote o en un departamento? | sin análisis (el listado alcanza) | 0 | 1,1 s | — | |
| 16 | quiero invertir en Mendoza | sin análisis (el listado alcanza) | 0 | 1,0 s | — | |
| 17 | con 40 mil dólares, ¿departamento usado en Capital o a estre | análisis de comparación | 2 | 8,5 s | todo en orden | |
| 18 | qué conviene para renta en Trinidad | análisis de selección | 2 | 9,2 s | todo en orden | |
| 19 | dame las 3 mejores oportunidades para invertir hoy en San Ju | sin análisis (el listado alcanza) | 0 | 0,9 s | — | |
| 20 | ¿es mejor comprar dos departamentos chicos o una casa grande | análisis de selección | 2 | 8,6 s | todo en orden | |

## Lo que vi al leerlas (P1, para orientar tu lectura; el veredicto es tuyo)

- **La misma propiedad aparece en 8 de los 16 análisis:** el departamento de 3 dormitorios en Capital a US$ 38.000 (rentabilidad estimada 13,8 %, 34 % por debajo de similares) es la elegida en las preguntas 2, 4, 5, 12, 17 y 20 y asoma en la 14. Es coherente con los datos, pero un lector que haga tres preguntas distintas ve siempre la misma recomendación.
- **Pregunta 9 (Rawson o Chimbas): la prosa contradice la tabla.** La tabla dice Rawson 12,1 % y Chimbas 13,6 %; la prosa dice "en Rawson el valor típico ronda el 11,8 %" y "en Chimbas el valor típico es 6,7 %". Los números de la prosa son los del resumen de zona (todas las propiedades, los mismos que muestra la pregunta 12), no los de las casas que buscó. Un inversor lo nota.
- **Pregunta 10 (Santa Lucía): dos rentabilidades que parecen pelearse.** "Valor típico 7,5 %" en los avisos y, en la misma lectura, "rentabilidad promedio de la zona 3,9 %, baja" con lectura en rojo. Son dos cosas distintas (lo estimado por aviso y el promedio de la zona), pero no se explica.
- **Pregunta 8 (revender): la más floja.** Tardó 15 s, la guardia descartó una oración donde el modelo se puso a escribir JSON, las tres elegidas traen un "Por qué" de una sola línea y la prosa menciona una casa de US$ 135.000 que no está en la selección. La rúbrica de P2 marca que no cubre todas las opciones.
- **Preguntas 15, 16 y 19: P2 decidió que el listado alcanza, y en la web no se ve nada.** "¿Lote o departamento?" (la nota de P2 esperaba que dijera que los lotes no se analizan), "quiero invertir en Mendoza" (el flujo normal pregunta la ciudad) y "dame las 3 mejores oportunidades" (el listado ya viene ordenado, pero son 10 y no 3). Son tres preguntas donde una oración ayudaría; hoy es silencio.
- **"Lectura en rojo" y "amarilla" en la prosa.** En las cards P1 nunca muestra rojo (regla 13: solo verde). La prosa de P2 sí dice "lectura para alquilar en rojo" (preguntas 4 y 10) y "amarilla" (2, 9, 11, 13). Es vocabulario de P3, pero conviene decidir si en la lectura va igual que en las cards.
- **Pregunta 7 (30 millones de pesos): elegidas con precios sospechosos.** Un departamento de 80 m² a US$ 10.000 y una casa de 300 m² a $ 25.000.000, ambos "93 % / 84 % más bajos que similares"; la prosa y el "Por qué" piden verificarlos, pero entran en la selección igual.
- **Pregunta 20: una zona que nadie nombró.** La pregunta no menciona zona y la prosa cierra con "en Rivadavia los precios de casas vienen en baja": la columna "Tendencia de la zona" de una búsqueda sin zona muestra la tendencia de una sola zona, sin decir cuál.
- **Lo que está bien en casi todas:** la primera oración decide ("sale mejor parado…"), los conteos de la prosa coinciden con los pasos, las elegidas traen un "Por qué" con números, los ajustes se dicen ("usado no es un estado del aviso", "Trinidad tomada como barrio", "partí el presupuesto"), y nunca inventa una zona ni un precio: lo que no tiene, lo dice ("sin datos", "ningún aviso tiene rentabilidad estimada"). Tiempos entre 7,4 y 9,5 s salvo la pregunta 8.

## Las 20, una por una

### 1. «departamentos para invertir en Capital»

**Lo que P2 esperaba:** no hace falta análisis: el listado alcanza. Nota de P2: «simple: una búsqueda alcanza; el flujo normal responde».

**Lo que hizo FINDER:** respondió que el listado alcanza y no abrió análisis (motivo de P2: `simple`), en 0,9 s. En la web no se ve nada más que el listado.

**Tu veredicto:** `[ ]` Bien · `[ ]` Regular · `[ ]` Mal

_¿Qué cambiarías? (respuesta, pregunta o las dos):_

---

### 2. «Tengo 80 mil dólares para invertir en San Juan y quiero comprar algo para alquilar. ¿Me conviene un departamento en Capital o una casa en Rivadavia? Priorizá la rentabilidad y que esté por debajo del precio de similares»

**Lo que P2 esperaba:** merece análisis; tipo: comparación; al menos 2 búsquedas; zonas: Capital, Rivadavia; tipos: departamento, casa; presupuesto hasta US$ 80.000; con tabla de comparación; la lectura nombra «Capital» y «Rivadavia». Nota de P2: «la pregunta de §0.1 del pedido».

**Lo que hizo FINDER:** análisis de **comparación**.

Búsquedas que hizo:
- Departamento en Capital hasta US$ 80.000 — 134 avisos, 92 con rentabilidad estimada
- Casa en Rivadavia hasta US$ 80.000 — 34 avisos, 3 con rentabilidad estimada

Tabla de comparación (tal cual la manda P2):

| Opción | Avisos | Con rentabilidad estimada | Rentabilidad anual estimada (valor típico) | Posición frente a avisos similares (valor típico) | Tendencia de la zona |
|---|---|---|---|---|---|
| Departamento en Capital hasta US$ 80.000 | 134 | 92 de 134 (69 %) | 9,2 % | 15 % por debajo de avisos similares | estable (-1,9 %) |
| Casa en Rivadavia hasta US$ 80.000 | 34 | 3 de 34 (9 %) | 11,5 % | 35 % por debajo de avisos similares | en baja (-4 %) |

Selección de FINDER (cada una con su «Por qué», texto de P2):
- Departamento en Capital · US$ 38.000 — Rentabilidad anual estimada 13,8 %, 34 % por debajo de avisos similares y lectura para alquilar verde
- Casa en Rivadavia · US$ 75.000 — Casa con rentabilidad anual estimada 13,7 % y 33 % por debajo de avisos similares; sin datos de rentabilidad de la zona
- Departamento en Capital · US$ 42.000 — Rentabilidad anual estimada 12,4 %, 27 % por debajo de avisos similares, lectura para alquilar verde
- Departamento en Capital · US$ 35.000 — Rentabilidad anual estimada 11 %, más barato que el 100 % de los avisos similares; el precio viene bajando
- Casa en Rivadavia · US$ 80.000 — Casa a US$ 80.000 con rentabilidad anual estimada 10,1 % y 32 % por debajo de avisos similares

**Lectura (la prosa, palabra por palabra):**

> Según las lecturas, el departamento en Capital sale mejor parado para alquilar. Encontré 134 departamentos en Capital hasta US$ 80.000: 92 tienen rentabilidad anual estimada, con valor típico de 9,2 %, y la zona está estable (-1,9 % en 4 semanas). En Rivadavia solo 3 de 34 casas tienen rentabilidad estimada. Ahí todas tienen lectura para alquilar amarilla y la zona viene en baja (-4 % en 4 semanas), aunque se ubican 35 % por debajo de avisos similares. Te conviene mirar el departamento de US$ 38.000 con 3 dormitorios: tiene 13,8 % de rentabilidad anual estimada, podría alquilarse a ≈ US$ 436/mes y está 34 % por debajo de avisos similares. En Rivadavia, la casa de US$ 75.000 tiene 13,7 % de rentabilidad anual estimada, pero la lectura indica que no hay datos de rentabilidad de la zona.

Tiempos: plan 1,8 s, propiedades elegidas a los 5,8 s, terminado en 8,6 s.

**Tu veredicto:** `[ ]` Bien · `[ ]` Regular · `[ ]` Mal

_¿Qué cambiarías? (respuesta, pregunta o las dos):_

---

### 3. «qué conviene comprar para invertir en Pocito»

**Lo que P2 esperaba:** merece análisis; tipo: selección; zonas: Pocito; la primera oración habla de «rentabilidad». Nota de P2: «zona sin rentabilidad: se dice en la primera oración».

**Lo que hizo FINDER:** análisis de **selección**.

Búsquedas que hizo:
- Departamentos para invertir en Pocito — 2 avisos, 0 con rentabilidad estimada
- Casas para invertir en Pocito — 122 avisos, 0 con rentabilidad estimada

Tabla de comparación (tal cual la manda P2):

| Opción | Avisos | Con rentabilidad estimada | Rentabilidad anual estimada (valor típico) | Posición frente a avisos similares (valor típico) | Tendencia de la zona |
|---|---|---|---|---|---|
| Departamentos para invertir en Pocito | 2 | 0 de 2 (0 %) | sin datos | 31 % por debajo de avisos similares | sin datos |
| Casas para invertir en Pocito | 122 | 0 de 122 (0 %) | sin datos | 29 % por debajo de avisos similares | sin datos |

Selección de FINDER (cada una con su «Por qué», texto de P2):
- Casa en Pocito · US$ 75.000 — Casa de 4 dorm a US$ 75.000, 33 % por debajo de avisos similares; lectura verde para alquilar y para reventa
- Casa en Pocito · US$ 65.000 — US$ 65.000 con 4 dorm, más barato que el 80 % de los avisos similares; lecturas verdes
- Casa en Pocito · US$ 44.872 — 34 % por debajo de avisos similares, más barato que el 87 %; zona en suba (+2,3 % en 4 semanas)
- Departamento en Pocito · US$ 26.500 — Departamento a US$ 26.500, 31 % por debajo de avisos similares; publicado hace más de 6 meses, margen para negociar
- Casa en Pocito · US$ 60.000 — US$ 60.000, 30 % por debajo de avisos similares, zona en suba (+2,3 % en 4 semanas), margen para negociar

**Lectura (la prosa, palabra por palabra):**

> En Pocito ningún aviso tiene rentabilidad estimada: no hay alquileres similares publicados con los que estimarla, aunque la lectura para alquilar cita una rentabilidad promedio de la zona de 8,2 %, alta. Busqué departamentos y casas: encontré 2 departamentos y 122 casas, y en las casas la posición típica es 29 % por debajo de avisos similares, con tendencia de la zona sin datos todavía. Te conviene mirar primero la casa de 4 dormitorios a US$ 75.000, 33 % por debajo de avisos similares, y la de US$ 65.000, más barata que el 80 % de los avisos similares. También están la casa a ≈ US$ 44.872, 34 % por debajo de avisos similares en zona en suba, y un departamento a US$ 26.500 con margen para negociar.

Tiempos: plan 1,4 s, propiedades elegidas a los 6,0 s, terminado en 8,2 s.

**Tu veredicto:** `[ ]` Bien · `[ ]` Regular · `[ ]` Mal

_¿Qué cambiarías? (respuesta, pregunta o las dos):_

---

### 4. «en qué zona de San Juan conviene invertir en departamentos»

**Lo que P2 esperaba:** merece análisis; tipo: zona; tipos: departamento; con tabla de comparación; resume al menos 4 zonas; la lectura nombra «Capital». Nota de P2: «resúmenes de zona; la prosa nombra cuáles tienen rentabilidad y cuáles no».

**Lo que hizo FINDER:** análisis de **zona**.

Búsquedas que hizo:
- Departamentos para invertir en San Juan — 673 avisos, 406 con rentabilidad estimada
- Resumen de 19 zonas — 673 avisos

Tabla de comparación (tal cual la manda P2):

| Opción | Avisos | Con rentabilidad estimada | Rentabilidad anual estimada (valor típico) | Posición frente a avisos similares (valor típico) | Tendencia de la zona |
|---|---|---|---|---|---|
| Zona Capital | 399 | 296 de 399 (74 %) | 8,6 % | 12 % por debajo de avisos similares | estable (-1,9 %) |
| Zona Rivadavia | 153 | 84 de 153 (55 %) | 6,6 % | 3 % por debajo de avisos similares | estable (+0,8 %) |
| Zona Santa Lucía | 58 | 25 de 58 (43 %) | 5,9 % | en línea con avisos similares | en suba (+3,5 %) |
| Zona Rawson | 42 | 1 de 42 (2 %) | 8,2 % | 4 % por debajo de avisos similares | sin datos |
| Zona Chimbas | 11 | 0 de 11 (0 %) | sin datos | 35 % por debajo de avisos similares | sin datos |
| Zona Albardón | 2 | 0 de 2 (0 %) | sin datos | sin datos | sin datos |
| Zona Caucete | 2 | 0 de 2 (0 %) | sin datos | sin datos | sin datos |
| Zona Pocito | 2 | 0 de 2 (0 %) | sin datos | 31 % por debajo de avisos similares | sin datos |
| Zona Calingasta | 1 | 0 de 1 (0 %) | sin datos | sin datos | sin datos |
| Zona Iglesia | 1 | 0 de 1 (0 %) | sin datos | sin datos | sin datos |
| Zona 9 de Julio | 1 | 0 de 1 (0 %) | sin datos | 35 % por encima de avisos similares | sin datos |
| Zona Sarmiento | 1 | 0 de 1 (0 %) | sin datos | sin datos | sin datos |
| Zona Angaco | 0 | 0 | sin datos | sin datos | sin datos |
| Zona Jáchal | 0 | 0 | sin datos | sin datos | sin datos |
| Zona San Martín | 0 | 0 | sin datos | sin datos | sin datos |
| Zona Ullum | 0 | 0 | sin datos | sin datos | sin datos |
| Zona Valle Fértil | 0 | 0 | sin datos | sin datos | sin datos |
| Zona 25 de Mayo | 0 | 0 | sin datos | sin datos | sin datos |
| Zona Zonda | 0 | 0 | sin datos | sin datos | sin datos |

Selección de FINDER (cada una con su «Por qué», texto de P2):
- Departamento en Capital · US$ 38.000 — Capital, US$ 38.000, rentabilidad anual estimada 13,8 %, 34 % por debajo de avisos similares; lecturas verdes
- Departamento en Capital · US$ 42.000 — Capital, US$ 42.000, rentabilidad anual estimada 12,4 %, lectura para alquilar verde
- Departamento en Capital · US$ 35.000 — Capital, US$ 35.000, rentabilidad anual estimada 11 %, 29 % por debajo de avisos similares
- Departamento en Capital · US$ 90.000 — Capital, podría alquilarse a ≈ US$ 671/mes, 8,9 % estimado, 33 % por debajo de avisos similares
- Departamento en Rivadavia · US$ 35.000 — Rivadavia, US$ 35.000, rentabilidad anual estimada 9,9 %, 35 % por debajo de avisos similares

**Lectura (la prosa, palabra por palabra):**

> Revisé las 19 zonas de San Juan. Albardón, Calingasta, Caucete, Chimbas, Iglesia, 9 de Julio, Pocito y Sarmiento no tienen ningún aviso con rentabilidad estimada, porque no hay alquileres similares publicados con los que estimarla, y en Rawson solo 1 de 42 la tiene. Capital es la zona con más respaldo: 296 de 399 avisos tienen rentabilidad anual estimada, con un valor típico de 8,6 % y la mitad entre 7,5 % y 9,4 %. Le siguen Rivadavia, con un valor típico de 6,6 %, y Santa Lucía, con 5,9 %, donde los 58 avisos tienen lectura para alquilar en rojo. Te conviene mirar en Capital un departamento de US$ 38.000 con 13,8 % estimado, 34 % por debajo de avisos similares.

Tiempos: plan 1,1 s, propiedades elegidas a los 5,3 s, terminado en 7,8 s.

**Tu veredicto:** `[ ]` Bien · `[ ]` Regular · `[ ]` Mal

_¿Qué cambiarías? (respuesta, pregunta o las dos):_

---

### 5. «tengo 60 mil dólares, ¿qué me conviene comprar para rentar en el Gran San Juan?»

**Lo que P2 esperaba:** merece análisis; tipo: selección o comparación; zonas: Capital, Rivadavia, Santa Lucía, Rawson, Chimbas; presupuesto hasta US$ 60.000. Nota de P2: «'renta' es compra; Gran San Juan = 5 zonas».

**Lo que hizo FINDER:** análisis de **selección**.

Búsquedas que hizo:
- Departamentos en Gran San Juan hasta US$ 60.000 — 309 avisos, 142 con rentabilidad estimada
- Casas en Gran San Juan hasta US$ 60.000 — 240 avisos, 5 con rentabilidad estimada

Tabla de comparación (tal cual la manda P2):

| Opción | Avisos | Con rentabilidad estimada | Rentabilidad anual estimada (valor típico) | Posición frente a avisos similares (valor típico) | Tendencia de la zona |
|---|---|---|---|---|---|
| Departamentos en Gran San Juan hasta US$ 60.000 | 309 | 142 de 309 (46 %) | 9,3 % | 12 % por debajo de avisos similares | estable (-1,9 %) |
| Casas en Gran San Juan hasta US$ 60.000 | 240 | 5 de 240 (2 %) | 15 % | 27 % por debajo de avisos similares | en suba (+3,4 %) |

Selección de FINDER (cada una con su «Por qué», texto de P2):
- Departamento en Capital · US$ 38.000 — Rentabilidad anual estimada 13,8 %, 34 % por debajo de avisos similares, lecturas verdes para alquilar y reventa
- Casa en Chimbas · US$ 43.000 — Casa en Chimbas con rentabilidad anual estimada 13,4 % y lectura para alquilar verde: rentabilidad de zona 11,8 % alta
- Departamento en Capital · US$ 42.000 — Rentabilidad anual estimada 12,4 %, podría alquilarse a ≈ US$ 436/mes, lectura para alquilar verde
- Casa en Chimbas · US$ 42.000 — Casa en Chimbas con rentabilidad anual estimada 13,7 %, 22 % por debajo de avisos similares
- Departamento en Capital · US$ 35.000 — Rentabilidad anual estimada 11 %, más barato que el 100 % de los avisos similares, el precio viene bajando

**Lectura (la prosa, palabra por palabra):**

> Busqué departamentos y casas en el Gran San Juan hasta US$ 60.000. En departamentos encontré 309 avisos, 142 con rentabilidad anual estimada, y la mitad de ellos está entre 8,6 % y 10 %. En casas solo 5 de 240 tienen rentabilidad estimada. Te conviene mirar primero el departamento de 3 dorm en Capital a US$ 38.000: tiene rentabilidad anual estimada de 13,8 %, podría alquilarse a ≈ US$ 436/mes y está 34 % por debajo de avisos similares, con lectura verde para alquilar y para reventa. En casas se destacan dos en Chimbas, a US$ 43.000 y US$ 42.000, con 13,4 % y 13,7 % de rentabilidad anual estimada. Su lectura para alquilar marca una rentabilidad promedio de la zona de 11,8 %, alta, aunque la zona muestra tendencia en baja de -5,8 % en 4 semanas.

Tiempos: plan 1,8 s, propiedades elegidas a los 6,6 s, terminado en 9,2 s.

**Tu veredicto:** `[ ]` Bien · `[ ]` Regular · `[ ]` Mal

_¿Qué cambiarías? (respuesta, pregunta o las dos):_

---

### 6. «¿conviene más un dúplex en Rivadavia o un departamento de 2 dormitorios en Capital para alquilar?»

**Lo que P2 esperaba:** merece análisis; tipo: comparación; al menos 2 búsquedas; zonas: Rivadavia, Capital; con tabla de comparación; dúplex como filtro; filtros: bedrooms; la lectura nombra «Rivadavia» y «Capital». Nota de P2: «dúplex como atributo, no como tipo».

**Lo que hizo FINDER:** análisis de **comparación**.

Búsquedas que hizo:
- Dúplex en Rivadavia para renta — 9 avisos, 4 con rentabilidad estimada
- Departamento 2 dormitorios en Capital para renta — 130 avisos, 106 con rentabilidad estimada

Tabla de comparación (tal cual la manda P2):

| Opción | Avisos | Con rentabilidad estimada | Rentabilidad anual estimada (valor típico) | Posición frente a avisos similares (valor típico) | Tendencia de la zona |
|---|---|---|---|---|---|
| Dúplex en Rivadavia para renta | 9 | 4 de 9 (44 %) | 4,8 % | 35 % por encima de avisos similares | estable (-1,7 %) |
| Departamento 2 dormitorios en Capital para renta | 130 | 106 de 130 (82 %) | 6,9 % | 1 % por debajo de avisos similares | estable (-0,2 %) |

Selección de FINDER (cada una con su «Por qué», texto de P2):
- Departamento en Capital · US$ 55.000 — 2 dorm en Capital a US$ 55.000, rentabilidad anual estimada 9,7 % y 23 % por debajo de avisos similares, aviso vigente
- Departamento en Capital · US$ 54.000 — Rentabilidad anual estimada 10 %, podría alquilarse a ≈ US$ 449/mes, publicado hace 7 días
- Departamento en Capital · US$ 58.000 — Más barato que el 94 % de los avisos similares, rentabilidad anual estimada 9,3 %, margen para negociar
- Departamento en Capital · US$ 85.000 — 90 m² a US$ 85.000, 29 % por debajo de avisos similares, rentabilidad anual estimada 7,7 %
- Departamento en Rivadavia · US$ 78.000 — En Rivadavia: 31 % por debajo de avisos similares, rentabilidad anual estimada 7,4 % (≈ US$ 481/mes)

**Lectura (la prosa, palabra por palabra):**

> Según las lecturas y los números, el departamento de 2 dormitorios en Capital sale mejor parado. De los 9 dúplex encontrados en Rivadavia, solo 4 tienen rentabilidad anual estimada, con un valor típico de 4,8 % y una máxima de 7,4 %. Además, su posición típica frente a avisos similares es 35 % por encima. En Capital encontré 130 departamentos de 2 dormitorios, y 106 tienen rentabilidad anual estimada: la mitad está entre 5,5 % y 8,5 %, con un valor típico de 6,9 %, y la posición típica es 1 % por debajo de avisos similares. Te conviene mirar el de US$ 55.000, que tiene 9,7 % y está 23 % por debajo de avisos similares, y el de US$ 54.000, que tiene 10 % y podría alquilarse a ≈ US$ 449/mes.

Tiempos: plan 1,7 s, propiedades elegidas a los 5,7 s, terminado en 8,3 s.

**Tu veredicto:** `[ ]` Bien · `[ ]` Regular · `[ ]` Mal

_¿Qué cambiarías? (respuesta, pregunta o las dos):_

---

### 7. «tengo 30 millones de pesos, ¿qué puedo comprar para alquilar?»

**Lo que P2 esperaba:** merece análisis; tipo: selección o comparación; presupuesto hasta $ 30.000.000. Nota de P2: «presupuesto en pesos: se convierte con la cotización de P3».

**Lo que hizo FINDER:** análisis de **selección**; nota al usuario: «Presupuesto en pesos: 30 millones ARS. Ordenadas por rentabilidad.».

Búsquedas que hizo:
- Departamentos en San Juan hasta 30M ARS — 6 avisos, 0 con rentabilidad estimada
- Casas en San Juan hasta 30M ARS — 16 avisos, 0 con rentabilidad estimada

Tabla de comparación (tal cual la manda P2):

| Opción | Avisos | Con rentabilidad estimada | Rentabilidad anual estimada (valor típico) | Posición frente a avisos similares (valor típico) | Tendencia de la zona |
|---|---|---|---|---|---|
| Departamentos en San Juan hasta 30M ARS | 6 | 0 de 6 (0 %) | sin datos | 35 % por debajo de avisos similares | estable (-1,9 %) |
| Casas en San Juan hasta 30M ARS | 16 | 0 de 16 (0 %) | sin datos | 35 % por debajo de avisos similares | estable (+0,5 %) |

Selección de FINDER (cada una con su «Por qué», texto de P2):
- Departamento en Capital · US$ 19.231 — Depto 3 dorm en Capital a $ 30.000.000, 55 % más bajo que avisos similares; lectura para alquilar verde, rentabilidad de zona 7,7 %
- Departamento en Capital · US$ 10.000 — Depto 80 m² en Capital a US$ 10.000, 84 % más bajo que avisos similares; lectura para alquilar verde. Conviene verificar el aviso
- Casa en Capital · US$ 16.026 — Casa 300 m² en Capital a $ 25.000.000, 93 % más bajo que avisos similares y el precio viene bajando; conviene verificar
- Departamento en Rivadavia · US$ 9.615 — Depto 2 dorm en Rivadavia a $ 15.000.000, 79 % más bajo que avisos similares; lectura para alquilar amarillo, zona 6,7 %
- Casa en Albardón · US$ 19.231 — Casa 880 m² en Albardón a $ 30.000.000; rentabilidad promedio de la zona 9,6 %, alta, sin datos para evaluar el precio

**Lectura (la prosa, palabra por palabra):**

> Ninguno de los avisos encontrados tiene rentabilidad anual estimada: no hay alquileres similares publicados con los que estimarla. Busqué departamentos y casas en todo San Juan hasta 30 millones de pesos: encontré 6 departamentos y 16 casas, y en ambos casos el valor típico es 35 % por debajo de avisos similares. Te conviene mirar primero el departamento de 3 dormitorios en Capital a $ 30.000.000, 55 % más bajo que avisos similares, con lectura para alquilar verde y rentabilidad promedio de la zona 7,7 %, alta. También aparecen en Capital un departamento a US$ 10.000 y una casa de 300 m² a $ 25.000.000, pero la lectura del aviso dice que conviene verificarlos por la diferencia muy grande con avisos similares.

Tiempos: plan 2,1 s, propiedades elegidas a los 7,2 s, terminado en 9,5 s.

**Tu veredicto:** `[ ]` Bien · `[ ]` Regular · `[ ]` Mal

_¿Qué cambiarías? (respuesta, pregunta o las dos):_

---

### 8. «quiero comprar algo para revender en un par de años, ¿qué me conviene?»

**Lo que P2 esperaba:** merece análisis; tipo: selección o comparación; la lectura menciona «reventa» / «revender». Nota de P2: «foco reventa: la prosa debería apoyarse en la lectura para reventa y la posición frente a similares».

**Lo que hizo FINDER:** análisis de **selección**; nota al usuario: «Sin presupuesto: mostré opciones ordenadas por potencial de revalorización.».

Búsquedas que hizo:
- Departamentos para revender — 673 avisos, 406 con rentabilidad estimada
- Casas para revender — 1752 avisos, 517 con rentabilidad estimada

Tabla de comparación (tal cual la manda P2):

| Opción | Avisos | Con rentabilidad estimada | Rentabilidad anual estimada (valor típico) | Posición frente a avisos similares (valor típico) | Tendencia de la zona |
|---|---|---|---|---|---|
| Departamentos para revender | 673 | 406 de 673 (60 %) | 9,6 % | 35 % por debajo de avisos similares | estable (-1,9 %) |
| Casas para revender | 1752 | 517 de 1752 (30 %) | sin datos | 35 % por debajo de avisos similares | sin datos |

Selección de FINDER (cada una con su «Por qué», texto de P2):
- Departamento en Rivadavia · US$ 35.000 — Precio 35 % más bajo que avisos similares de la zona
- Departamento en Capital · US$ 75.000 — Precio 34 % más bajo que avisos similares de la zona
- Departamento en Capital · US$ 100.000 — Precio 35 % más bajo que avisos similares de la zona

_descartes de la guardia: [{'sentence': 'Perdón, corrijo el formato:\n\n{"picks": [{"id": "02b52f1f-0bfd-4976-bbc3-5586174b6c07", "reason": "Lectura para reventa v', 'reason': "número sin respaldo: ['4976', '5586174', '8955', '7851', '8645', '5332']"}]_

**Lectura (la prosa, palabra por palabra):**

> De los 50 de mejor puntaje en cada búsqueda, 49 tienen lectura para reventa verde y la posición típica es 35 % por debajo de avisos similares. Te conviene mirar primero el departamento de Capital de US$ 75.000, con 120 m² y 34 % por debajo de avisos similares, y el de Rivadavia de US$ 35.000, con lectura del aviso verde y 35 % más barato que avisos similares. También el de Capital de US$ 100.000 con 216 m², que lleva más de 6 meses publicado y deja margen para negociar. En casas, la de Rivadavia de US$ 135.000 figura 65 % por debajo de avisos similares, pero conviene verificar el aviso.

Tiempos: plan 1,7 s, propiedades elegidas a los 9,6 s, terminado en 15,4 s.
Señales de la rúbrica de P2: no cubre todas las opciones; 1 descarte(s) de la guardia.

**Tu veredicto:** `[ ]` Bien · `[ ]` Regular · `[ ]` Mal

_¿Qué cambiarías? (respuesta, pregunta o las dos):_

---

### 9. «¿Rawson o Chimbas para invertir en casas?»

**Lo que P2 esperaba:** merece análisis; tipo: comparación; al menos 2 búsquedas; zonas: Rawson, Chimbas; tipos: casa; con tabla de comparación; la lectura nombra «Rawson» y «Chimbas». Nota de P2: «dos zonas con poca o ninguna rentabilidad estimada en casas».

**Lo que hizo FINDER:** análisis de **comparación**.

Búsquedas que hizo:
- Casas para invertir en Rawson — 205 avisos, 24 con rentabilidad estimada
- Casas para invertir en Chimbas — 87 avisos, 11 con rentabilidad estimada
- Resumen de 2 zonas — 292 avisos

Tabla de comparación (tal cual la manda P2):

| Opción | Avisos | Con rentabilidad estimada | Rentabilidad anual estimada (valor típico) | Posición frente a avisos similares (valor típico) | Tendencia de la zona |
|---|---|---|---|---|---|
| Casas para invertir en Rawson | 205 | 24 de 205 (12 %) | 12,1 % | 20 % por debajo de avisos similares | en suba (+3,4 %) |
| Casas para invertir en Chimbas | 87 | 11 de 87 (13 %) | 13,6 % | 18 % por debajo de avisos similares | en baja (-5,8 %) |

Selección de FINDER (cada una con su «Por qué», texto de P2):
- Casa en Chimbas · US$ 43.000 — Chimbas: rentabilidad anual estimada 13,4 %, 26 % por debajo de avisos similares, lectura para alquilar y para reventa verdes
- Casa en Rawson · US$ 70.000 — Rawson: rentabilidad anual estimada 15,9 % (≈ US$ 929/mes), más barato que el 84 % de los avisos similares
- Casa en Chimbas · US$ 42.000 — Chimbas: rentabilidad anual estimada 13,7 %, podría alquilarse a ≈ US$ 481/mes, lecturas verdes
- Casa en Chimbas · US$ 32.000 — Chimbas a US$ 32.000, 27 % por debajo de avisos similares; sin rentabilidad estimada propia
- Casa en Rawson · US$ 50.000 — Rawson a US$ 50.000, 29 % por debajo de avisos similares, lectura del aviso verde

**Lectura (la prosa, palabra por palabra):**

> Encontré 205 casas en Rawson y 87 en Chimbas. Solo el 12 % y el 13 % tienen rentabilidad anual estimada. En Rawson el valor típico ronda el 11,8 %, la tendencia de la zona está en suba (+3,4 % en 4 semanas) y la lectura para alquilar es amarilla en todos los avisos. En Chimbas el valor típico es 6,7 %, pero tiene más lecturas verdes para alquilar y para reventa, aunque la tendencia de la zona está en baja (-5,8 %). Según las lecturas, te conviene mirar la casa de Chimbas a US$ 43.000, con 13,4 % y lecturas verdes. En Rawson destaca la de US$ 70.000, con 15,9 % y más barata que el 84 % de los avisos similares.

Tiempos: plan 1,5 s, propiedades elegidas a los 5,3 s, terminado en 7,4 s.

**Tu veredicto:** `[ ]` Bien · `[ ]` Regular · `[ ]` Mal

_¿Qué cambiarías? (respuesta, pregunta o las dos):_

---

### 10. «¿qué rentabilidad puedo esperar en Santa Lucía?»

**Lo que P2 esperaba:** merece análisis; tipo: zona o selección; zonas: Santa Lucía; la lectura menciona «rentabilidad». Nota de P2: «la respuesta tiene que salir de los números del resumen, no de memoria».

**Lo que hizo FINDER:** análisis de **zona**.

Búsquedas que hizo:
- Casas y departamentos en Santa Lucía — 284 avisos, 92 con rentabilidad estimada

Selección de FINDER (cada una con su «Por qué», texto de P2):
- Casa en Santa Lucía · US$ 130.000 — Rentabilidad anual estimada 15,7 % y precio 30 % más bajo que avisos similares de la zona
- Casa en Santa Lucía · US$ 115.000 — Rentabilidad anual estimada 16,7 %, podría alquilarse a ≈ US$ 1.603/mes; datos incompletos
- Casa en Santa Lucía · US$ 195.000 — Rentabilidad anual estimada 11,1 % y precio 30 % más bajo que avisos similares de la zona
- Casa en Santa Lucía · US$ 142.000 — Rentabilidad anual estimada 14,4 %, podría alquilarse a ≈ US$ 1.701/mes; precio en línea con la zona
- Departamento en Santa Lucía · US$ 60.000 — Departamento a US$ 60.000 con rentabilidad anual estimada 7,7 %, más barato que el 94 % de los avisos similares

**Lectura (la prosa, palabra por palabra):**

> Busqué casas y departamentos en Santa Lucía y encontré 284 avisos, de los cuales 92 tienen rentabilidad anual estimada: el valor típico es 7,5 %, la mitad está entre 6,7 % y 10,8 % y la máxima llega a 16,7 %. Ojo que la lectura para alquilar sale en rojo en los 50 avisos de mejor puntaje que revisé, con el texto Rentabilidad promedio de la zona 3,9 % — baja. Para casas, la zona muestra tendencia en suba de +9,8 % en 4 semanas y una referencia de precio de la zona de US$ 1.045/m². Te conviene mirar la casa de US$ 130.000, con rentabilidad anual estimada de 15,7 % y precio 30 % por debajo de avisos similares, y la de US$ 115.000, con 16,7 %, aunque tiene datos incompletos.

Tiempos: plan 1,1 s, propiedades elegidas a los 5,2 s, terminado en 7,6 s.

**Tu veredicto:** `[ ]` Bien · `[ ]` Regular · `[ ]` Mal

_¿Qué cambiarías? (respuesta, pregunta o las dos):_

---

### 11. «busco un departamento cerca de la universidad para alquilarle a estudiantes, hasta 50 mil»

**Lo que P2 esperaba:** puede merecer análisis o no; tipo: propiedad o selección; tipos: departamento; presupuesto hasta US$ 50.000; cercanía a un lugar. Nota de P2: «cercanía: `near` resuelto contra el catálogo de POI».

**Lo que hizo FINDER:** análisis de **propiedad**.

Búsquedas que hizo:
- Departamento cerca de la universidad hasta US$ 50.000 — 210 avisos, 70 con rentabilidad estimada

Selección de FINDER (cada una con su «Por qué», texto de P2):
- Departamento en Rivadavia · US$ 35.000 — US$ 35.000, rentabilidad anual estimada 9,9 %, 35 % por debajo de avisos similares y lectura para reventa verde
- Departamento en Rivadavia · US$ 35.000 — 2 dorm a US$ 35.000, rentabilidad anual estimada 12,1 % (≈ US$ 353/mes); publicado hace más de 6 meses
- Departamento en Rivadavia · US$ 39.000 — Rentabilidad anual estimada 8,9 %, 19 % por debajo de avisos similares y el precio del aviso viene bajando
- Departamento en Capital · US$ 45.000 — En Capital, rentabilidad anual estimada 8,6 % (≈ US$ 321/mes), zona en suba +6,5 % en 4 semanas
- Departamento en Rivadavia · US$ 37.000 — US$ 37.000, 1 dorm, rentabilidad anual estimada 8,3 % y 14 % por debajo de avisos similares

**Lectura (la prosa, palabra por palabra):**

> Encontré 210 departamentos cerca de la universidad hasta US$ 50.000, y 70 tienen rentabilidad anual estimada, con un valor típico de 8,2 %. Te conviene mirar primero el de Rivadavia a US$ 35.000, con 9,9 % y 35 % por debajo de avisos similares, más barato que el 100 % de los avisos similares. El de 2 dormitorios a US$ 35.000 tiene la rentabilidad más alta, 12,1 %, porque podría alquilarse a ≈ US$ 353/mes, aunque fue publicado hace 205 días. También están el de US$ 39.000 con 8,9 %, cuyo precio viene bajando, y uno en Capital con 8,6 %, en una zona con tendencia en suba. En todos, la lectura para alquilar es amarilla: la rentabilidad promedio de la zona es media.

Tiempos: plan 1,4 s, propiedades elegidas a los 6,0 s, terminado en 8,3 s.

**Tu veredicto:** `[ ]` Bien · `[ ]` Regular · `[ ]` Mal

_¿Qué cambiarías? (respuesta, pregunta o las dos):_

---

### 12. «¿conviene invertir en Capital ahora o la zona está cara?»

**Lo que P2 esperaba:** merece análisis; tipo: zona o selección; zonas: Capital; la lectura menciona «tendencia» / «en baja» / «en suba» / «estable» / «por encima» / «por debajo». Nota de P2: «'cara' tiene que salir de la posición frente a similares y la tendencia de P3, no de un juicio propio».

**Lo que hizo FINDER:** análisis de **zona**.

Búsquedas que hizo:
- Departamentos y casas para invertir en Capital — 1013 avisos, 579 con rentabilidad estimada
- Resumen de 5 zonas — 2126 avisos

Tabla de comparación (tal cual la manda P2):

| Opción | Avisos | Con rentabilidad estimada | Rentabilidad anual estimada (valor típico) | Posición frente a avisos similares (valor típico) | Tendencia de la zona |
|---|---|---|---|---|---|
| Zona Capital | 1013 | 579 de 1013 (57 %) | 12,3 % | 23 % por debajo de avisos similares | estable (-1,9 %) |
| Zona Rivadavia | 483 | 216 de 483 (45 %) | 9,9 % | 14 % por debajo de avisos similares | en baja (-4 %) |
| Zona Santa Lucía | 284 | 92 de 284 (32 %) | 8,7 % | 19 % por debajo de avisos similares | en suba (+9,8 %) |
| Zona Rawson | 248 | 25 de 248 (10 %) | 11,8 % | 20 % por debajo de avisos similares | en suba (+3,4 %) |
| Zona Chimbas | 98 | 11 de 98 (11 %) | 6,7 % | 17 % por debajo de avisos similares | en baja (-5,8 %) |

Selección de FINDER (cada una con su «Por qué», texto de P2):
- Casa en Capital · US$ 235.000 — Rentabilidad anual estimada 15,3 % y precio 34 % más bajo que avisos similares de la zona, con lecturas en verde.
- Departamento en Capital · US$ 38.000 — Departamento a US$ 38.000, más barato que el 94 % de los avisos similares, rentabilidad anual estimada 13,8 %.
- Casa en Capital · US$ 80.000 — Rentabilidad anual estimada 16,8 %, podría alquilarse a ≈ US$ 1.122/mes, 34 % por debajo de avisos similares.
- Casa en Capital · US$ 90.000 — Rentabilidad anual estimada 15 % y precio 33 % más bajo que avisos similares de la zona.
- Casa en Capital · US$ 140.000 — Podría alquilarse a ≈ US$ 1.603/mes, rentabilidad anual estimada 13,7 %, 33 % por debajo de avisos similares.

**Lectura (la prosa, palabra por palabra):**

> En Capital encontré 1013 avisos y 579 tienen rentabilidad anual estimada; entre los 100 de mejor puntaje, el valor típico es 12,3 % y la posición típica es 23 % por debajo de avisos similares, con la zona de departamentos en tendencia estable (-1,9 % en 4 semanas) y referencia de precio de la zona de US$ 867/m². Frente a las otras zonas revisadas, Capital tiene el valor típico más alto: Rivadavia 9,9 %, Rawson 11,8 %, Santa Lucía 8,7 % y Chimbas 6,7 %. Te conviene mirar la casa de US$ 235.000 con rentabilidad anual estimada 15,3 % y el departamento de US$ 38.000, más barato que el 94 % de los avisos similares.

Tiempos: plan 1,4 s, propiedades elegidas a los 6,4 s, terminado en 8,4 s.
Señales de la rúbrica de P2: no cita las lecturas.

**Tu veredicto:** `[ ]` Bien · `[ ]` Regular · `[ ]` Mal

_¿Qué cambiarías? (respuesta, pregunta o las dos):_

---

### 13. «casa con cochera y patio para alquilar a una familia, en Rivadavia, hasta 90 mil»

**Lo que P2 esperaba:** puede merecer análisis o no; zonas: Rivadavia; tipos: casa; presupuesto hasta US$ 90.000; filtros: parking, patio. Nota de P2: «una sola búsqueda con filtros: puede ser simple (skip) o propiedad».

**Lo que hizo FINDER:** análisis de **propiedad**.

Búsquedas que hizo:
- Casa con cochera y patio en Rivadavia hasta US$ 90.000 — 42 avisos (cochera y patio como filtros, repuesto a mano: el reporte de P2 cortó esa línea)

Selección de FINDER (cada una con su «Por qué», texto de P2):
- Casa en Rivadavia · US$ 85.000 — US$ 85.000, 3 dorm, rentabilidad anual estimada 12,1 % (≈ US$ 856/mes) y 24 % por debajo de avisos similares
- Casa en Rivadavia · US$ 80.000 — US$ 80.000, 3 dorm, 32 % por debajo de avisos similares, rentabilidad anual estimada 10,1 %, aviso actualizado hace 1 día
- Casa en Rivadavia · US$ 85.000 — Rentabilidad anual estimada 13,3 % (≈ US$ 942/mes), 370 m²; publicada hace más de 6 meses, margen para negociar
- Casa en Rivadavia · US$ 78.000 — 4 dorm a US$ 78.000, 29 % por debajo de avisos similares; sin rentabilidad estimada
- Casa en Rivadavia · US$ 80.000 — Rentabilidad anual estimada 11,5 %, pero publicado hace más de un año: verificar que siga disponible

**Lectura (la prosa, palabra por palabra):**

> Encontré 42 casas con cochera y patio en Rivadavia hasta US$ 90.000, y solo 4 tienen rentabilidad anual estimada, con un valor típico de 11,8 %. Te conviene mirar primero la de US$ 85.000 con 3 dormitorios, que podría alquilarse a ≈ US$ 856/mes (12,1 %) y está 24 % por debajo de avisos similares. La de US$ 80.000 está 32 % por debajo de avisos similares y estima 10,1 %. La de 370 m² estima 13,3 %, aunque lleva más de 6 meses publicada, lo que da margen para negociar. Para todas, la lectura para alquilar es amarilla, y la zona muestra tendencia en baja de -4 % en 4 semanas.

Tiempos: plan 1,6 s, propiedades elegidas a los 6,4 s, terminado en 8,4 s.

**Tu veredicto:** `[ ]` Bien · `[ ]` Regular · `[ ]` Mal

_¿Qué cambiarías? (respuesta, pregunta o las dos):_

---

### 14. «departamento de 1 dormitorio o monoambiente en Capital, ¿cuál rinde más?»

**Lo que P2 esperaba:** merece análisis; tipo: comparación; al menos 2 búsquedas; zonas: Capital; con tabla de comparación; filtros: bedrooms, rooms. Nota de P2: «comparación por tamaño dentro de la misma zona».

**Lo que hizo FINDER:** análisis de **comparación**.

Búsquedas que hizo:
- Departamento 1 dormitorio en Capital para renta — 78 avisos, 69 con rentabilidad estimada
- Monoambiente en Capital para renta — 23 avisos, 10 con rentabilidad estimada

Tabla de comparación (tal cual la manda P2):

| Opción | Avisos | Con rentabilidad estimada | Rentabilidad anual estimada (valor típico) | Posición frente a avisos similares (valor típico) | Tendencia de la zona |
|---|---|---|---|---|---|
| Departamento 1 dormitorio en Capital para renta | 78 | 69 de 78 (88 %) | 7 % | 2 % por debajo de avisos similares | en suba (+6,5 %) |
| Monoambiente en Capital para renta | 23 | 10 de 23 (43 %) | 6,8 % | 2 % por encima de avisos similares | en suba (+6,5 %) |

Selección de FINDER (cada una con su «Por qué», texto de P2):
- Departamento en Capital · US$ 35.000 — 1 dorm a US$ 35.000, rentabilidad anual estimada 11 % y 29 % por debajo de avisos similares; el precio viene bajando
- Departamento en Capital · US$ 35.000 — Rentabilidad anual estimada 9,6 %, precio 31 % más bajo que avisos similares; lectura para reventa verde (datos incompletos)
- Departamento en Capital · US$ 42.000 — 9,2 % estimado, 24 % por debajo de avisos similares y publicado hace más de 6 meses: margen para negociar
- Departamento en Capital · US$ 43.000 — Rentabilidad anual estimada 8,9 %, 23 % por debajo de avisos similares, lectura para reventa verde
- Departamento en Capital · US$ 40.000 — US$ 40.000, rentabilidad anual estimada 9,6 %, podría alquilarse a ≈ US$ 321/mes

**Lectura (la prosa, palabra por palabra):**

> Encontré que el departamento de 1 dormitorio sale mejor parado: de 78 avisos, 69 tienen rentabilidad anual estimada, con valor típico de 7 %, la mitad entre 5,8 % y 8,6 % y máxima de 11 %, y en general está 2 % por debajo de avisos similares. En monoambientes encontré 23 avisos y solo 10 tienen rentabilidad estimada, con valor típico de 6,8 % y máxima de 8,6 %, y en general están 2 % por encima de avisos similares. Te conviene mirar primero un 1 dormitorio a US$ 35.000 con rentabilidad anual estimada de 11 %, que podría alquilarse a ≈ US$ 321/mes y está 29 % por debajo de avisos similares. Además, la zona de Capital viene en suba, con +6,5 % en 4 semanas.

Tiempos: plan 1,8 s, propiedades elegidas a los 6,2 s, terminado en 8,4 s.
Señales de la rúbrica de P2: no cita las lecturas.

**Tu veredicto:** `[ ]` Bien · `[ ]` Regular · `[ ]` Mal

_¿Qué cambiarías? (respuesta, pregunta o las dos):_

---

### 15. «¿me conviene invertir en un lote o en un departamento?»

**Lo que P2 esperaba:** puede merecer análisis o no; tipo: comparación o selección. Nota de P2: «los lotes son otra vertical: el plan no puede buscarlos; se espera que lo diga (note/adjustments) y no invente».

**Lo que hizo FINDER:** respondió que el listado alcanza y no abrió análisis (motivo de P2: `simple`), en 1,1 s. En la web no se ve nada más que el listado.

**Tu veredicto:** `[ ]` Bien · `[ ]` Regular · `[ ]` Mal

_¿Qué cambiarías? (respuesta, pregunta o las dos):_

---

### 16. «quiero invertir en Mendoza»

**Lo que P2 esperaba:** puede merecer análisis o no; los ajustes dicen «desconocida». Nota de P2: «fuera de mercado: skip, o plan con la zona descartada en adjustments».

**Lo que hizo FINDER:** respondió que el listado alcanza y no abrió análisis (motivo de P2: `simple`), en 1,0 s. En la web no se ve nada más que el listado.

**Tu veredicto:** `[ ]` Bien · `[ ]` Regular · `[ ]` Mal

_¿Qué cambiarías? (respuesta, pregunta o las dos):_

---

### 17. «con 40 mil dólares, ¿departamento usado en Capital o a estrenar en Rivadavia?»

**Lo que P2 esperaba:** merece análisis; tipo: comparación; al menos 2 búsquedas; zonas: Capital, Rivadavia; presupuesto hasta US$ 40.000; con tabla de comparación; filtros: condition. Nota de P2: «'a estrenar' = condition new».

**Lo que hizo FINDER:** análisis de **comparación**; ajustes: «["'usado' no es un estado del aviso: se buscó sin filtro de estado"]».

Búsquedas que hizo:
- Departamento usado en Capital hasta US$ 40.000 — 32 avisos, 10 con rentabilidad estimada
- Departamento a estrenar en Rivadavia hasta US$ 40.000 — 1 avisos, 0 con rentabilidad estimada

Tabla de comparación (tal cual la manda P2):

| Opción | Avisos | Con rentabilidad estimada | Rentabilidad anual estimada (valor típico) | Posición frente a avisos similares (valor típico) | Tendencia de la zona |
|---|---|---|---|---|---|
| Departamento usado en Capital hasta US$ 40.000 | 32 | 10 de 32 (31 %) | 11,7 % | 35 % por debajo de avisos similares | estable (-1,9 %) |
| Departamento a estrenar en Rivadavia hasta US$ 40.000 | 1 | 0 de 1 (0 %) | sin datos | 9 % por encima de avisos similares | estable (0 %) |

Selección de FINDER (cada una con su «Por qué», texto de P2):
- Departamento en Capital · US$ 38.000 — Capital, US$ 38.000, 3 dorm: rentabilidad anual estimada 13,8 % y 34 % por debajo de avisos similares, lecturas verdes
- Departamento en Capital · US$ 36.000 — US$ 36.000, rentabilidad anual estimada 13,9 %, podría alquilarse a ≈ US$ 417/mes; lectura para alquilar verde
- Departamento en Capital · US$ 35.000 — US$ 35.000, rentabilidad anual estimada 14,3 %, 17 % por debajo de avisos similares; publicado hace 265 días
- Departamento en Capital · US$ 35.000 — US$ 35.000, 29 % por debajo de avisos similares y lectura para reventa verde: el precio del aviso viene bajando
- Departamento en Rivadavia · US$ 34.000 — Único aviso en Rivadavia: US$ 34.000, sin rentabilidad estimada, 9 % por encima de avisos similares

**Lectura (la prosa, palabra por palabra):**

> En Rivadavia ningún aviso tiene rentabilidad estimada: encontré uno solo, de US$ 34.000 y 24 m², 9 % por encima de avisos similares, con lectura amarilla de precio en línea con la zona y publicado hace 404 días. Como usado no es un estado del aviso, en Capital busqué sin ese filtro y encontré 32 departamentos, 10 con rentabilidad anual estimada, con valor típico de 11,7 % y la mitad entre 9,6 % y 13,5 %. Según las lecturas y los números, sale mejor parada la opción de Capital. Te conviene mirar el de US$ 38.000 con 3 dormitorios, que tiene una rentabilidad anual estimada de 13,8 %, está 34 % por debajo de avisos similares y tiene las tres lecturas en verde.

Tiempos: plan 1,9 s, propiedades elegidas a los 6,2 s, terminado en 8,5 s.

**Tu veredicto:** `[ ]` Bien · `[ ]` Regular · `[ ]` Mal

_¿Qué cambiarías? (respuesta, pregunta o las dos):_

---

### 18. «qué conviene para renta en Trinidad»

**Lo que P2 esperaba:** merece análisis; tipo: selección; barrio: Trinidad. Nota de P2: «barrio → place, nunca zona capital».

**Lo que hizo FINDER:** análisis de **selección**; ajustes: «["'trinidad' se buscó como barrio o localidad (place)"]».

Búsquedas que hizo:
- Departamentos para renta en Trinidad — 2 avisos, 2 con rentabilidad estimada
- Casas para renta en Trinidad — 16 avisos, 4 con rentabilidad estimada

Tabla de comparación (tal cual la manda P2):

| Opción | Avisos | Con rentabilidad estimada | Rentabilidad anual estimada (valor típico) | Posición frente a avisos similares (valor típico) | Tendencia de la zona |
|---|---|---|---|---|---|
| Departamentos para renta en Trinidad | 2 | 2 de 2 (100 %) | 9,3 % | 11 % por debajo de avisos similares | estable (-1,9 %) |
| Casas para renta en Trinidad | 16 | 4 de 16 (25 %) | 12,1 % | 15 % por debajo de avisos similares | estable (+0,5 %) |

Selección de FINDER (cada una con su «Por qué», texto de P2):
- Casa en Capital · US$ 90.000 — Rentabilidad anual estimada 15 %, podría alquilarse a ≈ US$ 1.122/mes y 21 % por debajo de avisos similares
- Casa en Capital · US$ 100.000 — Rentabilidad anual estimada 13,5 %, 23 % por debajo de avisos similares; publicado hace más de 6 meses, margen para negociar
- Departamento en Capital · US$ 69.000 — Departamento de US$ 69.000 con rentabilidad anual estimada 8,5 % y lectura para alquilar verde
- Departamento en Capital · US$ 50.000 — Departamento de US$ 50.000 con rentabilidad anual estimada 10,2 %; publicado hace más de un año, verificar disponibilidad
- Casa en Capital · US$ 125.000 — Rentabilidad anual estimada 10,8 % con precio en línea con la zona

**Lectura (la prosa, palabra por palabra):**

> Busqué departamentos y casas en Trinidad, tomada como barrio o localidad. En casas encontré 16 avisos, pero solo 4 tienen rentabilidad anual estimada, con un valor típico de 12,1 %. Entre ellas te conviene mirar primero una de US$ 90.000 con 15 %, que podría alquilarse a ≈ US$ 1.122/mes y está 21 % por debajo de avisos similares, y otra de US$ 100.000 con 13,5 % y margen para negociar. En departamentos aparecieron solo 2 avisos, ambos con rentabilidad estimada: uno de US$ 69.000 con 8,5 % y lectura para alquilar verde, y otro de US$ 50.000 con 10,2 % que conviene verificar porque está publicado hace más de un año. Según las lecturas, las casas salen mejor paradas para renta.

Tiempos: plan 1,5 s, propiedades elegidas a los 6,8 s, terminado en 9,2 s.

**Tu veredicto:** `[ ]` Bien · `[ ]` Regular · `[ ]` Mal

_¿Qué cambiarías? (respuesta, pregunta o las dos):_

---

### 19. «dame las 3 mejores oportunidades para invertir hoy en San Juan»

**Lo que P2 esperaba:** puede merecer análisis o no; al menos 3 propiedades elegidas. Nota de P2: «puede ser simple (el flujo normal ya ordena por puntaje) o selección».

**Lo que hizo FINDER:** respondió que el listado alcanza y no abrió análisis (motivo de P2: `simple`), en 0,9 s. En la web no se ve nada más que el listado.

**Tu veredicto:** `[ ]` Bien · `[ ]` Regular · `[ ]` Mal

_¿Qué cambiarías? (respuesta, pregunta o las dos):_

---

### 20. «¿es mejor comprar dos departamentos chicos o una casa grande para alquilar, con 120 mil?»

**Lo que P2 esperaba:** merece análisis; tipo: comparación o selección; al menos 2 búsquedas; tipos: departamento, casa; con tabla de comparación; la lectura menciona «departamento» / «casa». Nota de P2: «el plan tiene que partir el presupuesto (60 mil por departamento) y decirlo en note; con 2 búsquedas hay tabla aunque la rotule selección».

**Lo que hizo FINDER:** análisis de **selección**; nota al usuario: «Partí el presupuesto: 60 mil por departamento para dos unidades.».

Búsquedas que hizo:
- Dos departamentos chicos hasta US$ 60.000 — 314 avisos, 142 con rentabilidad estimada
- Casa grande hasta US$ 120.000 — 995 avisos, 146 con rentabilidad estimada

Tabla de comparación (tal cual la manda P2):

| Opción | Avisos | Con rentabilidad estimada | Rentabilidad anual estimada (valor típico) | Posición frente a avisos similares (valor típico) | Tendencia de la zona |
|---|---|---|---|---|---|
| Dos departamentos chicos hasta US$ 60.000 | 314 | 142 de 314 (45 %) | 9,1 % | 20 % por debajo de avisos similares | estable (-1,9 %) |
| Casa grande hasta US$ 120.000 | 995 | 146 de 995 (15 %) | 15 % | 28 % por debajo de avisos similares | en baja (-4 %) |

Selección de FINDER (cada una con su «Por qué», texto de P2):
- Casa en Capital · US$ 90.000 — Casa en Capital a US$ 90.000, rentabilidad anual estimada 15 % y lectura para alquilar verde: rentabilidad de zona 7,7 % alta
- Departamento en Capital · US$ 38.000 — Depto en Capital a US$ 38.000, rentabilidad anual estimada 13,8 %, 34 % por debajo de avisos similares, lectura para alquilar verde
- Casa en Capital · US$ 70.000 — Casa en Capital a US$ 70.000 con rentabilidad anual estimada 18,4 %, lectura para alquilar verde; datos incompletos
- Departamento en Capital · US$ 35.000 — Depto en Capital a US$ 35.000, rentabilidad anual estimada 11 %, más barato que el 100 % de los avisos similares
- Departamento en Rivadavia · US$ 35.000 — Depto en Rivadavia a US$ 35.000, rentabilidad anual estimada 9,9 %, 35 % por debajo de avisos similares

**Lectura (la prosa, palabra por palabra):**

> Busqué departamentos de hasta US$ 60.000 cada uno y casas de hasta US$ 120.000. Para alquilar sale mejor parada la casa: en lo encontrado, las casas tienen una rentabilidad anual estimada típica del 15 % contra 9,1 % en departamentos, aunque solo 146 de 995 casas tienen estimación. Te conviene mirar la casa en Capital de US$ 90.000, que podría alquilarse a ≈ US$ 1.122/mes, con 15 % y lectura para alquilar verde. Si preferís dos unidades, el departamento en Capital de US$ 38.000 (13,8 %) junto al de US$ 35.000 (11 %) suman US$ 73.000. Tené en cuenta que en Rivadavia los precios de casas vienen en baja, -4 % en 4 semanas.

Tiempos: plan 1,7 s, propiedades elegidas a los 6,2 s, terminado en 8,6 s.

**Tu veredicto:** `[ ]` Bien · `[ ]` Regular · `[ ]` Mal

_¿Qué cambiarías? (respuesta, pregunta o las dos):_

---

