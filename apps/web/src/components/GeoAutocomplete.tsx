"use client";

import React from "react";

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
  const [results, setResults] = React.useState<GeoAutocompleteResult[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const q = props.value.trim();
    if (q.length < 3) {
      setResults([]);
      setOpen(false);
      return;
    }

    let alive = true;
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(() => {
      (async () => {
        try {
          const resp = await fetch(`/api/app/geo/autocomplete?q=${encodeURIComponent(q)}`, {
            cache: "no-store",
            signal: ctrl.signal,
          });
          const json = (await resp.json().catch(() => null)) as any;
          const list = Array.isArray(json?.results) ? (json.results as GeoAutocompleteResult[]) : [];
          if (!alive) return;
          setResults(list.slice(0, 8));
          setOpen(list.length > 0);
        } catch {
          if (!alive) return;
          setResults([]);
          setOpen(false);
        } finally {
          if (alive) setLoading(false);
        }
      })();
    }, 300);

    return () => {
      alive = false;
      ctrl.abort();
      clearTimeout(t);
    };
  }, [props.value]);

  return (
    <div className="relative">
      <label className="block">
        <div className="text-sm font-medium text-gray-700">
          {props.label}{" "}
          {props.required ? <span className="text-red-600" aria-hidden>*</span> : null}
        </div>
        <input
          className={[
            "mt-1 w-full border rounded-lg px-3 py-2",
            props.errorText ? "border-red-400" : "border-gray-300",
          ].join(" ")}
          placeholder={props.placeholder ?? "Start typing an address…"}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          onFocus={() => setOpen(results.length > 0)}
          onBlur={() => {
            // Defer close so click events on results can fire.
            setTimeout(() => setOpen(false), 120);
          }}
        />
        <div className="mt-1 text-xs text-gray-500">
          {props.errorText ? <span className="text-red-600">{props.errorText}</span> : null}
          {!props.errorText ? (
            loading ? "Searching…" : props.helperText ?? "US/Canada only. Select a result to capture coordinates."
          ) : null}
        </div>
      </label>

      {open && results.length ? (
        <div className="absolute z-20 mt-2 w-full border border-gray-200 rounded-xl bg-white shadow-lg overflow-hidden">
          {results.map((r) => (
            <button
              type="button"
              key={String(r.place_id ?? r.display_name)}
              className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
              onMouseDown={(e) => {
                e.preventDefault();
                props.onPick(r);
                setOpen(false);
              }}
            >
              <div className="text-sm text-gray-900 font-medium">{r.display_name}</div>
              <div className="text-xs text-gray-500 mt-0.5">
                {[r.address.city, r.address.state, r.address.country].filter(Boolean).join(", ")}
              </div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

