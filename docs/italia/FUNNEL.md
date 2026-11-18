# Funnel — el embudo del sitio de Italia, con datos reales

**Rama `italia` · 2026-11-18.** `/funnel`, con link "Funnel" en el pie (al lado
de "Statistiche"). Sin clave. A diferencia de `/statistiche`, **no usa datos de
ejemplo**: lee el registro de eventos del propio sitio.

## De dónde salen los números

Cada interacción del visitante pasa por `POST /api/events`, que la escribe en
`EVENTS_LOG_DIR/events-AAAA-MM-DD.jsonl` (un archivo por día, en UTC).
`buildFunnel(days)` (`src/lib/server/funnel.ts`, el mismo agregador de
`/interno/embudo`) recorre esos archivos y cuenta, **una vez por búsqueda**:

| Paso | Evento |
|---|---|
| Ricerche | `search_submitted` |
| Con annunci mostrati | `cards_rendered` |
| Con una scheda aperta | `card_opened` |
| Con un contatto all'agenzia | `contact_click` (clic en «Chiama l'agenzia») |

Además: búsquedas por día (gráfico desde el segundo día con visitas), la tabla
día por día, el reparto Vendita / Affitto y cómo respondió el sitio (tiempo
hasta los primeros resultados —mediana y percentil 95—, búsquedas sin
coincidencias exactas, esperas de más de 4 s, aclaraciones elegidas, filtros
tocados, errores). Períodos: 7, 30 y 90 días (`?p=`).

Sin eventos muestra "Non ci sono ancora dati": no inventa nada.

## Dos cosas a saber

- **Vendita / Affitto se atribuye por `search_id`.** En Italia el visitante no
  elige la operación: la deduce P2 de la consulta y la web se entera después
  (`vertical_resynced`). `search_submitted` sale sin operación, así que la
  búsqueda se anota en `search_performed` con lo que digan sus eventos
  posteriores. En san_juan, donde la operación se elige antes, no cambia nada.
- **"Con annunci mostrati" incluye las búsquedas sin coincidencia exacta** a
  las que el sitio les ofreció avisos similares; por eso puede haber una
  búsqueda "senza corrispondenze esatte" y aun así el 100% con avisos.

## El registro tiene que sobrevivir a los deploys

- Local (`docker-compose.italia.yml`): `EVENTS_LOG_DIR=/data/logs` en el volumen
  `finder-web-italia-data`. Sobrevive a `down` / `up`; se pierde con `down -v`.
- **Railway**: hay que montar un volumen en `/data`. Sin volumen, cada deploy
  arranca con el registro vacío y el funnel vuelve a cero.

## Cómo se probó

Con la web y P2 de Italia levantados y el registro vacío: tres búsquedas reales,
una ficha abierta y un clic en «Chiama l'agenzia». La página mostró lo mismo que
el registro (4 búsquedas, 4 con avisos, 1 ficha, 1 contacto; Vendita 3, Affitto
1). Capturas: `docs/italia/capturas/funnel_desktop.png`, `funnel_mobile.png`,
`funnel_vuoto.png`.
