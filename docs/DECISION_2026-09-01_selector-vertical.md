# Decisión 2026-09-01 — Selector de vertical en el buscador

**Decisión de German (01/09).** El buscador suma un selector segmentado
**Alquilar · Comprar · Invertir** (opción A de la propuesta gráfica del 01/09):
en la home arriba del campo de texto, y compacto dentro de la barra sticky de
resultados. Reglas pedidas:

1. Lo elegido queda guardado como **preferencia** (localStorage `pf_vertical`)
   y arranca activo en la próxima visita a la home.
2. **Lo que escribe el usuario predomina** (regla de producto 2): si el texto
   dice otra cosa que el botón, vale el texto — y el botón se re-sincroniza
   con lo que la búsqueda realmente hizo, actualizando la preferencia.

## Hallazgos que definieron la implementación (sondas del 01/09, P2 real)

Todas las sondas contra la instancia viva (Docker local, `/api/v1`), sesión
nueva por request:

| Sonda | Resultado |
|---|---|
| `query` + `vertical_override: "comprar"` con texto "departamento para alquilar en capital" | El override **pisa el texto ENTERO**: Compra, zona "toda la provincia", tipo null (2.381 = todo el universo). Pierde zona y tipo, no solo el vertical. |
| `"…, para comprar"` anexado a texto que dice "para alquilar" | **Compra gana**: el extractor `fast` prioriza compra sobre alquiler **sin importar la posición** (anexado al final o antepuesto, y también contra "en venta"). |
| `"casa en rawson, para alquilar"` (texto neutro + frase) | Alquiler, conservando zona y tipo. La frase anexada funciona perfecto sobre texto neutro. |
| `"casa en rawson"` solo | **No clarifica: asume Compra** con `assumption_note` "Asumí compra — decime si buscás alquilar". |
| "para invertir" / "inversión" / `vertical_override: "invertir"` | **El vertical `investment` de la spec no es alcanzable**: todo cae en `compraventa` con orden default. El override `invertir` ≡ `comprar` (mismos totales). **Reportar a P2.** |
| `"…, para invertir y alquilar, ordenadas por renta"` (frase del chip "Para renta") | Compra + orden **Rentabilidad** (`gross_yield`). Único efecto "invertir" real hoy. |
| Extracción de `/search/text` (`extraction.params.vertical` + `meta`) | El `meta` **no distingue** "lo dijo el texto" de "lo asumió" (misma confidence). Pero `rent`/`temporary_rent` solo aparecen si el texto los dijo. |
| `vertical_override` en sesión **CON criterio** (con o sin re-enviar la query) | **Preserva zona/tipo/presupuesto** y cambia solo el vertical ("depto para alquilar en capital" → override comprar = Compra · Capital · Departamento). Es el uso para el que está diseñado. |
| Frase de invertir como **refinamiento** en sesión con criterio | Compra + orden **Rentabilidad** conservando el criterio (Capital · Departamento). Único camino a "invertir" también dentro de la sesión. |

## La implementación (por qué es así)

- **La selección viaja como frase canónica anexada a la query, jamás como
  `vertical_override`** (primer hallazgo: el override es solo para responder
  clarificaciones dentro de una sesión con criterio cargado).
- **El server (route handler de `/api/search/stream`) decide la composición**
  con una sonda a `/search/text` del texto crudo (extractor determinístico,
  ~2 ms de extracción; topología A: el browser no toca P2):
  - extracción `rent`/`temporary_rent` → el texto ya fijó vertical → **va
    crudo** (el texto manda);
  - extracción `sale` (dicho o asumido, indistinguible) → **se anexa la
    frase**. Es seguro por la prioridad compra > alquiler del extractor: un
    texto que dice comprar/venta nunca pierde contra la frase de Alquilar.
  - sonda falla → crudo (fail-open).
