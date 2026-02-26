"use client";

import React from "react";
import { GeoAutocomplete, type GeoAutocompleteResult } from "@/components/GeoAutocomplete";

type MapLocationData = {
  mapDisplayName: string;
  lat: number;
  lng: number;
  placeId: string;
  countryCode: "US" | "CA" | "";
  regionCode: string;
  city: string;
  postalCode: string;
};

type Props = {
  value: string;
  onChange: (data: MapLocationData) => void;
  required?: boolean;
  label?: string;
  errorText?: string;
};

export function MapLocationSelector(props: Props) {
  return (
    <GeoAutocomplete
      label={props.label ?? "Map location (required for routing distance)"}
      required={props.required}
      value={props.value}
      onChange={(v) => {
        // Manual typing invalidates coordinates until a suggestion is selected.
        props.onChange({
          mapDisplayName: v,
          lat: 0,
          lng: 0,
          placeId: "",
          countryCode: "",
          regionCode: "",
          city: "",
          postalCode: "",
        });
      }}
      onPick={(r: GeoAutocompleteResult) => {
        props.onChange({
          mapDisplayName: r.display_name,
          lat: r.lat,
          lng: r.lon,
          placeId: String(r.place_id ?? ""),
          countryCode: r.address.country,
          regionCode: r.address.state ?? "",
          city: r.address.city ?? "",
          postalCode: r.address.postcode ?? "",
        });
      }}
      errorText={props.errorText}
    />
  );
}
