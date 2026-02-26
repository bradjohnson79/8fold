"use client";

import React from "react";
import { GoogleAddressAutocomplete } from "@/components/GoogleAddressAutocomplete";

export type GeoAutocompleteResult = {
  place_id: string | number | null;
  display_name: string;
  lat: number;
  lon: number;
  address: {
    city: string | null;
    state: string | null;
    postcode: string | null;
    country: "US" | "CA";
  };
};

export function GeoAutocomplete(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onPick: (r: GeoAutocompleteResult) => void;
  helperText?: string;
  placeholder?: string;
  required?: boolean;
  errorText?: string;
}) {
  return (
    <GoogleAddressAutocomplete
      label={props.label}
      value={props.value}
      onChange={props.onChange}
      onPick={(r) => {
        props.onPick({
          place_id: r.placeId,
          display_name: r.displayName,
          lat: r.latitude,
          lon: r.longitude,
          address: {
            city: r.city || null,
            state: r.regionCode || null,
            postcode: r.postalCode || null,
            country: r.countryCode === "CA" ? "CA" : "US",
          },
        });
      }}
      helperText={props.helperText}
      placeholder={props.placeholder}
      required={props.required}
      errorText={props.errorText}
    />
  );
}
