"use client";

import React, { useEffect, useMemo, useState } from "react";

export type GeoResult = {
  latitude: number;
  longitude: number;
  provinceState: string;
  formattedAddress: string;
  displayName: string;
};

export type GeoSearchMapProps = {
  initialQuery?: string;
  onSelect: (result: GeoResult) => void;
};

type GeocodeResponse = {
  results?: Array<{
    latitude: number;
    longitude: number;
    provinceState: string;
    formattedAddress: string;
  }>;
};

export function GeoSearchMap({ initialQuery, onSelect }: GeoSearchMapProps) {
  const [mapQuery, setMapQuery] = useState(initialQuery ?? "");
  const [geoResults, setGeoResults] = useState<GeoResult[]>([]);
  const [selectedGeo, setSelectedGeo] = useState<GeoResult | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  useEffect(() => {
    setMapQuery(initialQuery ?? "");
  }, [initialQuery]);

  useEffect(() => {
    const trimmed = mapQuery.trim();
    if (!trimmed) {
      setGeoResults([]);
      setShowSuggestions(false);
      setIsLoading(false);
      setMapError(null);
      return;
    }
    if (trimmed.length < 3) {
      setGeoResults([]);
      setShowSuggestions(false);
      setIsLoading(false);
      setMapError(null);
      return;
    }
    const controller = new AbortController();
    setIsLoading(true);
    setMapError(null);
    const t = setTimeout(async () => {
      try {
        const resp = await fetch("/api/web/v4/geo/geocode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: trimmed }),
          signal: controller.signal,
        });
        if (!resp.ok) throw new Error("GEOCODE_FAILED");
        const data = (await resp.json().catch(() => ({}))) as GeocodeResponse;
        const next = Array.isArray(data.results)
          ? data.results.map((r) => ({
              latitude: r.latitude,
              longitude: r.longitude,
              provinceState: r.provinceState,
              formattedAddress: r.formattedAddress,
              displayName: r.formattedAddress,
            }))
          : [];
        setGeoResults(next);
        setShowSuggestions(true);
        setMapError(null);
      } catch {
        if (controller.signal.aborted) return;
        setGeoResults([]);
        setShowSuggestions(true);
        setMapError("Location search is temporarily unavailable.");
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }, 350);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [mapQuery]);

  const activeGeo = useMemo(() => selectedGeo, [selectedGeo]);

  return (
    <>
      <input
        type="text"
        value={mapQuery}
        onChange={(e) => {
          setMapQuery(e.target.value);
          setSelectedGeo(null);
          setShowSuggestions(true);
        }}
        className="mt-3 block w-full rounded-md border border-gray-300 px-3 py-2"
        placeholder="Search and select address (min 3 characters)"
      />
      {showSuggestions ? (
        <div className="mt-2 max-h-40 overflow-auto rounded border border-gray-200">
          {geoResults.length > 0 ? (
            geoResults.map((result, idx) => (
              <button
                key={`${result.formattedAddress}-${idx}`}
                type="button"
                onClick={() => {
                  setSelectedGeo(result);
                  setMapQuery(result.formattedAddress);
                  setGeoResults([]);
                  setShowSuggestions(false);
                  onSelect(result);
                }}
                className="block w-full border-b px-3 py-2 text-left text-sm hover:bg-gray-50"
              >
                {result.formattedAddress}
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-gray-600">
              {isLoading ? "Searching..." : mapError ?? "No matching locations found. Try refining address."}
            </div>
          )}
        </div>
      ) : null}
      {activeGeo && (
        <div className="mt-3 text-xs text-gray-600">
          <div>{activeGeo.formattedAddress}</div>
          <div>
            {activeGeo.latitude.toFixed(5)}, {activeGeo.longitude.toFixed(5)}
          </div>
        </div>
      )}
      {activeGeo && (
        <iframe
          title="OSM preview"
          className="mt-3 h-64 w-full rounded border"
          src={`https://www.openstreetmap.org/export/embed.html?bbox=${activeGeo.longitude - 0.01}%2C${activeGeo.latitude - 0.01}%2C${activeGeo.longitude + 0.01}%2C${activeGeo.latitude + 0.01}&layer=mapnik&marker=${activeGeo.latitude}%2C${activeGeo.longitude}`}
        />
      )}
    </>
  );
}
