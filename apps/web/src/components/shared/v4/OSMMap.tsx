"use client";

import { useEffect } from "react";
import L from "leaflet";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";

const MAP_ZOOM = 14;

let markerIconsConfigured = false;

function configureLeafletMarkerIcons() {
  if (markerIconsConfigured) return;

  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "/leaflet/marker-icon-2x.png",
    iconUrl: "/leaflet/marker-icon.png",
    shadowUrl: "/leaflet/marker-shadow.png",
  });

  markerIconsConfigured = true;
}

function RecenterMap({ latitude, longitude }: { latitude: number; longitude: number }) {
  const map = useMap();

  useEffect(() => {
    map.setView([latitude, longitude], MAP_ZOOM, { animate: true });
  }, [latitude, longitude, map]);

  return null;
}

function CoordinateUpdater({ onChange }: { onChange?: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      if (!onChange) return;
      onChange(e.latlng.lat, e.latlng.lng);
    },
  });

  return null;
}

type OSMMapProps = {
  latitude: number | null;
  longitude: number | null;
  onChange?: (lat: number, lng: number) => void;
};

export default function OSMMap({ latitude, longitude, onChange }: OSMMapProps) {
  useEffect(() => {
    configureLeafletMarkerIcons();
  }, []);

  if (latitude == null || longitude == null) {
    return (
      <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-3 py-6 text-sm text-gray-600">
        Select an address above to pin your map location.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-gray-200">
      <MapContainer
        center={[latitude, longitude]}
        zoom={MAP_ZOOM}
        scrollWheelZoom={false}
        className="h-[300px] w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[latitude, longitude]} draggable={false} />
        <RecenterMap latitude={latitude} longitude={longitude} />
        {onChange ? <CoordinateUpdater onChange={onChange} /> : null}
      </MapContainer>
    </div>
  );
}
