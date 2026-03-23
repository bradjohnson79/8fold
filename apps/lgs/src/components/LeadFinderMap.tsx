"use client";

/**
 * LeadFinderMap — Interactive Google Maps component for radius-based contractor discovery.
 *
 * Features:
 *   - Centers on lat/lng of selected city (auto-populated)
 *   - Draws a circle showing the discovery radius
 *   - Click anywhere on the map to move the center
 *   - Drag the map to reposition
 *   - Radius slider updates the circle in real time
 *
 * Requires NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in apps/lgs/.env.local
 */

import { useEffect, useRef, useCallback } from "react";

declare global {
  interface Window {
    google: any;
    initLeadFinderMap?: () => void;
  }
}

export type LatLng = { lat: number; lng: number };

type Props = {
  center: LatLng;
  radiusKm: number;
  onCenterChange?: (latlng: LatLng) => void;
  height?: number;
};

const MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

let scriptLoaded = false;
let scriptLoading = false;
const onLoadCallbacks: Array<() => void> = [];

function loadMapsScript(onLoad: () => void) {
  if (scriptLoaded) { onLoad(); return; }
  onLoadCallbacks.push(onLoad);
  if (scriptLoading) return;
  scriptLoading = true;
  window.initLeadFinderMap = () => {
    scriptLoaded = true;
    onLoadCallbacks.forEach((cb) => cb());
    onLoadCallbacks.length = 0;
  };
  const script = document.createElement("script");
  script.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_API_KEY}&callback=initLeadFinderMap&libraries=geometry`;
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
}

export function LeadFinderMap({ center, radiusKm, onCenterChange, height = 320 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const circleRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  const initMap = useCallback(() => {
    if (!containerRef.current || !window.google) return;

    const map = new window.google.maps.Map(containerRef.current, {
      center,
      zoom: radiusKm >= 75 ? 9 : radiusKm >= 50 ? 10 : radiusKm >= 25 ? 11 : 12,
      mapTypeId: "roadmap",
      styles: [
        { elementType: "geometry", stylers: [{ color: "#1e293b" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#0f172a" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#64748b" }] },
        { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#94a3b8" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#334155" }] },
        { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#475569" }] },
        { featureType: "water", elementType: "geometry", stylers: [{ color: "#0f172a" }] },
      ],
      disableDefaultUI: false,
      zoomControl: true,
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: false,
    });

    const circle = new window.google.maps.Circle({
      map,
      center,
      radius: radiusKm * 1000,
      fillColor: "#3b82f6",
      fillOpacity: 0.15,
      strokeColor: "#3b82f6",
      strokeOpacity: 0.8,
      strokeWeight: 2,
    });

    const marker = new window.google.maps.Marker({
      map,
      position: center,
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: 6,
        fillColor: "#3b82f6",
        fillOpacity: 1,
        strokeColor: "#fff",
        strokeWeight: 2,
      },
      draggable: true,
      title: "Drag to reposition search center",
    });

    // Click on map sets new center
    map.addListener("click", (e: any) => {
      if (!e.latLng) return;
      const pos = { lat: e.latLng.lat(), lng: e.latLng.lng() };
      marker.setPosition(pos);
      circle.setCenter(pos);
      onCenterChange?.(pos);
    });

    // Drag marker to reposition
    marker.addListener("dragend", () => {
      const pos = marker.getPosition();
      if (!pos) return;
      const latlng = { lat: pos.lat(), lng: pos.lng() };
      circle.setCenter(latlng);
      onCenterChange?.(latlng);
    });

    mapRef.current = map;
    circleRef.current = circle;
    markerRef.current = marker;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!MAPS_API_KEY) return;
    loadMapsScript(() => initMap());
  }, [initMap]);

  // Update circle radius when radiusKm changes
  useEffect(() => {
    if (circleRef.current) {
      circleRef.current.setRadius(radiusKm * 1000);
      // Adjust zoom level to show the radius
      const zoom = radiusKm >= 75 ? 9 : radiusKm >= 50 ? 10 : radiusKm >= 25 ? 11 : 12;
      mapRef.current?.setZoom(zoom);
    }
  }, [radiusKm]);

  // Update map center + circle when center prop changes (e.g. city selection)
  useEffect(() => {
    if (mapRef.current && circleRef.current && markerRef.current) {
      mapRef.current.setCenter(center);
      circleRef.current.setCenter(center);
      markerRef.current.setPosition(center);
    }
  }, [center.lat, center.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!MAPS_API_KEY) {
    return (
      <div style={{
        height,
        background: "#0f172a",
        border: "1px dashed #334155",
        borderRadius: 8,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: "0.5rem",
        color: "#475569",
        fontSize: "0.85rem",
        textAlign: "center",
        padding: "1rem",
      }}>
        <div style={{ fontSize: "1.5rem" }}>🗺</div>
        <div>Map preview requires <code style={{ color: "#60a5fa" }}>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code></div>
        <div style={{ fontSize: "0.75rem" }}>Add to <code>apps/lgs/.env.local</code></div>
        <div style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "#334155" }}>
          Center: {center.lat.toFixed(4)}, {center.lng.toFixed(4)} · Radius: {radiusKm} km
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <div ref={containerRef} style={{ height, borderRadius: 8, overflow: "hidden", border: "1px solid #334155" }} />
      <div style={{
        position: "absolute",
        bottom: 8,
        left: 8,
        background: "rgba(15,23,42,0.85)",
        borderRadius: 5,
        padding: "0.3rem 0.6rem",
        fontSize: "0.72rem",
        color: "#64748b",
        backdropFilter: "blur(4px)",
      }}>
        {center.lat.toFixed(4)}, {center.lng.toFixed(4)} · {radiusKm} km radius · Click map or drag pin to reposition
      </div>
    </div>
  );
}
