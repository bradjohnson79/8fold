"use client";

import React from "react";
import Script from "next/script";

const GOOGLE_SCRIPT_ID = "admin-google-places-script";

const REGIONS: Record<string, Array<{ code: string; name: string }>> = {
  CA: [
    { code: "BC", name: "British Columbia" },
    { code: "AB", name: "Alberta" },
    { code: "SK", name: "Saskatchewan" },
    { code: "MB", name: "Manitoba" },
    { code: "ON", name: "Ontario" },
    { code: "QC", name: "Quebec" },
    { code: "NB", name: "New Brunswick" },
    { code: "NS", name: "Nova Scotia" },
    { code: "PE", name: "Prince Edward Island" },
    { code: "NL", name: "Newfoundland and Labrador" },
    { code: "YT", name: "Yukon" },
    { code: "NT", name: "Northwest Territories" },
    { code: "NU", name: "Nunavut" },
  ],
  US: [
    { code: "WA", name: "Washington" },
    { code: "OR", name: "Oregon" },
    { code: "CA", name: "California" },
    { code: "ID", name: "Idaho" },
    { code: "NV", name: "Nevada" },
    { code: "AZ", name: "Arizona" },
    { code: "AL", name: "Alabama" },
    { code: "AK", name: "Alaska" },
    { code: "AR", name: "Arkansas" },
    { code: "CO", name: "Colorado" },
    { code: "CT", name: "Connecticut" },
    { code: "DE", name: "Delaware" },
    { code: "DC", name: "District of Columbia" },
    { code: "FL", name: "Florida" },
    { code: "GA", name: "Georgia" },
    { code: "HI", name: "Hawaii" },
    { code: "IL", name: "Illinois" },
    { code: "IN", name: "Indiana" },
    { code: "IA", name: "Iowa" },
    { code: "KS", name: "Kansas" },
    { code: "KY", name: "Kentucky" },
    { code: "LA", name: "Louisiana" },
    { code: "ME", name: "Maine" },
    { code: "MD", name: "Maryland" },
    { code: "MA", name: "Massachusetts" },
    { code: "MI", name: "Michigan" },
    { code: "MN", name: "Minnesota" },
    { code: "MS", name: "Mississippi" },
    { code: "MO", name: "Missouri" },
    { code: "MT", name: "Montana" },
    { code: "NE", name: "Nebraska" },
    { code: "NH", name: "New Hampshire" },
    { code: "NJ", name: "New Jersey" },
    { code: "NM", name: "New Mexico" },
    { code: "NY", name: "New York" },
    { code: "NC", name: "North Carolina" },
    { code: "ND", name: "North Dakota" },
    { code: "OH", name: "Ohio" },
    { code: "OK", name: "Oklahoma" },
    { code: "PA", name: "Pennsylvania" },
    { code: "RI", name: "Rhode Island" },
    { code: "SC", name: "South Carolina" },
    { code: "SD", name: "South Dakota" },
    { code: "TN", name: "Tennessee" },
    { code: "TX", name: "Texas" },
    { code: "UT", name: "Utah" },
    { code: "VT", name: "Vermont" },
    { code: "VA", name: "Virginia" },
    { code: "WV", name: "West Virginia" },
    { code: "WI", name: "Wisconsin" },
    { code: "WY", name: "Wyoming" },
  ],
};

const inputStyle: React.CSSProperties = {
  background: "rgba(2,6,23,0.35)",
  border: "1px solid rgba(148,163,184,0.14)",
  color: "rgba(226,232,240,0.92)",
  borderRadius: 12,
  padding: "9px 10px",
  fontSize: 13,
  width: "100%",
};

const buttonStyle: React.CSSProperties = {
  background: "rgba(34,197,94,0.16)",
  border: "1px solid rgba(34,197,94,0.35)",
  color: "rgba(134,239,172,0.95)",
  borderRadius: 12,
  padding: "9px 12px",
  fontSize: 13,
  fontWeight: 950,
  cursor: "pointer",
};

type PlaceData = {
  address: string;
  city: string;
  postalCode: string;
  regionCode: string;
  countryCode: string;
  latitude: number;
  longitude: number;
};

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  defaultTitle: string;
  defaultScope: string;
  defaultCountryCode: string;
  defaultRegionCode: string;
  defaultTradeCategory: string;
  defaultAddress?: string;
  defaultCity?: string;
  defaultPostalCode?: string;
  jobId: string;
};

