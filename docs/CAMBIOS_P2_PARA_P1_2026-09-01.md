# Cambios de P2 que P1 tiene que aplicar · 31 de agosto – 1 de septiembre de 2026

**De:** P2 (FINDER Core) · **Para:** el equipo de P1
**Estado de P2:** release gate PASS 9/9 · golden de extracción 129/129 · 397 tests

Documento de DELTA sobre `CAMBIOS_P2_PARA_P1_2026-08-30.md`. La fuente de
verdad sigue siendo `P1_INTEGRATION_SPEC.md` y el Swagger vivo
(`http://localhost:8001/docs`).

---

## Resumen: qué tiene que hacer P1

| # | Cambio | ¿P1 tiene que tocar algo? |
|---|---|---|
| 1 | **Dúplex: pasa a ser un filtro real (`is_duplex`)** — deja de llegar como `preferred_property_type` + `semantic_query` | **Sí, si detectabas el dúplex mirando esos dos campos** |
| 2 | `is_duplex` **nuevo en la Card** | **Opcional**: sellar la card, recomendado |
| 3 | `place` — barrio/localidad que no es zona del catálogo (31/08) | No, pero cambia resultados que antes daban 0 |
| 4 | Resultados que cambian de contenido | **Revisar** si hay snapshots/golden del lado de P1 |

**⚠️ El §6 del delta anterior ("Dúplex: preferencia, no filtro") queda
SUPERADO.** Decía que el campo `preferred_property_type` no era transitorio y
que integrarlo hoy no se rehacía mañana. Lo primero sigue siendo cierto — el
campo **no desaparece** —; lo segundo se cumplió antes de lo previsto: el
dúplex dejó de usarlo. Si P1 no leía ese campo (que era lo indicado), no hay
nada que rehacer.

---

## 1. Dúplex: ahora es una categoría con dato propio

P3 entregó el 01/09 la columna `es_duplex` en `master.properties`, así que el
dúplex **filtra** como cualquier categoría en vez de aproximarse buscando la
palabra en el texto del aviso.

### Qué llega ahora

| el usuario pide | `property_type` | `is_duplex` | `preferred_property_type` | `semantic_query` |
|---|---|---|---|---|
| "dúplex en rivadavia" | `null` | **`true`** | `null` | `null` |
| *(antes, hasta el 31/08)* | `null` | — | `"apartment"` | `"dúplex"` |

`property_type` va en `null` **a propósito**: la marca es ortogonal al tipo.
De los dúplex del catálogo, 50 están tipificados `apartment` y 13 `house`, y
los dos grupos son dúplex reales — fijar un tipo dejaría fuera a uno entero.

### Qué devuelve cada vertical

| el usuario busca | qué trae |
|---|---|
| **dúplex** (`is_duplex: true`) | SOLO dúplex, de los dos tipos de base. Filtro **DURO** |
| **departamento** (`property_type: "apartment"`) | departamentos **+ los dúplex mezclados** — para el usuario un dúplex es un depto |
| **casa** (`property_type: "house"`) | casas **+ los dúplex al FINAL** de la lista |

Universo real (activos, `quality_tier >= 1`, San Juan):

| operación | departamentos | casas | de los cuales dúplex |
|---|---|---|---|
| venta | 702 → **714** (+12 dúplex-casa) | 1.677 → **1.713** (+36 dúplex-depto, al final) | 48 |
| alquiler | 349 → **350** (+1) | 174 → **188** (+14, al final) | 15 |

### Qué tiene que hacer P1

**Si P1 detectaba "esto es una búsqueda de dúplex"** mirando
`preferred_property_type == "apartment"` o buscando `"dúplex"` en
`semantic_query` — para un chip, un título, una etiqueta —, esa detección
**deja de funcionar**: ahora es `extraction.params.is_duplex === true`.

Si P1 nunca leyó esos campos (que era lo indicado), **no hay nada que
cambiar**: paginando con `{session_id, offset}`, P2 conserva `is_duplex` en la
sesión igual que conservaba lo anterior.

`preferred_property_type` **sigue en el contrato** y se sigue ecoando: queda
reservado para la próxima categoría que P3 no tipifique. Hoy no la emite
ninguna regla, así que siempre llega `null`.

## 2. `is_duplex` en la Card (aditivo)

La Card gana un campo, con la semántica tri-estado de siempre en este
contrato:

```jsonc
"is_duplex": true | false | null   // null = NO EVALUADO, nunca "no es"
```

**Recomendado sellarla**, sobre todo en la vertical `house`: ahí el dúplex
aparece al final de una lista de casas y el usuario agradece saber cuál es
cuál. En `apartment` van mezclados y el sello también ayuda.

