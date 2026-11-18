# Búsqueda por mapa — el listado sigue al mapa

**Rama `italia` · 2026-11-18.** Pedido de German: "que yo pueda ir moviendo el
mapa y se vaya actualizando la búsqueda", automático y con una forma de apagarlo.

## Qué hace

- El visitante mueve el mapa o hace zoom → medio segundo después, el listado
  pasa a ser el de lo que se ve ("modo área"): "70 annunci in quest'area".
- **Mover el mapa reemplaza el lugar de la consulta.** Quien buscó "a Milano"
  y se corre a Roma ve Roma. La operación, la tipología, el precio y los demás
  filtros siguen valiendo; el chip del lugar se oculta.
- En el mapa aparecen los pins de todo el criterio sin el lugar, no solo los de
  la zona buscada.
- Casilla **"Aggiorna mentre sposto la mappa"**, marcada por defecto (se
  recuerda en el navegador). Apagada, el listado no cambia solo y aparece el
  botón **"Cerca in quest'area"**.
- **"✕ Torna alla ricerca"** vuelve al listado de la consulta y re-encuadra el
  mapa. Una búsqueda nueva o un refinamiento (quitar un filtro, cambiar el
  precio) también salen del modo área.
- En el teléfono el mapa es una capa: arriba dice cuántos avisos hay en el
  área y el botón de abajo pasa a "☰ Vedi 57 annunci".
- El mapa no se aleja más allá de Italia y alrededores
  (`MARKET_CONFIG.map`: `minZoom` 5 y `maxBounds`).

## Cómo está hecho

| Qué | Dónde |
|---|---|
| El mapa avisa los movimientos **del visitante** (`onViewportChange`) y no re-encuadra en modo área (`fitOnPins`) | `src/components/ResultsMap.tsx` |
| Modo área: estado, espera de 450 ms, cancelación, paginado, casilla, salida | `src/components/SearchResultsView.tsx` (`area`, `searchArea`, `handleViewport`, `resetArea`) |
| Paso a P2 con el id del visitante | `src/app/api/search/area/route.ts` |
| Cards del rectángulo y pins sin el lugar | P2: `POST /search/area`, `POST /search/map` con `ignore_place` (API_CONTRACT §10) |
| Límites del mapa | `src/lib/market.ts` |
| Estilos | `src/app/italia.css` (`.area-bar`, `.map-area-auto`, `.map-area-btn`) |

**El punto delicado**: separar los movimientos del visitante de los de la
página. `ResultsMap` marca un gesto (rueda, arrastre, toque, teclado, botones
de zoom) y solo el `moveend` que le sigue cuenta. Los encuadres que hace la
página (resultados nuevos, volver a la consulta) y el corrimiento al abrir el
popup de un aviso no cuentan. Si eso se rompe, cada resultado re-encuadra el
mapa y dispara otra búsqueda, en círculo: no tocarlo sin correr la prueba.

El criterio vive en P2: el navegador manda la sesión y el rectángulo
(`[sur, oeste, norte, este]`), nada más. P2 no guarda el rectángulo en la sesión.

## Registro

`map_area_search` (cada actualización, con el total y si fue automática o por
el botón), `map_area_exit`, `map_area_auto_toggled`. No cuentan como búsqueda
en Funnel ni en Statistiche.

## Límites

- Los avisos sin coordenadas no aparecen en modo área (en Italia, 12 de 165).
- El cupo de P2 para esta ruta es de 90 pedidos por minuto por visitante.
  Superado, el listado avisa y pide esperar unos segundos.
- El rectángulo no queda en la dirección de la página: al recargar se vuelve a
  la consulta.
- En modo área no hay texto "In breve" ni avisos similares.

## Cómo se probó

Con navegador contra P2 de Italia, escritorio y teléfono (26 chequeos): cargar
no entra en modo área; abrir un popup tampoco; alejar el zoom sí, con un solo
pedido para siete pasos de rueda; el scroll pagina el mismo rectángulo;
arrastrar vuelve a buscar; con la casilla apagada no cambia nada y aparece el
botón; volver restituye la consulta sin disparar otra búsqueda; una búsqueda
nueva sale del modo área. Capturas: `docs/italia/capturas/mapa_area_*.png`.
