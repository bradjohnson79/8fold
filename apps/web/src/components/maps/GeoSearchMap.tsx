"use client";

import React, { useEffect, useMemo, useState } from "react";
import { GoogleAddressAutocomplete } from "@/components/GoogleAddressAutocomplete";

export type GeoResult = {
  latitude: number;
  longitude: number;
  provinceState: string;
  formattedAddress: string;
  displayName: string;
  countryCode: "US" | "CA" | "";
  regionCode: string;
  city: string;
  postalCode: string;
  placeId: string;
};

export type GeoSearchMapProps = {
  initialQuery?: string;
  onSelect: (result: GeoResult) => void;
};

export function GeoSearchMap({ initialQuery, onSelect }: GeoSearchMapProps) {
  const [mapQuery, setMapQuery] = useState(initialQuery ?? "");
  const [selectedGeo, setSelectedGeo] = useState<GeoResult | null>(null);

  useEffect(() => {
    setMapQuery(initialQuery ?? "");
  }, [initialQuery]);

  const activeGeo = useMemo(() => selectedGeo, [selectedGeo]);

  return (
    <>
      <GoogleAddressAutocomplete
        label="Map Location Search"
        required
        value={mapQuery}
        onChange={(value) => {
          setMapQuery(value);
          setSelectedGeo(null);
        }}
        onPick={(result) => {
          const normalized: GeoResult = {
            latitude: result.latitude,
            longitude: result.longitude,
            provinceState: result.regionCode || result.city || "",
            formattedAddress: result.formattedAddress,
            displayName: result.displayName,
            countryCode: result.countryCode,
            regionCode: result.regionCode,
            city: result.city,
            postalCode: result.postalCode,
            placeId: result.placeId,
          };
          setSelectedGeo(normalized);
          setMapQuery(normalized.formattedAddress);
          onSelect(normalized);
        }}
        placeholder="Search and select address (min 3 characters)"
        helperText="Select a result to capture coordinates for routing."
      />
      {activeGeo && (
        <div className="mt-3 text-xs text-gray-600">
          <div>{activeGeo.formattedAddress}</div>
          <div>
            {activeGeo.latitude.toFixed(5)}, {activeGeo.longitude.toFixed(5)}
          </div>
        </div>
      )}
    </>
  );
}