- **Re-sincronización**: al llegar `cards`, el cliente mapea el `summary`
  (contrato público §3): "Alquiler" → Alquilar; "Compra" + orden
  "Rentabilidad" → Invertir; "Compra" → Comprar; otro (p. ej. "Alquiler
  temporario") → sin selección, sin tocar la preferencia. Si difiere del
  botón, se actualiza botón + preferencia y se emite `vertical_resynced`.
- **URL**: el vertical de la búsqueda viaja en `?v=` (links compartibles y
  back/forward reproducen la búsqueda). El botón en resultados refleja la
  búsqueda EN CURSO (URL → re-sync), no la preferencia guardada.
- **Invertir = la frase del chip "Para renta"** (compra ordenada por
  rentabilidad), lo único real hoy. Si P2 habilita `investment`, cambiar
  `VERTICAL_PHRASE` y el mapeo en `src/lib/vertical.ts`.
- **Click en el selector CON resultados en pantalla** (ajuste del 01/09,
  reporte de German: con texto "depto para alquilar…" el botón rebotaba a
  Alquilar y parecía roto): el click es la intención MÁS reciente y le gana
  al texto YA buscado. Se resuelve en la MISMA sesión — `vertical_override`
  para alquilar/comprar, la frase como refinamiento para invertir — así el
  criterio acumulado no se pierde; la URL se actualiza con `router.replace`
  sin relanzar el efecto. Lo tipeado sigue mandando al buscar texto NUEVO
  (la regla 2 aplica entre el texto que se busca y la selección previa, no
  contra un click posterior a los resultados).
- Los chips de clarificación siguen con `vertical_override` en la misma
  sesión (flujo intacto); elegir uno también sincroniza botón y preferencia.
- Sin selección no se compone nada: P2 infiere del texto, como antes.
- **La home acompaña la selección** (pedido de German, 01/09; textos del
  "Set C curado" elegidos por German ese mismo día entre tres propuestas):
  el placeholder y los ejemplos clickeables cambian según el vertical, con
  frases que lucen superpoderes REALES del extractor — todas sondadas contra
  P2 vivo: "quincho" → filtro `bbq_area`; "mucho tiempo publicada, para
  negociar" → `days_on_market > 90` + orden por antigüedad; "al menos 20%
  por debajo del precio de su zona" → filtro `valuation_gap_pct >= 20`;
  "para refaccionar" → `condition`; "amueblado"/"cochera"/"monoambiente" →
  filtros duros; "Villa Krause" → Rawson. Click en un ejemplo = pone el
  texto en el input y BUSCA directo. Los chips de oportunidad también se
  filtran por vertical (`verticals` en `src/lib/chips.ts`: Alquilar →
  Temporarios y Los más baratos; Comprar → baratos, Gangas y Bajo precio de
  zona; Invertir → Para renta, Para revalorizar y Gangas; sin selección los
  seis); si el chip activo deja de mostrarse al cambiar de vertical, se apaga.

## Límites conocidos

- Con selección **Invertir** y un orden explícito en el texto ("las más
  baratas primero"), la frase anexada también trae "ordenadas por renta":
  quién gana el orden queda en manos del extractor (mismo límite que ya
  tienen los chips de oportunidad que fijan orden).
- El mapeo Invertir depende de la etiqueta `order: "Rentabilidad"` del
  summary; si P2 la reescribe, esas búsquedas re-sincronizan a Comprar.
- La sonda agrega una búsqueda del portal (~80 ms server-side) antes del
  stream, solo en turnos con selección activa. Las cards igual llegan
  órdenes de magnitud antes que la narrativa (~2,7 s).
- Los refinamientos en-sesión ACUMULAN: tras pasar por Invertir, volver a
  Alquilar/Comprar conserva el orden por Rentabilidad en esa sesión (el
  override cambia solo el vertical). La pill "Orden: Rentabilidad" lo declara
  (regla 4: ninguna señal sin explicación); una búsqueda nueva lo resetea.
