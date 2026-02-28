"use client";

import React from "react";

export type GoogleAddressResult = {
  placeId: string;
  formattedAddress: string;
  displayName: string;
  latitude: number;
  longitude: number;
  countryCode: "US" | "CA" | "";
  regionCode: string;
  city: string;
  postalCode: string;
};

type Prediction = {
  description: string;
  place_id: string;
};

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onPick: (result: GoogleAddressResult) => void;
  helperText?: string;
  placeholder?: string;
  required?: boolean;
  errorText?: string;
};

declare global {
  interface Window {
    google?: any;
    __googlePlacesScriptPromise?: Promise<void>;
  }
}

const GOOGLE_SCRIPT_ID = "google-places-script";

function loadGooglePlacesScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("BROWSER_ONLY"));
  if (window.google?.maps?.places) return Promise.resolve();
  if (window.__googlePlacesScriptPromise) return window.__googlePlacesScriptPromise;

  const key = String(
    process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY ?? "",
  ).trim();
  if (!key) return Promise.reject(new Error("GOOGLE_PLACES_KEY_MISSING"));

  window.__googlePlacesScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(GOOGLE_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("GOOGLE_PLACES_SCRIPT_LOAD_FAILED")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = GOOGLE_SCRIPT_ID;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (!window.google?.maps?.places) {
        reject(new Error("GOOGLE_PLACES_NOT_AVAILABLE"));
        return;
      }
      resolve();
    };
    script.onerror = () => reject(new Error("GOOGLE_PLACES_SCRIPT_LOAD_FAILED"));
    document.head.appendChild(script);
  });

  return window.__googlePlacesScriptPromise;
}