Es aditivo: ningún campo existente de la Card cambió de nombre, tipo ni
significado.

## 3. `place` — el barrio que no es zona del catálogo (31/08)

*No estaba en el delta anterior; va acá porque cambia resultados.*

Todo lugar que el usuario nombre y no sea zona del catálogo se trata como
**barrio o localidad de San Juan**, no como otra ciudad. Llega en el campo
`place` del request y del eco, y **FILTRA** por el nombre escrito en el texto
del aviso (P3 no tiene columna de barrio todavía).

| consulta | antes | ahora |
|---|---|---|
| "casas baratas en concepción" | **0** resultados + `clarification_reason: "otra_ciudad"` | las 18 casas de Concepción, Capital |

Solo la lista cerrada de provincias y ciudades grandes sigue dando
`otra_ciudad`. **P1 no manda `place`**: lo produce la extracción y P2 lo
conserva al paginar. Si ningún aviso nombra el lugar, la búsqueda da 0 duros
y llega `related` — el camino normal, sin error.

## 4. Resultados que cambian de contenido

Ninguno de estos es un error: si P1 tiene tests o snapshots que fijan
resultados, hay que actualizarlos.

- **"dúplex en Rawson" devuelve 0** (antes devolvía departamentos de Rawson
  detrás de los que decían la palabra). Los 3 dúplex de Rawson están en
  `quality_tier 0` — les falta superficie — y tier 0 no se muestra nunca. El
  único visible de Rawson **no es un dúplex**: dice *"ideal para construir
  departamentos, dúplex, galpones"*. Llegan 0 duros + `related`.
- **Buscar casas ahora trae también los dúplex-departamento**, al final.
- **Buscar dúplex ya no devuelve departamentos comunes de relleno**: es un
  filtro, así que el total baja y es exacto.
- Un aviso que solo *menciona* un dúplex ("ideal para construir dúplex", "el
  complejo tiene un dúplex") **ya no aparece** en la búsqueda de dúplex.

---

## Checklist de migración para P1

- [x] Si detectabas el dúplex por `preferred_property_type` / `semantic_query`:
      cambiar a `extraction.params.is_duplex === true` (§1). — *P1 nunca leyó
      esos campos: nada que rehacer. Tipos y comentarios actualizados el 01/09.*
- [x] (Recomendado) Mostrar el sello de dúplex con `card.is_duplex === true`,
      tratando `null` como "no informado", nunca como `false` (§2). — *Aplicado
      el 01/09: chip "Dúplex" primero en la card y "Tipo: … · Dúplex" en el
      detalle.*
- [x] Actualizar snapshots/golden propios: "dúplex en Rawson" da 0, las
      búsquedas de casa incluyen dúplex al final (§4). — *P1 no tiene tests ni
      snapshots que fijen resultados: nada que actualizar.*
- [x] Nada que hacer por `place`: es transparente para P1 (§3). — *Se actualizó
      la nota de CLAUDE.md sobre la clarificación sin chips ("casas en
      concepcion"), que este cambio deja obsoleta como caso frecuente.*

## Qué NO cambió

- **La Card**: solo suma `is_duplex`. Mismo shape, mismas reglas de display,
  mismos `content_language` y semáforos.
- **Los endpoints**: `/search`, `/search/stream`, `/search/text`,
  `/search/map` conservan su contrato. El canal de P1 sigue siendo
  `POST /search/stream` (SSE) con `POST /search` de fallback.
- **La paginación**: `{session_id, offset}`, sin `query`, y `related` solo en
  la última página.
- **`preferred_property_type`**: sigue en el contrato, hoy siempre `null`.
- **Los indicadores**: `estimated_price_per_sqm`, `valuation_gap_pct`,
  `price_percentile` y los semáforos **no se movieron**. P3 entregó el dúplex
  como atributo y no como tipo justamente para no partir los comparables: un
  dúplex se sigue valuando contra los departamentos o las casas de su zona.

---

*Nota de P1 (01/09):* el delta menciona el Swagger en `localhost:8001`, pero la
instancia local real de P2 corre en el puerto **8000** (ver
`CAMBIOS_P2_PARA_P1_2026-08-30.md` y la config de este repo). Como el mapa de
P1 usa la forma (b) con `session_id`, el filtro `is_duplex` del criterio lo
resuelve P2 dentro de la sesión; `toMapRequest()` (forma (a), portal) NO manda
`is_duplex` ni `place` porque `/search/map` conserva su whitelist con
`extra="forbid"`.
