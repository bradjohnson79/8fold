"use client";

import React from "react";
import { AdminColors, AdminRadii, AdminShadow } from "./theme";

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  right
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
        marginBottom: 14
      }}
    >
      <div style={{ minWidth: 0 }}>
        {eyebrow ? (
          <div style={{ fontSize: 13, color: AdminColors.muted, marginBottom: 6 }}>{eyebrow}</div>
        ) : null}
        <h1 style={{ margin: 0, fontSize: 28, color: AdminColors.text, letterSpacing: "-0.01em" }}>
          {title}
        </h1>
        {subtitle ? (
          <p style={{ marginTop: 8, marginBottom: 0, color: AdminColors.muted, lineHeight: "22px" }}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {right ? <div style={{ display: "flex", gap: 10, alignItems: "center" }}>{right}</div> : null}
    </header>
  );
}

export function Card({
  children,
  style
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <section
      style={{
        background: AdminColors.card,
        border: `1px solid ${AdminColors.border}`,
        borderRadius: AdminRadii.card,
        boxShadow: AdminShadow.card,
        padding: 16,
        ...style
      }}
    >
      {children}
    </section>
  );
}

export function RowCard({
  children,
  style,
  onClick,
  href
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  onClick?: () => void;
  href?: string;
}) {
  const inner = (
    <div
      style={{
        background: AdminColors.card,
        border: `1px solid ${AdminColors.border}`,
        borderRadius: 14,
        padding: 14,
        boxShadow: "0 1px 2px rgba(16,24,40,0.04)",
        cursor: onClick || href ? "pointer" : "default",
        ...style
      }}
      onClick={onClick}
    >
      {children}
    </div>
  );

  if (href) {
    return (
      <a href={href} style={{ textDecoration: "none", color: "inherit" }}>
        {inner}
      </a>
    );
  }
  return inner;
}

export function PrimaryButton({
  children,
  disabled,
  onClick,
  title,
  type
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
  type?: "button" | "submit" | "reset";
}) {
  return (
    <button
      title={title}
      type={type}
      disabled={disabled}
      onClick={onClick}
      style={{
        padding: "10px 14px",
        borderRadius: 12,
        border: `1px solid ${AdminColors.greenBorder}`,
        background: AdminColors.green,
        color: "white",
        fontWeight: 900,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1
      }}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  disabled,
  onClick,
  title,
  type
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
  type?: "button" | "submit" | "reset";
}) {
  return (
    <button
      title={title}
      type={type}
      disabled={disabled}
      onClick={onClick}
      style={{
        padding: "10px 14px",
        borderRadius: 12,
        border: `1px solid ${AdminColors.border}`,
        background: AdminColors.card,
        color: AdminColors.text,
        fontWeight: 800,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1
      }}
    >
      {children}
    </button>
  );
}

export function DangerButton({
  children,
  disabled,
  onClick,
  title,
  type
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
  type?: "button" | "submit" | "reset";
}) {
  return (
    <button
      title={title}
      type={type}
      disabled={disabled}
      onClick={onClick}
      style={{
        padding: "10px 14px",
        borderRadius: 12,
        border: `1px solid rgba(220, 38, 38, 0.28)`,
        background: AdminColors.card,
        color: AdminColors.danger,
        fontWeight: 900,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1
      }}
    >
      {children}
    </button>
  );
}

export function Pill({ label, tone }: { label: string; tone: "neutral" | "ok" | "warn" | "info" }) {
  const style =
    tone === "ok"
      ? { background: AdminColors.greenSoft, border: AdminColors.greenBorder, color: AdminColors.green }
      : tone === "warn"
        ? { background: AdminColors.dangerSoft, border: "rgba(220, 38, 38, 0.22)", color: AdminColors.danger }
        : { background: AdminColors.grayPill, border: AdminColors.border, color: AdminColors.text };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 10px",
        borderRadius: AdminRadii.pill,
        border: `1px solid ${style.border}`,
        background: style.background,
        color: style.color,
        fontSize: 12,
        fontWeight: 900
      }}
    >
      {label}
    </span>
  );
}