function parseGooglePlace(place: any): GoogleAddressResult | null {
  const location = place?.geometry?.location;
  const lat = typeof location?.lat === "function" ? Number(location.lat()) : NaN;
  const lng = typeof location?.lng === "function" ? Number(location.lng()) : NaN;
  const formattedAddress = String(place?.formatted_address ?? "").trim();
  const placeId = String(place?.place_id ?? "").trim();
  if (!formattedAddress || !placeId || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const components = Array.isArray(place?.address_components) ? place.address_components : [];
  const byType = (type: string): any | undefined =>
    components.find((c: any) => Array.isArray(c?.types) && c.types.includes(type));

  const countryCode = String(byType("country")?.short_name ?? "").trim().toUpperCase();
  const regionCode = String(byType("administrative_area_level_1")?.short_name ?? "").trim().toUpperCase();
  const city = String(
    byType("locality")?.long_name ??
      byType("postal_town")?.long_name ??
      byType("administrative_area_level_2")?.long_name ??
      "",
  ).trim();
  const postalCode = String(byType("postal_code")?.long_name ?? "").trim();

  return {
    placeId,
    formattedAddress,
    displayName: formattedAddress,
    latitude: lat,
    longitude: lng,
    countryCode: countryCode === "US" || countryCode === "CA" ? countryCode : "",
    regionCode,
    city,
    postalCode,
  };
}

export function GoogleAddressAutocomplete(props: Props) {
  const [ready, setReady] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<Prediction[]>([]);
  const [warning, setWarning] = React.useState<string>("");

  const autocompleteRef = React.useRef<any | null>(null);
  const placesRef = React.useRef<any | null>(null);
  const sessionTokenRef = React.useRef<any | null>(null);
  const requestIdRef = React.useRef(0);

  React.useEffect(() => {
    let alive = true;
    loadGooglePlacesScript()
      .then(() => {
        if (!alive) return;
        const places = window.google?.maps?.places;
        if (!places) throw new Error("GOOGLE_PLACES_NOT_AVAILABLE");
        autocompleteRef.current = new places.AutocompleteService();
        placesRef.current = new places.PlacesService(document.createElement("div"));
        sessionTokenRef.current = new places.AutocompleteSessionToken();
        setReady(true);
        setWarning("");
      })
      .catch(() => {
        if (!alive) return;
        setReady(false);
        setWarning("Address suggestions are unavailable right now. You can continue with manual entry.");
      });
    return () => {
      alive = false;
    };
  }, []);

  React.useEffect(() => {
    const query = props.value.trim();
    if (!ready || query.length < 3) {
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      return;
    }

    const activeRequestId = requestIdRef.current + 1;
    requestIdRef.current = activeRequestId;
    setLoading(true);

    const timer = window.setTimeout(() => {
      autocompleteRef.current?.getPlacePredictions(
        {
          input: query,
          types: ["address"],
          componentRestrictions: { country: ["us", "ca"] },
          sessionToken: sessionTokenRef.current,
        },
        (predictions: Prediction[] | null, status: string) => {
          if (requestIdRef.current !== activeRequestId) return;
          const okStatus = String(window.google?.maps?.places?.PlacesServiceStatus?.OK ?? "OK");
          if (status !== okStatus || !Array.isArray(predictions)) {
            setSuggestions([]);
            setOpen(false);
            setLoading(false);
            return;
          }
          setSuggestions(predictions.slice(0, 8));
          setOpen(predictions.length > 0);
          setLoading(false);
        },
      );
    }, 300);

    return () => {
      clearTimeout(timer);
    };
  }, [props.value, ready]);

  const pickPrediction = React.useCallback(
    (prediction: Prediction) => {
      if (!ready || !placesRef.current) return;
      const places = window.google?.maps?.places;
      placesRef.current.getDetails(
        {
          placeId: prediction.place_id,
          sessionToken: sessionTokenRef.current,
          fields: ["address_components", "geometry.location", "formatted_address", "place_id"],
        },
        (place: any, status: string) => {
          const okStatus = String(places?.PlacesServiceStatus?.OK ?? "OK");
          if (status !== okStatus) {
            setWarning("Address details are unavailable right now. You can continue with manual entry.");
            return;
          }

          const normalized = parseGooglePlace(place);
          if (!normalized) {
            setWarning("Selected address is missing map coordinates. Please pick another result.");
            return;
          }

          props.onChange(normalized.displayName);
          props.onPick(normalized);
          setSuggestions([]);
          setOpen(false);
          setWarning("");

          // End this billing session after a committed selection.
          if (places?.AutocompleteSessionToken) {
            sessionTokenRef.current = new places.AutocompleteSessionToken();
          }
        },
      );
    },
    [props, ready],
  );

  return (
    <div className="relative">
      <label className="block">
        <div className="text-sm font-medium text-gray-700">
          {props.label} {props.required ? <span className="text-red-600" aria-hidden>*</span> : null}
        </div>
        <input
          className={[
            "mt-1 w-full border rounded-lg px-3 py-2",
            props.errorText ? "border-red-400" : "border-gray-300",
          ].join(" ")}
          placeholder={props.placeholder ?? "Start typing an address..."}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          onFocus={() => setOpen(suggestions.length > 0)}
          onBlur={() => {
            setTimeout(() => setOpen(false), 120);
          }}
        />
        <div className="mt-1 text-xs text-gray-500">
          {props.errorText ? <span className="text-red-600">{props.errorText}</span> : null}
          {!props.errorText ? (
            warning || (loading ? "Searching..." : props.helperText ?? "US/Canada only. Select a result to capture coordinates.")
          ) : null}
        </div>
      </label>

      {open && suggestions.length > 0 ? (
        <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          {suggestions.map((prediction) => (
            <button
              type="button"
              key={prediction.place_id}
              className="w-full border-b border-gray-100 px-4 py-3 text-left hover:bg-gray-50 last:border-b-0"
              onMouseDown={(e) => {
                e.preventDefault();
                pickPrediction(prediction);
              }}
            >
              <div className="text-sm font-medium text-gray-900">{prediction.description}</div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