export default function JobEditForm({
  action,
  defaultTitle,
  defaultScope,
  defaultCountryCode,
  defaultRegionCode,
  defaultTradeCategory,
  defaultAddress,
  defaultCity,
  defaultPostalCode,
  jobId,
}: Props) {
  const countryCode = String(defaultCountryCode ?? "").trim().toUpperCase();
  const initialCountry = countryCode === "CA" || countryCode === "US" ? countryCode : "CA";
  const [selectedCountry, setSelectedCountry] = React.useState(initialCountry);
  const [selectedRegion, setSelectedRegion] = React.useState<string | null>(null);
  const [placeData, setPlaceData] = React.useState<PlaceData | null>(null);
  const [scriptReady, setScriptReady] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const regionOptions = REGIONS[selectedCountry] ?? REGIONS.CA;
  const currentRegionValid = regionOptions.some((r) => r.code === defaultRegionCode);
  const initialRegion = currentRegionValid ? defaultRegionCode : (regionOptions[0]?.code ?? "");
  const regionValue = selectedRegion ?? (selectedCountry === initialCountry ? initialRegion : regionOptions[0]?.code ?? "");

  const googleKey = process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY ?? "";

  React.useEffect(() => {
    if (!scriptReady || !inputRef.current || !(window as any).google?.maps?.places) return;
    const autocomplete = new (window as any).google.maps.places.Autocomplete(inputRef.current, {
      types: ["address"],
      componentRestrictions: { country: ["ca", "us"] },
      fields: ["address_components", "formatted_address", "geometry"],
    });
    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      const components = place?.address_components ?? [];
      const get = (type: string) => components.find((c: any) => c.types?.includes(type));
      const locality = get("locality") ?? get("postal_town") ?? get("administrative_area_level_2");
      const region = get("administrative_area_level_1");
      const country = get("country");
      const postal = get("postal_code");
      const loc = place?.geometry?.location;
      const lat = typeof loc?.lat === "function" ? loc.lat() : Number(loc?.lat) || 0;
      const lng = typeof loc?.lng === "function" ? loc.lng() : Number(loc?.lng) || 0;
      const cc = String(country?.short_name ?? "").trim().toUpperCase();
      const rc = String(region?.short_name ?? "").trim().toUpperCase();
      if (!place?.formatted_address || !Number.isFinite(lat) || !Number.isFinite(lng) || (cc !== "CA" && cc !== "US")) return;
      setPlaceData({
        address: place.formatted_address,
        city: String(locality?.long_name ?? "").trim(),
        postalCode: String(postal?.long_name ?? "").trim(),
        regionCode: rc,
        countryCode: cc,
        latitude: lat,
        longitude: lng,
      });
      setSelectedCountry(cc);
      setSelectedRegion(rc);
    });
    return () => {};
  }, [scriptReady]);

  return (
    <>
      {googleKey ? (
        <Script
          id={GOOGLE_SCRIPT_ID}
          src={`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(googleKey)}&libraries=places&v=weekly`}
          strategy="afterInteractive"
          onLoad={() => setScriptReady(true)}
        />
      ) : null}
      <form action={action} style={{ display: "grid", gap: 6 }}>
        <input
          ref={inputRef}
          id={`admin-address-autocomplete-${jobId}`}
          placeholder="Search address..."
          defaultValue={defaultAddress ?? ""}
          style={{ ...inputStyle, width: "100%" }}
          autoComplete="off"
        />
        {placeData ? (
          <>
            <input type="hidden" name="address_full" value={placeData.address} />
            <input type="hidden" name="city" value={placeData.city} />
            <input type="hidden" name="postal_code" value={placeData.postalCode} />
            <input type="hidden" name="latitude" value={String(placeData.latitude)} />
            <input type="hidden" name="longitude" value={String(placeData.longitude)} />
          </>
        ) : null}
        <input name="title" placeholder="Title" defaultValue={defaultTitle} style={{ ...inputStyle, width: "100%" }} />
        <input name="scope" placeholder="Scope" defaultValue={defaultScope} style={{ ...inputStyle, width: "100%" }} />
        <select
        name="country_code"
        value={selectedCountry}
        onChange={(e) => setSelectedCountry(e.target.value)}
        style={{ ...inputStyle, width: "100%" }}
      >
        <option value="">Select Country</option>
        <option value="CA">Canada</option>
        <option value="US">United States</option>
      </select>
      <select
        name="region_code"
        key={selectedCountry}
        value={regionValue}
        onChange={(e) => setSelectedRegion(e.target.value || null)}
        style={{ ...inputStyle, width: "100%" }}
      >
        <option value="">Select Province/State</option>
        {regionOptions.map((r) => (
          <option key={r.code} value={r.code}>
            {r.name} ({r.code})
          </option>
        ))}
      </select>
      <input
        name="trade_category"
        placeholder="Trade"
        defaultValue={defaultTradeCategory}
        style={{ ...inputStyle, width: "100%" }}
      />
      <button type="submit" style={buttonStyle}>
        Save
      </button>
    </form>
    </>
  );
}
