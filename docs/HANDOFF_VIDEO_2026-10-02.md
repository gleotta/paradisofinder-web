# Handoff para grabar el video demo — FINDER San Juan — 2026-10-02

**Para: quien graba y edita el video demo (German y edición).** Copia versionada del
documento compartido (https://claude.ai/code/artifact/20ed7168-800f-4343-b15f-549919ed348d).
Las cifras son de producción al 02/10/2026; el día de la grabación se vuelven a medir con
`scripts/video-gate.mjs` (sección 7).

---

## 1. Objetivo y mensaje

El video muestra una consulta de venta real, en producción, y deja una sola idea: FINDER te
dice, para cada casa, si el precio está por debajo de lo que piden casas similares, cuánto,
contra cuántas y cómo viene la zona. Es el objetivo que fijó German el 28/09 al rediseñar las
cards. Se graba contra producción y el guion va como texto (German, 04/10): las líneas
"Se dice" son ese texto.

Tres frases que tienen que quedar en el espectador:

- "Escribís lo que buscás, como lo dirías": texto libre, sin filtros.
- "Cada casa viene con su comparación": X % por debajo de N casas similares de la zona y de
  superficie parecida, y el m² típico de la zona al lado.
- "Son valores orientativos": salen de avisos publicados, no de operaciones. Es el aviso que
  cierra cada card y hay que leerlo en voz alta una vez.

Lo que el video no es: un tutorial de la app, ni una demo de Invertir o Lotes (sección 5).
Dura lo que dura una búsqueda y un detalle: entre 60 y 90 segundos.

## 2. Estado al 02/10: todo en producción y verificado

Se graba contra producción: https://paradisofinder.com, con P1 en el commit `0ba1a2d` y P2
en la versión del 01/10, por la red privada de Railway. Los datos son de la corrida de P3 de
la semana del 28/09.

| Verificación (01/10, en producción) | Resultado |
|---|---|
| Batería de cards en modo contrato, mobile 380 px (37 pruebas) | 37 pasan, 0 fallan |
| Gate del video sobre "casas en venta hasta 100 mil dólares" | pasa: 20 de 20 con posición, Zona y aviso de estimación; 1 "En baja" en el top 20; sin texto prohibido; sin rojo ni amarillo |
| Gate del video sobre "casas en venta en capital" | pasa: 2 "En baja" en el top 20; Zona con celda propia en las 20 |
| Detalle (similares, mapa, Consultar) | funciona en las dos consultas. Desde el 03/10 el detalle muestra 5 similares con foto, la propiedad intercalada y la tira de precios (verificado el 04/10 en local contra el P2 real: 5 de 5 fotos, "Ver los 29 similares"); el gate del día lo repite contra producción |

Lo que cambia de un día a otro, y por eso el gate se repite el día de la grabación: el orden
del top 20, las flechas "En baja" (P3 mira solo las últimas tres corridas) y el m² típico de
la zona (se recalcula los lunes).

## 3. La consulta: "casas en venta hasta 100 mil dólares"

Recomendada: **"casas en venta hasta 100 mil dólares"**, con el selector en Comprar. Da 820
resultados en seis zonas, y la primera pantalla (10 cards, sin scroll) tiene todo lo que el
video quiere mostrar. Top 20 medido en producción el 02/10:

| # | Card | Por qué sirve |
|---|---|---|
| 1 | Casa en Rawson, US$ 47.000, 3 dorm., 100 m² cub. · 341 m² lote | 33 % por debajo de 30 casas similares; Zona Rawson m² US$ 614 "En baja 2,3 %" en neutro. Datos completos: su detalle tiene mapa, 30 similares (5 a la vista con foto y "Ver los 29 similares" para el resto) y WhatsApp de la inmobiliaria. **Es la card del plano del detalle.** |
| 2 | Casa en Capital, $ 75.000.000 (≈ US$ 48.544) | Precio publicado en pesos con su conversión al lado: FINDER compara en dólares. |
| 3 | Casa en Caucete, $ 80.000.000 | "9 casas en Caucete" y Zona "(zona ampliada)": la honestidad cuando hay pocos avisos. |
| 4 | Casa en Chimbas, US$ 47.000 | Zona Chimbas "En baja 11,3 %" en neutro; "publicado hace 3 meses · margen para negociar". |
| 6 | Casa en Pocito, US$ 45.000 | Chips "Apto crédito · En construcción · Cochera · +1". |
| 8 | Casa en Rivadavia, US$ 65.000, 2 dorm. | **"En baja 13 % · antes US$ 75.000"**, en verde: la única flecha del top 20. Datos incompletos: no abrir su detalle, no tiene mapa. |
| 9 y 10 | Casas en Rivadavia, US$ 75.000, 4 dorm. | Zona Rivadavia **"En suba 2,8 %" en verde**: el otro verde que existe en la card. |

**Alternativa 1: "casas en venta en capital"** (614 resultados). Todo Capital, Zona con celda
propia en las 20, dos flechas "En baja" (#11 con 8 % y #16 con 25 %). Contra: las dos están
en la segunda tanda de 10, hay que scrollear para mostrarlas.

**Alternativa 2: "casas en venta hasta 100 mil dólares en Rivadavia"** (119 resultados; es la
consulta que nombraba el plan del 29/09). "En baja 13 %" en la #2 y siete Zonas "En suba" en
verde. Contra: las cinco primeras cards son avisos sin ubicación exacta (se ven más tenues):
su detalle no tiene mapa y el puntaje muestra el tope "Datos incompletos". Si se usa, el plano
del detalle abre la #6 (Casa en Rivadavia, US$ 85.000, 90 m² cub.) o una posterior.

En ninguna de las tres hay hoy cards "35 %+ · verificar el aviso" ni fondos de alarma en el
top 20. Las tres pasan el gate.

## 4. Guion plano por plano (60 a 90 segundos)

Seis planos, en el orden en que el usuario los vive. "Se ve" es lo que tiene que estar en
pantalla; "se dice" es la idea, no un texto a leer.

1. **Home (0-10 s).** Se ve: el campo de texto central, el selector Alquilar · Comprar ·
   Invertir · Lotes con Comprar elegido, la etiqueta Beta junto a la marca. Se escribe, con
   cursor visible y sin apuro, "casas en venta hasta 100 mil dólares" y Enter. Se dice: se
   busca como se habla, sin filtros.
2. **Resultados (10-25 s).** Se ve: el esqueleto y "Buscando…" durante un segundo, las cards
   al llegar, el contador "820 resultados" y los chips de "Entendí" (Compra · Casa · hasta
   US$ 100.000); listado a la izquierda y mapa con pines a la derecha. El resumen en prosa
   aparece unos segundos después debajo de la barra: no esperarlo ni leerlo. Se dice: FINDER
   entendió qué, dónde y hasta cuánto.
3. **La card (25-40 s), la #1: Casa en Rawson, US$ 47.000.** Se ve, de arriba a abajo:
   precio y US$ 470/m²; "5 amb. · 3 dorm. · 1 baño · 100 m² cub. · 341 m² lote"; el bloque
   verde "33 % por debajo de similares · 30 casas en Rawson" con la barra "más barato
   … más caro"; el bloque Zona "m² US$ 614 · En baja 2,3 %" en lila; "Actualizado hace 5
   días"; los chips Cochera y Patio; el aviso "Valores estimados a partir de avisos
   publicados…". Se dice: una sola comparación por casa, contra casas de la misma zona y de
   superficie parecida; la zona es la referencia, no la comparación. (En casas en venta el
   conjunto se arma por superficie cubierta, no por dormitorios: la card ya no dice ", 3 dorm.".)
4. **Lo verde (40-50 s).** Scroll corto hasta la #8, Casa en Rivadavia US$ 65.000: la
   pastilla verde sobre la foto "En baja 13 % · antes US$ 75.000". Una card más abajo, la #9:
   el bloque Zona verde "En suba 2,8 %". Se dice: lo único que se pinta de verde es lo bueno
   para el que compra; todo lo demás va neutro.
5. **El detalle (50-80 s).** Volver a la #1 y hacer clic en "ver similares": abre una pestaña
   nueva parada en "Avisos similares": "Comparado con 30 casas similares en Rawson · 29 a la
   vista · el otro no se muestra porque no publica foto o superficie"; debajo, la tira de
   precios del conjunto entero con la marca "Esta casa", y cinco filas con foto ordenadas por
   precio, con "Esta casa" intercalada en su lugar (al 04/10: US$ 35.000 · 45.000 · **47.000
   Esta casa** · 55.000 · 58.000 · 59.000): son las cinco de superficie más parecida, cada una
   con precio, US$/m² y ficha. Tocar "Ver los 29 similares", dejar que se vean las 29 filas y
   volver con "Ver solo los 5 más parecidos". Se dice: FINDER compara contra 30 avisos, y
   muestra primero los cinco más parecidos. Subir despacio: la galería (22
   fotos), "Lectura de FINDER" con la señal "Precio 33 % más bajo que avisos similares de la
   zona", el puntaje 91 de 100 explicado por componente, los semáforos con sus motivos, el
   bloque Zona y el aviso de estimación. Después "Indicadores de mercado" ("Posición entre
   similares: más barato que el 83 % de los similares"), "Ubicación" con el pin, y el botón
   "Consultar": tocarlo hasta que se abra WhatsApp con el mensaje precargado y cerrar sin
   enviar. Se dice: la comparación se puede ver aviso por aviso; nada se afirma sin su
   explicación; en un toque se habla con quien vende. Los semáforos del detalle sí tienen
   color (es donde vive la explicación): no detenerse en los amarillos, no son el mensaje.
6. **Cierre (80-90 s).** Volver a la pestaña de resultados, hacer clic en un pin del mapa para
   que se abra su precio con "Ver detalle", y terminar sobre el aviso de estimación de una
   card. Se dice, leído tal cual: "Valores estimados a partir de avisos publicados, no de
   operaciones concretadas. Son orientativos."

Si se graba en celular, el guion es el mismo con dos diferencias: el mapa se abre con el botón
"Ver mapa" y se vuelve con "Ver lista", y el detalle abre en una pestaña nueva igual, con el
link "Nueva búsqueda" arriba.

## 5. Qué no mostrar y por qué

| No mostrar | Por qué | Hasta cuándo |
|---|---|---|
| La vertical **Invertir** | Ordena por rentabilidad y hoy pone primero las estimaciones menos creíbles (56 %, 54 % anual). Decidido el 29/09. | Hasta que P3 aplique la regla aprobada el 01/10: rentabilidad en null cuando el precio está más de 35 % por encima de similares. |
| La vertical **Lotes** | En algunos lotes el número y el semáforo no dicen lo mismo (34,7 % por debajo con "precio en línea") y hay posiciones con 4 comparables. Abierto para P2/P3. | Hasta que P2/P3 decidan cuál de los dos manda. |
| Cards "**35 %+ · verificar el aviso**" | Son avisos con datos dudosos; no hay ninguna en el top 20 de las consultas medidas, pero pueden aparecer con otra consulta. | Siempre. |
| El detalle de una card **tenue** (datos incompletos) | No tiene mapa y el puntaje muestra un tope "Datos incompletos … Score máximo 89", texto de P2 que todavía dice "Score". | Hasta que P2 cambie ese texto (pedido sin urgencia el 01/10). |
| Los semáforos amarillos del detalle en primer plano | Está bien que existan (es donde vive la explicación), pero no son el mensaje del video. | Siempre. |
| La sección "Podrían interesarte" al final del listado | Llega solo al agotar los 820 resultados; no aporta al mensaje. | Siempre. |
| Alquilar | Funciona y pasa las pruebas, pero el video es de una compra. Si se quiere un segundo video, va aparte. | — |

Tres cuidados durante la toma:

- **No repetir búsquedas seguidas.** P2 limita a 30 búsquedas por minuto por IP y cada
  búsqueda con vertical cuenta como dos. Si aparece el botón "Buscar con filtros" (sale a los
  4 segundos sin resultados) o el mensaje de límite, esperar un minuto y repetir la toma.
- **No tocar el selector de vertical con resultados en pantalla.** Cambia la búsqueda en la
  misma sesión y rehace el listado; para el video, elegir Comprar antes de escribir.
- **No escribir una provincia o ciudad grande** ("Mendoza", "Córdoba"): FINDER responde con
  una aclaración de que solo cubre San Juan. Está bien, pero no es el video.

## 6. Setup técnico de la grabación

| Qué | Cómo |
|---|---|
| URL | https://paradisofinder.com (producción). No usar el stage ni localhost: los datos y el dominio del video tienen que ser los reales. |
| Browser | Google Chrome, ventana de incógnito nueva. Así no arrastra la vertical guardada de una visita anterior (`pf_vertical`) ni extensiones. Zoom al 100 %. |
| Ventana en desktop | 1440 × 900 o más ancho. El contenido ocupa 1120 px; a menos de 1024 px el mapa se esconde detrás de un botón. |
| Celular | iPhone con Safari o Chrome a 390 px de ancho. Las pruebas corren a 380 px, así que nada se corta. |
| Cursor | Visible y lento. Los links que abren pestaña nueva ("ver similares", título de la card, pin del mapa) no se ven cambiar de pestaña en el video: hacer el cambio a mano y después del corte. |
| Pestañas | Dos: resultados y detalle. En la del detalle el link de arriba dice "Nueva búsqueda", no "Volver". |
| WhatsApp | "Consultar" abre WhatsApp Web o la app con el mensaje precargado. Tener la sesión de WhatsApp Web iniciada antes, para que no aparezca el QR. No enviar el mensaje. |
| Conexión | Las cards llegan en un segundo; el resumen en prosa, en tres o cuatro. Si tarda más, es la red: no es un problema de FINDER y no hay que esperarlo. |
| Captura | Grabar la ventana del browser, no la pantalla entera. Sin barra de marcadores. |

Analítica: cada búsqueda y cada clic de la grabación quedan en el log de eventos de P1 y en
P2 como uso real. No distorsiona nada, pero conviene avisar si se hacen muchas tomas el mismo
día.

## 7. Checklist del día de la grabación

Se hace la misma mañana, en este orden. Si un punto falla, no se graba hasta resolverlo.

- [ ] **Producción sana:** abrir https://paradisofinder.com/api/health?deep=1 y ver
  `"ok":true`, `"p2_mode":"live"` y `"p2":{"status":"ok"}`.
- [ ] **Gate automático** desde el repo de P1, con el Chrome del sistema (tarda un minuto por
  consulta):

  ```bash
  node scripts/video-gate.mjs https://paradisofinder.com "casas en venta hasta 100 mil dólares"
  ```

  Imprime el top 20 con tendencia, posición, Zona y chips, marca con `[DATOS INCOMPLETOS]`
  las cards sin mapa, abre el detalle de la primera card completa (hasta 5 similares con la
  foto cargada, "Esta casa" intercalada, la tira de precios, mapa y Consultar) y termina en
  "GATE OK: se puede grabar" o "GATE FALLA". Se pueden pasar
  varias consultas en el mismo comando; entre una y otra espera 6 segundos por el límite de P2.
- [ ] **Elegir las cards del guion con el top 20 impreso:** cuál es la #1 (plano del detalle:
  tiene que ser una sin la marca de datos incompletos), dónde está la flecha "En baja" y dónde
  hay una Zona "En suba". Si cambiaron respecto de este handoff, se ajusta el guion, no la
  consulta.
- [ ] **Sin "En baja" en el top 20:** probar "casas en venta en capital" y la alternativa de
  Rivadavia con el mismo comando. Si ninguna tiene, se graba sin flecha y se regraba otra
  semana (P3 mira las últimas tres corridas y las bajas rotan).
- [ ] **Semana de datos:** si es lunes, confirmar que la corrida de P3 ya terminó (el valor de
  Zona cambia ese día). Mejor grabar de martes a viernes.
- [ ] **Browser listo:** incógnito, zoom 100 %, ventana 1440 × 900, WhatsApp Web con sesión
  iniciada, sin barra de marcadores.
- [ ] **Una pasada en seco** del guion completo, sin grabar, mirando que no aparezca ningún
  "None", "null" o "unknown" en pantalla y que "Consultar" abra WhatsApp con el mensaje.
- [ ] **Esperar un minuto** entre la pasada en seco y la toma, por el límite de búsquedas.

## 8. Si algo falla durante la grabación

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| Aparece el botón "Buscar con filtros" o la búsqueda queda en "Buscando…" | P2 tardó más de 4 segundos o se alcanzó el límite de 30 búsquedas por minuto | Esperar un minuto, recargar y repetir la toma. Si se repite, mirar `/api/health?deep=1`. |
| "No pude iniciar la búsqueda" | Lo mismo: límite por IP, dos llamadas por búsqueda | Esperar un minuto. No insistir. |
| Se ve un "None", "null", "unknown" o un "0 m²" | Un aviso con un dato mal cargado que las pruebas no cubrieron | No grabar esa card. Anotar el id (está en la URL del detalle) para P1. |
| La card del detalle no tiene mapa | Es un aviso sin ubicación exacta (se ve tenue en el listado) | Abrir otra card; el gate marca cuáles sirven. |
| El resumen en prosa debajo de la barra no aparece | La narrativa tarda hasta 4 segundos o falló; las cards no dependen de ella | Seguir. No es parte del video. |
| "Consultar" abre WhatsApp con el QR | WhatsApp Web sin sesión iniciada | Iniciar sesión antes y repetir el plano. |
| El top 20 cambió respecto del handoff | Corrida nueva de P3 (lunes) o avisos dados de baja | Es normal. Rehacer el guion con el top impreso por el gate; no cambiar la consulta. |
| Un número no cierra (por ejemplo, el m² de la Zona contradice el precio por m² de la card) | Son dos bases distintas: la card usa cubierta y la Zona el m² típico de casas con los mismos dormitorios | No es un error. Si confunde en cámara, no comentarlo. |

Si la falla es de P1 (página en blanco, error 500), el log está en Railway y el health de P1
dice si P2 responde. Si es de P2 (búsquedas que no vuelven con P1 sano), avisar a P2 con la
hora y la consulta.
