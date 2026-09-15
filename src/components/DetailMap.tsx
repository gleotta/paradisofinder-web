"use client";

import { useEffect, useRef } from "react";
import type * as LType from "leaflet";
import { EVENTS, trackEvent } from "@/lib/track";

/**
 * Mapa del detalle (15/09): dónde está la propiedad, con las coordenadas de P2
 * tal cual. La página solo lo monta con coordenadas; sin ellas (tier 1) o con
 * `location_confidence: "low"` (solo la zona) no hay mapa: jamás un punto inventado.
 *  - `high` (pin del portal): marcador en el punto.
 *  - `medium` (dirección escrita) o sin dato: círculo de ~250 m y la aclaración
 *    "aproximada", no un pin que aparente una precisión que no hay.
 * Sin zoom con la rueda ni arrastre con un dedo en el celular: la página tiene
 * que seguir scrolleando por encima del mapa. Leaflet toca `window` al
 * importarse → import dinámico dentro del efecto, como en `ResultsMap`.
 */
const APPROX_RADIUS_M = 250;

export default function DetailMap({
  propertyId,
  latitude,
  longitude,
  confidence,
}: {
  propertyId: string;
  latitude: number;
  longitude: number;
  confidence: "high" | "medium" | "low" | null | undefined;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const approximate = confidence !== "high";

  useEffect(() => {
    let cancelled = false;
    let map: LType.Map | null = null;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !divRef.current) return;
      const center: [number, number] = [latitude, longitude];
      map = L.map(divRef.current, {
        center,
        zoom: approximate ? 15 : 16,
        scrollWheelZoom: false,
        dragging: !L.Browser.mobile,
      });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
      }).addTo(map);
      if (approximate) {
        L.circle(center, {
          radius: APPROX_RADIUS_M,
          color: "#4D1480",
          weight: 2,
          fillColor: "#EB4283",
          fillOpacity: 0.18,
        }).addTo(map);
      } else {
        L.marker(center, {
          keyboard: false,
          icon: L.divIcon({ className: "detail-map-pin-anchor", iconSize: [0, 0], html: '<span class="detail-map-pin"></span>' }),
        }).addTo(map);
      }
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [latitude, longitude, approximate]);

  const googleMaps = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
  const note =
    confidence === "high"
      ? "Ubicación marcada en el aviso."
      : confidence === "medium"
        ? "Ubicación aproximada, a partir de la dirección del aviso."
        : "Ubicación aproximada.";

  return (
    <div data-testid="detail-map" data-confidence={confidence ?? ""}>
      <div
        ref={divRef}
        className="detail-map"
        role="region"
        aria-label={approximate ? "Mapa con la zona aproximada de la propiedad" : "Mapa con la ubicación de la propiedad"}
      />
      <div className="detail-map-foot">
        <span>{note}</span>
        <a
          href={googleMaps}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackEvent(EVENTS.DETAIL_MAP_EXTERNAL, { property_id: propertyId, confidence: confidence ?? null })}
        >
          Abrir en Google Maps ↗
        </a>
      </div>
    </div>
  );
}
