"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { REGION_OPTIONS } from "@/lib/regions";
import { MapLocationSelector } from "@/components/location/MapLocationSelector";

function regionLabel(codeRaw: string, nameRaw: string): string {
  const code = String(codeRaw ?? "").trim().toUpperCase();
  const name = String(nameRaw ?? "").trim();
  if (!code) return "—";
  return name ? `${code} — ${name}` : code;
}

export default function RouterSetupPage() {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState<"CA" | "US" | "">("");
  const [stateProvince, setStateProvince] = useState("");
  const [mapDisplayName, setMapDisplayName] = useState("");
  const [mapLat, setMapLat] = useState(0);
  const [mapLng, setMapLng] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const regionOptions = country === "CA" || country === "US" ? REGION_OPTIONS[country] : [];

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const resp = await fetch("/api/app/router/profile", { cache: "no-store", credentials: "include" });
        const json = (await resp.json().catch(() => null)) as any;
        if (!alive || !resp.ok || !json?.ok) return;
        const p = json?.data?.profile;
        const r = json?.data?.router;
        if (p) {
          setName(String(p.name ?? "").trim());
          setAddress(String(p.address ?? "").trim());
          setCity(String(p.city ?? "").trim());
          setPostalCode(String(p.postalCode ?? "").trim());
          setStateProvince(String(p.stateProvince ?? r?.homeRegionCode ?? "").trim().toUpperCase());
          setMapDisplayName(String(r?.formattedAddress ?? "").trim());
          setMapLat(Number(p.lat ?? 0) || 0);
          setMapLng(Number(p.lng ?? 0) || 0);
        }
        const c = String(p?.country ?? r?.homeCountry ?? "").trim().toUpperCase();
        setCountry(c === "CA" || c === "US" ? c : "");
      } catch {
        // ignore
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const geoSelected = Number.isFinite(mapLat) && Number.isFinite(mapLng) && !(mapLat === 0 && mapLng === 0);

  async function handleSave() {
    setError(null);
    setNotice(null);
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!address.trim()) {
      setError("Address is required.");
      return;
    }
    if (!city.trim()) {
      setError("City is required.");
      return;
    }
    if (!postalCode.trim()) {
      setError("Postal / ZIP is required.");
      return;
    }
    if (country !== "CA" && country !== "US") {
      setError("Country is required.");
      return;
    }
    const sp = String(stateProvince ?? "").trim().toUpperCase();
    if (!sp) {
      setError("State / Province is required.");
      return;
    }
    if (!geoSelected) {
      setError("Please select your location from the map suggestions.");
      return;
    }

    setSaving(true);
    try {
      const resp = await fetch("/api/app/router/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: name.trim(),
          address: address.trim(),
          city: city.trim(),
          stateProvince: sp,
          postalCode: postalCode.trim(),
          country,
          mapDisplayName: mapDisplayName.trim(),
          lat: mapLat,
          lng: mapLng,
        }),
      });
      const json = (await resp.json().catch(() => null)) as { ok?: boolean; error?: string };
      if (!resp.ok) {
        const msg = json?.error === "INVALID_INPUT" ? "Please fill all required fields." : json?.error === "INVALID_GEO_COORDINATES" ? "Please select your location from the map." : "Save failed.";
        throw new Error(msg);
      }
      setNotice("Saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-4xl font-bold text-gray-900">Router Setup (v2 Portal)</h1>
        <p className="text-gray-600 mt-3">Complete your profile to start routing jobs.</p>

        <div className="mt-8 space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Name *</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
              placeholder="Jane Router"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Address *</span>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
              placeholder="5393 201 Street"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">City *</span>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
              placeholder="Langley"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Postal / ZIP *</span>
            <input
              type="text"
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
              placeholder="V2Y 0R2"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Country *</span>
            <select
              value={country}
              onChange={(e) => {
                const v = (e.target.value || "").toUpperCase();
                setCountry(v === "CA" || v === "US" ? v : "");
                setStateProvince("");
              }}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
            >
              <option value="">Select…</option>
              <option value="CA">CA — Canada</option>
              <option value="US">US — United States</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">State / Province *</span>
            <select
              value={stateProvince}
              onChange={(e) => setStateProvince((e.target.value || "").toUpperCase())}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
              disabled={!country}
            >
              <option value="">{country ? "Select…" : "Select country first"}</option>
              {regionOptions.map((o) => (
                <option key={o.code} value={o.code}>
                  {regionLabel(o.code, o.name)}
                </option>
              ))}
            </select>
          </label>

          <div className="border border-gray-200 rounded-xl p-4 mt-6">
            <div className="font-semibold text-gray-900">Map location *</div>
            <div className="text-sm text-gray-600 mt-1">Required for routing distance.</div>
            <div className="mt-3">
              <MapLocationSelector
                required
                value={mapDisplayName}
                onChange={(d) => {
                  setMapDisplayName(d.mapDisplayName);
                  setMapLat(d.lat);
                  setMapLng(d.lng);
                }}
                errorText={!geoSelected && (address || mapDisplayName) ? "Select a result from the suggestions." : ""}
              />
            </div>
          </div>

          {error && <div className="text-sm text-red-600">{error}</div>}
          {notice && <div className="text-sm text-green-600 font-semibold">{notice}</div>}

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={
                saving ||
                !name.trim() ||
                !address.trim() ||
                !city.trim() ||
                !postalCode.trim() ||
                !(country === "CA" || country === "US") ||
                !String(stateProvince).trim() ||
                !geoSelected
              }
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 disabled:bg-gray-200 disabled:text-gray-500"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <Link
              href="/app/router"
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
            >
              Back to dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
