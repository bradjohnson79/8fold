"use client";

import React from "react";

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

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  defaultTitle: string;
  defaultScope: string;
  defaultCountryCode: string;
  defaultRegionCode: string;
  defaultTradeCategory: string;
};

export default function JobEditForm({
  action,
  defaultTitle,
  defaultScope,
  defaultCountryCode,
  defaultRegionCode,
  defaultTradeCategory,
}: Props) {
  const countryCode = String(defaultCountryCode ?? "").trim().toUpperCase();
  const initialCountry = countryCode === "CA" || countryCode === "US" ? countryCode : "CA";
  const [selectedCountry, setSelectedCountry] = React.useState(initialCountry);
  const regionOptions = REGIONS[selectedCountry] ?? REGIONS.CA;

  const currentRegionValid = regionOptions.some((r) => r.code === defaultRegionCode);
  const initialRegion = currentRegionValid ? defaultRegionCode : (regionOptions[0]?.code ?? "");

  return (
    <form action={action} style={{ display: "grid", gap: 6 }}>
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
        style={{ ...inputStyle, width: "100%" }}
        defaultValue={
          !selectedCountry ? "" : selectedCountry === initialCountry ? initialRegion : regionOptions[0]?.code ?? ""
        }
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
  );
}
