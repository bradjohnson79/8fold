"use client";

import Link from "next/link";
import { LogoutButton } from "./LogoutButton";

const navStyle = {
  padding: "1rem 2rem",
  borderBottom: "1px solid #334155",
  display: "flex",
  gap: "1.5rem",
  alignItems: "center",
  flexWrap: "wrap" as const,
};

const linkStyle = { color: "#94a3b8" };
const linkHover = "&:hover { color: #f8fafc }";

const dropdownStyle = {
  position: "relative" as const,
  display: "inline-block",
};

const dropdownContentStyle = {
  position: "absolute" as const,
  top: "100%",
  left: 0,
  minWidth: 180,
  padding: "0.5rem 0",
  background: "#1e293b",
  borderRadius: 8,
  boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
  zIndex: 100,
};

const dropdownItemStyle = {
  display: "block",
  padding: "0.5rem 1rem",
  color: "#94a3b8",
  textDecoration: "none",
};

export function NavBar() {
  return (
    <nav style={navStyle}>
      <Link href="/dashboard" style={{ fontWeight: 600, color: "#f8fafc" }}>
        8Fold LGS
      </Link>
      <Link href="/dashboard" style={linkStyle}>
        Dashboard
      </Link>

      <div style={dropdownStyle} className="nav-dropdown">
        <button
          type="button"
          style={{
            background: "none",
            border: "none",
            color: "#94a3b8",
            cursor: "pointer",
            padding: 0,
            fontSize: "inherit",
          }}
          className="nav-dropdown-trigger"
        >
          Leads ▾
        </button>
        <div style={dropdownContentStyle} className="nav-dropdown-content">
          <Link href="/leads" style={dropdownItemStyle}>
            Contractor Leads
          </Link>
          <Link href="/leads/import" style={dropdownItemStyle}>
            Import Contractor Websites
          </Link>
          <Link href="/leads/finder" style={dropdownItemStyle}>
            Lead Finder
          </Link>
          <Link href="/discovery" style={dropdownItemStyle}>
            Discovery
          </Link>
        </div>
      </div>

      <div style={dropdownStyle} className="nav-dropdown">
        <button
          type="button"
          style={{
            background: "none",
            border: "none",
            color: "#94a3b8",
            cursor: "pointer",
            padding: 0,
            fontSize: "inherit",
          }}
          className="nav-dropdown-trigger"
        >
          Outreach ▾
        </button>
        <div style={dropdownContentStyle} className="nav-dropdown-content">
          <Link href="/messages" style={dropdownItemStyle}>
            Messages
          </Link>
          <Link href="/outreach/queue" style={dropdownItemStyle}>
            Email Queue
          </Link>
          <Link href="/outreach" style={dropdownItemStyle}>
            Campaigns
          </Link>
          <Link href="/outreach/warmup" style={dropdownItemStyle}>
            Warmup
          </Link>
        </div>
      </div>

      <div style={dropdownStyle} className="nav-dropdown">
        <button
          type="button"
          style={{
            background: "none",
            border: "none",
            color: "#94a3b8",
            cursor: "pointer",
            padding: 0,
            fontSize: "inherit",
          }}
          className="nav-dropdown-trigger"
        >
          Analytics ▾
        </button>
        <div style={dropdownContentStyle} className="nav-dropdown-content">
          <Link href="/reports/pipeline" style={dropdownItemStyle}>
            Pipeline
          </Link>
          <Link href="/channels" style={dropdownItemStyle}>
            Acquisition Channels
          </Link>
          <Link href="/regions" style={dropdownItemStyle}>
            Regions
          </Link>
          <Link href="/reports/investor" style={dropdownItemStyle}>
            Investor Snapshot
          </Link>
        </div>
      </div>

      <div style={dropdownStyle} className="nav-dropdown">
        <button
          type="button"
          style={{
            background: "none",
            border: "none",
            color: "#94a3b8",
            cursor: "pointer",
            padding: 0,
            fontSize: "inherit",
          }}
          className="nav-dropdown-trigger"
        >
          System ▾
        </button>
        <div style={dropdownContentStyle} className="nav-dropdown-content">
          <Link href="/settings/senders" style={dropdownItemStyle}>
            Senders
          </Link>
          <Link href="/verification" style={dropdownItemStyle}>
            Verification
          </Link>
          <Link href="/settings" style={dropdownItemStyle}>
            Settings
          </Link>
          <Link href="/workers" style={dropdownItemStyle}>
            System Monitor
          </Link>
          <Link href="/system/data-cleanup" style={dropdownItemStyle}>
            Data Cleanup
          </Link>
        </div>
      </div>

      <div style={{ marginLeft: "auto" }}>
        <LogoutButton />
      </div>
    </nav>
  );
}
