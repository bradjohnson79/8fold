"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

type GeoResult = {
  latitude: number;
  longitude: number;
  provinceState: string;
  formattedAddress: string;
};

export default function RouterSetupPage() {
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [homeRegion, setHomeRegion] = useState("");
  const [serviceAreasText, setServiceAreasText] = useState("");
  const [availability, setAvailability] = useState<string[]>([]);
  const [geoQuery, setGeoQuery] = useState("");
  const [geoResults, setGeoResults] = useState<GeoResult[]>([]);
  const [selectedGeo, setSelectedGeo] = useState<GeoResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const resp = await fetch("/api/v4/router/profile", { cache: "no-store", credentials: "include" });
        const json = (await resp.json().catch(() => null)) as any;
        if (!alive || !resp.ok || !json?.ok) return;
        const p = json?.profile;
        if (p) {
          setContactName(String(p.contactName ?? "").trim());
          setPhone(String(p.phone ?? "").trim());
          setHomeRegion(String(p.homeRegion ?? "").trim());
          setServiceAreasText(Array.isArray(p.serviceAreas) ? p.serviceAreas.join(", ") : "");
          setAvailability(Array.isArray(p.availability) ? p.availability : []);
          if (typeof p.homeLatitude === "number" && typeof p.homeLongitude === "number") {
            setSelectedGeo({
              latitude: p.homeLatitude,
              longitude: p.homeLongitude,
              provinceState: "NA",
              formattedAddress: "Saved location",
            });
          }
        }
      } catch {}
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!geoQuery.trim()) return;
    const t = setTimeout(async () => {
      const resp = await fetch("/api/v4/geo/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: geoQuery.trim() }),
      });
      const data = (await resp.json().catch(() => ({}))) as { results?: GeoResult[] };
      setGeoResults(Array.isArray(data.results) ? data.results : []);
    }, 350);
    return () => clearTimeout(t);
  }, [geoQuery]);

  function toggleAvailability(slot: string) {
    setAvailability((prev) => (prev.includes(slot) ? prev.filter((s) => s !== slot) : [...prev, slot]));
  }

  async function handleSave() {
    setError(null);
    setNotice(null);
    if (!contactName.trim()) return setError("Contact Name is required.");
    if (!phone.trim()) return setError("Phone is required.");
    if (!homeRegion.trim()) return setError("Home Region is required.");
    if (!serviceAreasText.trim()) return setError("Service Areas are required.");
    if (availability.length === 0) return setError("Select availability.");
    if (!selectedGeo) return setError("Select your location from geocode results.");

    setSaving(true);
    try {
      const resp = await fetch("/api/v4/router/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          contactName: contactName.trim(),
          phone: phone.trim(),
          homeRegion: homeRegion.trim(),
          serviceAreas: serviceAreasText
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          availability,
          homeLatitude: selectedGeo.latitude,
          homeLongitude: selectedGeo.longitude,
        }),
      });
      const json = (await resp.json().catch(() => null)) as { ok?: boolean; error?: string };
      if (!resp.ok || !json?.ok) throw new Error(json?.error ?? "Save failed.");
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
        <h1 className="text-4xl font-bold text-gray-900">Router Setup</h1>
        <p className="text-gray-600 mt-3">Complete your profile to start routing jobs.</p>

        <div className="mt-8 space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Contact Name *</span>
            <input
              type="text"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Phone *</span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Home Region *</span>
            <input
              type="text"
              value={homeRegion}
              onChange={(e) => setHomeRegion(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Service Areas (comma-separated) *</span>
            <input
              type="text"
              value={serviceAreasText}
              onChange={(e) => setServiceAreasText(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </label>

          <div className="rounded-lg border border-gray-200 p-3">
            <div className="text-sm font-medium text-gray-700">Availability</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {["Mon AM", "Mon PM", "Tue AM", "Tue PM", "Wed AM", "Wed PM", "Thu AM", "Thu PM", "Fri AM", "Fri PM"].map((slot) => (
                <label key={slot} className="inline-flex items-center gap-2 rounded border px-2 py-1 text-xs">
                  <input type="checkbox" checked={availability.includes(slot)} onChange={() => toggleAvailability(slot)} />
                  {slot}
                </label>
              ))}
            </div>
          </div>

          <div className="border border-gray-200 rounded-xl p-4 mt-6">
            <div className="font-semibold text-gray-900">Home Location *</div>
            <input
              type="text"
              value={geoQuery}
              onChange={(e) => {
                setGeoQuery(e.target.value);
                setSelectedGeo(null);
              }}
              className="mt-2 block w-full rounded-md border border-gray-300 px-3 py-2"
              placeholder="Search home address..."
            />
            <div className="mt-2 max-h-40 overflow-auto rounded border border-gray-200">
              {geoResults.map((r, idx) => (
                <button
                  key={`${r.formattedAddress}-${idx}`}
                  type="button"
                  onClick={() => setSelectedGeo(r)}
                  className="block w-full border-b px-3 py-2 text-left text-sm hover:bg-gray-50"
                >
                  {r.formattedAddress}
                </button>
              ))}
            </div>
            {selectedGeo && (
              <iframe
                title="OSM preview"
                className="mt-3 h-64 w-full rounded border"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${selectedGeo.longitude - 0.01}%2C${selectedGeo.latitude - 0.01}%2C${selectedGeo.longitude + 0.01}%2C${selectedGeo.latitude + 0.01}&layer=mapnik&marker=${selectedGeo.latitude}%2C${selectedGeo.longitude}`}
              />
            )}
          </div>

          {error && <div className="text-sm text-red-600">{error}</div>}
          {notice && <div className="text-sm text-green-600 font-semibold">{notice}</div>}

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !contactName.trim() || !phone.trim() || !homeRegion.trim() || !serviceAreasText.trim() || availability.length === 0 || !selectedGeo}
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
