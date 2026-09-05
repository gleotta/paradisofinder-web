"use client";

/**
 * Mapa de resultados — split view tipo Airbnb (decisión 29/08, ver
 * docs/DECISION_2026-08-29_mapa.md).
 *
 * Dibuja los pins de `POST /search/map` (P2, 29/08): el universo mapeable del
 * criterio, ya filtrado server-side por `quality_tier >= 2` + coordenadas
 * (regla dura spec §5.7). El payload es mínimo a propósito — el detalle del
 * popup se pide con GET /property/{id}, adonde navega el link.
 *
 * Leaflet toca `window` al importarse → import dinámico dentro del efecto
 * (los client components también se renderizan en el server).
 */

import { useEffect, useRef, useState } from "react";
import type * as LType from "leaflet";
import type { MapPin } from "@/lib/p2/types";
import { PROPERTY_TYPE_LABEL, RENTAL_PERIOD_SUFFIX } from "@/lib/labels";
import { compactPrice, fmtMoney } from "@/lib/format";
import { detailHref, EVENTS, trackCardClick, trackEvent } from "@/lib/track";

const SJ_CENTER: [number, number] = [-31.5351, -68.5386];

interface Props {
  /** Pins del universo mapeable (tier >= 2 con coordenadas), tal como los da P2. */
  pins: MapPin[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Corrida de búsqueda vigente: el link del popup la hereda (`?s=`). */
  searchId: string | null;
}

/** Precio del pin: SIEMPRE el original, con sufijo de periodicidad en alquileres. */
function pinPrice(pin: MapPin): string {
  const base = fmtMoney(pin.price, pin.currency ?? "ARS");
  if (pin.operation !== "rent") return base;
  // null = no informado → mensual asumido, sin comparar entre periodicidades.
  return `${base} ${pin.rental_period ? RENTAL_PERIOD_SUFFIX[pin.rental_period] : "/mes"}`;
}

function markerIcon(L: typeof LType, pin: MapPin, active: boolean): LType.DivIcon {
  const label = compactPrice({ price: pin.price, currency: pin.currency ?? "ARS" });
  return L.divIcon({
    className: "price-marker-anchor",
    iconSize: [0, 0],
    html: `<span class="price-marker${active ? " price-marker--active" : ""}">${label}</span>`,
  });
}

/**
 * Encuadre robusto: con datos reales un par de avisos con coordenadas fuera de
 * lugar (ruido de datos conocido, handoff §6) alejaba el zoom hasta dejar todo
 * el mercado en un solo cluster. Se encuadra por el percentil 2-98 y los
 * outliers quedan accesibles con zoom out.
 */
function trimmedBounds(L: typeof LType, pins: MapPin[]): LType.LatLngBounds | null {
  if (pins.length === 0) return null;
  if (pins.length < 12) {
    return L.latLngBounds(pins.map((p) => [p.latitude, p.longitude] as [number, number]));
  }
  const lats = pins.map((p) => p.latitude).sort((a, b) => a - b);
  const lngs = pins.map((p) => p.longitude).sort((a, b) => a - b);
  const lo = Math.floor(pins.length * 0.02);
  const hi = Math.ceil(pins.length * 0.98) - 1;
  return L.latLngBounds([lats[lo], lngs[lo]], [lats[hi], lngs[hi]]);
}

/** El detalle abre en pestaña nueva (05/09); `data-id` sirve al tracking del click. */
function popupHtml(pin: MapPin, searchId: string | null): string {
  const title = PROPERTY_TYPE_LABEL[pin.property_type] ?? "Propiedad";
  const href = detailHref(pin.id, { searchId, from: "map" });
  return `<a class="map-pop map-pop--compact" href="${href}" target="_blank" rel="noopener" data-id="${pin.id}"><span class="map-pop-price">${pinPrice(pin)}</span><span class="map-pop-title">${title}</span><span class="map-pop-cta">Ver detalle ↗</span></a>`;
}

export default function ResultsMap({ pins, selectedId, onSelect, searchId }: Props) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LType.Map | null>(null);
  const LRef = useRef<typeof LType | null>(null);
  const layerRef = useRef<LType.MarkerClusterGroup | null>(null);
  const markersRef = useRef<Map<string, LType.Marker>>(new Map());
  const pinsRef = useRef<Map<string, MapPin>>(new Map());
  const roRef = useRef<ResizeObserver | null>(null);
  const onSelectRef = useRef(onSelect);
  const searchIdRef = useRef(searchId);
  const boundsRef = useRef<LType.LatLngBounds | null>(null);
  const hadSizeRef = useRef(false);
  // Cambia en cada init exitoso para que los efectos de markers re-corran
  // también tras el remount de StrictMode.
  const [mapEpoch, setMapEpoch] = useState(0);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    searchIdRef.current = searchId;
  }, [searchId]);

  useEffect(() => {
    let cancelled = false;
    const markers = markersRef.current;
    const pinIndex = pinsRef.current;
    (async () => {
      if (!divRef.current || mapRef.current) return;
      const L = (await import("leaflet")).default;
      // markercluster se engancha a la instancia global de Leaflet (L.markerClusterGroup).
      await import("leaflet.markercluster");
      if (cancelled || !divRef.current || mapRef.current) return;
      LRef.current = L;
      const map = L.map(divRef.current, {
        center: SJ_CENTER,
        zoom: 12,
        scrollWheelZoom: true,
      });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
      }).addTo(map);
      // Clustering: con datos reales una zona densa acumula cientos de pins
      // superpuestos e inclickeables. El cluster muestra el conteo y se abre al
      // hacer zoom o click.
      layerRef.current = L.markerClusterGroup({
        showCoverageOnHover: false,
        maxClusterRadius: 46,
        spiderfyOnMaxZoom: true,
        disableClusteringAtZoom: 17,
        iconCreateFunction: (cluster) => {
          const n = cluster.getChildCount();
          const size = n < 10 ? "sm" : n < 50 ? "md" : "lg";
          return L.divIcon({
            className: "cluster-anchor",
            iconSize: [0, 0],
            html: `<span class="pin-cluster pin-cluster--${size}">${n}</span>`,
          });
        },
      }).addTo(map);
      mapRef.current = map;

      // El popup es HTML crudo: el click en "Ver detalle" se registra al abrirse
      // (una vez por elemento) como card_clicked desde el mapa.
      map.on("popupopen", (e) => {
        const a = e.popup.getElement()?.querySelector<HTMLAnchorElement>("a.map-pop");
        if (!a || a.dataset.bound) return;
        a.dataset.bound = "1";
        a.addEventListener("click", () => {
          const id = a.dataset.id ?? "";
          trackCardClick({ id, opportunity_score: null }, "map", null);
        });
      });

      // El contenedor puede arrancar oculto (overlay cerrado / toggle):
      // al ganar tamaño real, recalcular el canvas y encuadrar los markers.
      const ro = new ResizeObserver(() => {
        const el = divRef.current;
        const m = mapRef.current;
        if (!el || !m) return;
        const hasSize = el.clientWidth > 0 && el.clientHeight > 0;
        m.invalidateSize();
        if (hasSize && !hadSizeRef.current && boundsRef.current) {
          m.fitBounds(boundsRef.current, { padding: [48, 48], maxZoom: 15 });
        }
        hadSizeRef.current = hasSize;
      });
      ro.observe(divRef.current);
      roRef.current = ro;

      setMapEpoch((e) => e + 1);
    })();
    return () => {
      cancelled = true;
      roRef.current?.disconnect();
      roRef.current = null;
      hadSizeRef.current = false;
      markers.clear();
      pinIndex.clear();
      layerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Markers: se reconstruyen cuando cambian las cards (búsqueda nueva o página nueva).
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!L || !map || !layer) return;

    layer.clearLayers();
    markersRef.current.clear();
    pinsRef.current.clear();

    const points: LType.LatLngExpression[] = [];
    const batch: LType.Marker[] = [];
    for (const pin of pins) {
      if (pin.latitude == null || pin.longitude == null) continue;
      const pos: [number, number] = [pin.latitude, pin.longitude];
      points.push(pos);
      const marker = L.marker(pos, {
        icon: markerIcon(L, pin, false),
        riseOnHover: true,
      });
      marker.on("click", () => {
        onSelectRef.current(pin.id);
        trackEvent(EVENTS.MAP_MARKER_CLICK, { property_id: pin.id });
      });
      marker.bindPopup(popupHtml(pin, searchIdRef.current), { closeButton: false, offset: [0, -14] });
      markersRef.current.set(pin.id, marker);
      pinsRef.current.set(pin.id, pin);
      batch.push(marker);
    }
    // addLayers en lote: con ~2.000 pins agregar de a uno cuesta segundos.
    layer.addLayers(batch);

    if (points.length > 0) {
      boundsRef.current = trimmedBounds(L, pins);
      if (boundsRef.current && divRef.current && divRef.current.clientWidth > 0) {
        map.fitBounds(boundsRef.current, { padding: [48, 48], maxZoom: 15 });
      }
    } else {
      boundsRef.current = null;
      map.setView(SJ_CENTER, 12);
    }
  }, [mapEpoch, pins]);

  // Resaltar el marker de la card seleccionada/hovereada.
  useEffect(() => {
    const L = LRef.current;
    if (!L) return;
    for (const [id, marker] of markersRef.current) {
      const pin = pinsRef.current.get(id);
      if (!pin) continue;
      marker.setIcon(markerIcon(L, pin, id === selectedId));
      marker.setZIndexOffset(id === selectedId ? 1000 : 0);
    }
  }, [mapEpoch, selectedId, pins]);

  return <div ref={divRef} className="leaflet-host" role="region" aria-label="Mapa de resultados" />;
}
