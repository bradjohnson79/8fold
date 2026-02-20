"use client";

import React from "react";
import { GeoAutocomplete, type GeoAutocompleteResult } from "@/components/GeoAutocomplete";

type MapLocationData = {
  mapDisplayName: string;
  lat: number;
  lng: number;
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
        props.onChange({ mapDisplayName: v, lat: 0, lng: 0 });
      }}
      onPick={(r: GeoAutocompleteResult) => {
        props.onChange({ mapDisplayName: r.display_name, lat: r.lat, lng: r.lon });
      }}
      errorText={props.errorText}
    />
  );
}

