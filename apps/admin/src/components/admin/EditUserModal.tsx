"use client";

import React, { useState } from "react";

type UserRow = {
  id: string;
  role: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  businessName?: string | null;
  country?: string | null;
  regionCode?: string | null;
  city?: string | null;
};

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 50,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(0,0,0,0.60)",
};

const cardStyle: React.CSSProperties = {
  background: "rgba(15,23,42,0.98)",
  border: "1px solid rgba(148,163,184,0.18)",
  borderRadius: 16,
  padding: 28,
  width: "100%",
  maxWidth: 500,
  boxShadow: "0 16px 64px rgba(0,0,0,0.50)",
};

const inputStyle: React.CSSProperties = {
  background: "rgba(2,6,23,0.50)",
  border: "1px solid rgba(148,163,184,0.20)",
  color: "rgba(226,232,240,0.92)",
  borderRadius: 10,
  padding: "9px 10px",
  fontSize: 13,
  width: "100%",
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  color: "rgba(226,232,240,0.65)",
  marginBottom: 4,
  display: "block",
};

const btnSave: React.CSSProperties = {
  background: "rgba(59,130,246,0.85)",
  border: "1px solid rgba(59,130,246,0.40)",
  color: "#fff",
  borderRadius: 10,
  padding: "10px 20px",
  fontSize: 13,
  fontWeight: 900,
  cursor: "pointer",
};

const btnCancel: React.CSSProperties = {
  background: "transparent",
  border: "1px solid rgba(148,163,184,0.20)",
  color: "rgba(226,232,240,0.80)",
  borderRadius: 10,
  padding: "10px 20px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

export function EditUserModal({
  user,
  onClose,
  onSaved,
}: {
  user: UserRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(user.name ?? "");
  const [email, setEmail] = useState(user.email ?? "");
  const [phone, setPhone] = useState(user.phone ?? "");
  const [businessName, setBusinessName] = useState(user.businessName ?? "");
  const [homeRegion, setHomeRegion] = useState(user.regionCode ?? "");
  const [homeCountry, setHomeCountry] = useState(user.country ?? "");
  const [company, setCompany] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const role = String(user.role ?? "").toUpperCase();

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const fields: Record<string, string> = {};
      if (name !== (user.name ?? "")) fields.name = name;
      if (email !== (user.email ?? "")) fields.email = email;
      if (phone !== (user.phone ?? "")) fields.phone = phone;
      if (role === "CONTRACTOR" && businessName !== (user.businessName ?? "")) fields.businessName = businessName;
      if (role === "ROUTER") {
        if (homeRegion !== (user.regionCode ?? "")) fields.homeRegion = homeRegion;
        if (homeCountry !== (user.country ?? "")) fields.homeCountry = homeCountry;
      }
      if (role === "JOB_POSTER" && company) fields.company = company;

      if (Object.keys(fields).length === 0) {
        onClose();
        return;
      }

      const resp = await fetch("/api/admin/v4/users/update", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: user.id, fields }),
      });

      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.ok) {
        setError(json?.error?.message ?? "Failed to update user");
        return;
      }

      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={overlayStyle} onClick={onClose} role="dialog" aria-modal="true">
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 18, fontWeight: 950, color: "rgba(226,232,240,0.95)", marginBottom: 16 }}>
          Edit Profile
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <label style={labelStyle}>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} />
          </div>

          {role === "CONTRACTOR" && (
            <div>
              <label style={labelStyle}>Business Name</label>
              <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} style={inputStyle} />
            </div>
          )}

          {role === "ROUTER" && (
            <>
              <div>
                <label style={labelStyle}>Home Region</label>
                <input value={homeRegion} onChange={(e) => setHomeRegion(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Home Country</label>
                <input value={homeCountry} onChange={(e) => setHomeCountry(e.target.value)} style={inputStyle} />
              </div>
            </>
          )}

          {role === "JOB_POSTER" && (
            <div>
              <label style={labelStyle}>Company</label>
              <input value={company} onChange={(e) => setCompany(e.target.value)} style={inputStyle} />
            </div>
          )}
        </div>

        {error && (
          <div style={{ marginTop: 12, color: "rgba(254,202,202,0.95)", fontSize: 12, fontWeight: 900 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
          <button type="button" onClick={onClose} style={btnCancel}>
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            style={{ ...btnSave, opacity: saving ? 0.5 : 1 }}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
