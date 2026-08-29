# Registro de decisión — De chat conversacional a búsqueda simple (2026-08-29)

**Decisión:** German pidió que la interfaz deje de ser conversacional. El cuadro de texto
pasa a ser un **buscador simple**: una consulta devuelve un listado a la izquierda y el
mapa a la derecha (patrón Airbnb). No se mantiene conversación.

**Implementación elegida (opción C):** la UI es un buscador simple, pero por debajo usa el
**canal con streaming abriendo una sesión NUEVA por consulta**. Motivo: ese canal entrega
textos de P2/P3 que el canal del portal (`/search/text`) no tiene — `suggestions`, el
mensaje y los chips de clarificación, el `riepilogo` con `nota_asuncion`, y un resumen en
prosa. Sin memoria entre búsquedas: cada consulta abre su propia sesión.

Se evaluaron tres opciones (comparación medida contra P2 real el 29/08):

| | A · `/search/text` | B · sesión + `/search` | **C · sesión + `/search/stream`** |
|---|---|---|---|
| Resultados | 189 | 189 | 189 — **idénticos, mismos ids y orden** |
| Llamadas por búsqueda | 2 | 3 | 3 |
| Cards 1ª página | 10 | 20 | 20 |
| `suggestions` de P2 | ✗ (`null`) | ✓ | ✓ |
| Clarificación con texto de P2 | ✗ (los pone P1) | ✓ | ✓ |
| `riepilogo` + `nota_asuncion` | ✗ | ✓ | ✓ |
| Resumen en prosa | ✗ | ✗ (solo template) | ✓ |
| Latencia | 22 ms | 210 ms | ~200 ms a las cards |

El canal NO cambia los resultados: es el mismo motor. Lo que cambia es la metadata.

Esto **revierte el principio de producto nº 1** ("el chat es la interfaz primaria",
CLAUDE.md regla 1, `producto-p1.md` §2.1 y §3, `prompt-inicial.md`), que era el concepto
rector de FINDER ("no es un buscador con filtros"). Este archivo es el registro de
conflicto que exige la regla de conflicto de CLAUDE.md.

## Qué cambia

| | Antes | Ahora |
|---|---|---|
| Interacción | Chat anclado, contexto acumulado turno a turno | Barra de búsqueda sticky; cada consulta abre su propia sesión |
| Canal | `POST /sessions` + SSE `/search/stream` (sesión larga) | El mismo, con **sesión nueva por búsqueda** |
| Narrativa | Burbujas de chat con typing | Panel "Resumen" arriba del listado, con typing |
| Refinamiento | "sacale la pileta", "también en Rivadavia" | Nueva consulta completa (la barra queda precargada y editable) |
| Resultados | Lista + chat abajo | Lista izquierda + mapa derecha, tipo Airbnb |

## Llamadas por búsqueda (arquitectura final)

```
BÚSQUEDA   POST /sessions                            → session_id (nuevo)
           POST /search/stream {session_id, query}   (SSE)
             event cards          → 20 cards · riepilogo · suggestions · complemento
             event response_chunk → resumen en prosa, token a token
             event done           → context.search_params (vocabulario VIEJO)
MAPA       POST /search/map {session_id}              ← forma (b)
SCROLL     POST /search/structured {...context.search_params, offset:20, limit:10}
SI AGOTA   POST /search/semantic {query, offset, limit}
DETALLE    GET  /property/{id}
```

La sesión vive **solo para esa búsqueda**: los chips de clarificación
(`vertical_override`) y las `suggestions` se resuelven dentro de ella, porque necesitan el
criterio que P2 ya acumuló en ese turno. Una consulta nueva abre una sesión nueva.

## Qué NO cambia (reglas que se mantienen)

- **Paginación 10 × 3, tope 30** con scroll infinito, y `/search/semantic` para los
  "similares" cuando `total_matches` se agota antes del tope.
- **Contador = `total_matches`**, nunca `total`.
- **CLARIFICATION es diseño, no error**: se renderiza como pregunta con los chips
  `[Comprar] [Alquilar] [Invertir]`, que reintentan la MISMA consulta anteponiendo la
  elección (spec §2).
- **Cero resultados nunca es un vacío mudo** (ver §Ajuste abajo).
- Toda señal con su explicación, reglas de display de la card, mapa con `tier >= 2`.

## Cero resultados y clarificación: con los textos de P2

Al usar el canal con streaming, ambos casos se resuelven con las palabras de P2, no con
textos inventados por P1:

- **Cero resultados:** el resumen en prosa ya explica el caso ("No encontré departamentos
  en Jáchal con estos criterios, pero te mostré 20 propiedades similares…"), y debajo van
  las `suggestions` reales de P2 (`["Ampliar la zona", "Ajustar el presupuesto"]`) como
  chips de acción, más el `complemento` como bloque "Podrían interesarte".
- **Clarificación:** el `message` y los `chips` los manda P2 en el evento `clarification`.
  El chip elegido reintenta con `vertical_override` **en la misma sesión**, así P2 usa el
  criterio que ya extrajo.

Único texto propio de P1: si el usuario ya eligió operación y P2 vuelve a pedir precisión
(pasa con consultas degeneradas tipo "hola"), P1 no repite los mismos chips — pide un dato
concreto y ofrece ejemplos, para no dejarlo en un bucle.

## Código

- **Nuevo:** `src/components/SearchResultsView.tsx` (reemplaza a `ConversationView.tsx`,
  eliminado) y `src/app/api/search/stream/route.ts` (reemplaza a `/api/chat`, que tenía
  nombre engañoso ahora que no hay chat).
- **En uso:** `/api/sessions`, `src/lib/sse.ts`, `searchStream`/`createSession` del cliente
  y `mockSearchStream` — la opción C los reactiva todos.
- El CSS del chat (`.dock-*`, burbujas) se quitó; queda el panel `.summary` y el `.caret`
  del efecto typing.

## Nota de capacidad

Con una sesión por búsqueda, el techo es el rate limit de sesiones: **20/min por IP**, y P1
llama desde una sola IP, así que es el techo de todo el sitio (con el canal del portal
serían 30/min de búsqueda: mismo orden de magnitud). **Hay que pedirle a P2 que suba el
límite para la IP del server de P1 antes de exponerlo a tráfico real** — es independiente
de la opción elegida.
