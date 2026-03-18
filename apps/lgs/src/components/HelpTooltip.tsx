"use client";

export function HelpTooltip({ text }: { text: string }) {
  return (
    <span
      title={text}
      role="img"
      aria-label={text}
      style={{ cursor: "help", opacity: 0.8, display: "inline-flex", verticalAlign: "middle", marginLeft: 4 }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    </span>
  );
}
