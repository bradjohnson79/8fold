"use client";

import React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Card, SecondaryButton } from "./primitives";
import { AdminColors, AdminRadii } from "./theme";

export type Column<Row> = {
  key: string;
  header: string;
  width?: number | string;
  align?: "left" | "right";
  render: (row: Row) => React.ReactNode;
};

function parseStack(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function formatStack(stack: string[]): string {
  return stack.join(",");
}

export function CursorPager(props: { nextCursor: string | null; loading?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const cursor = params.get("cursor");
  const stack = parseStack(params.get("stack"));

  const canPrev = stack.length > 0;
  const canNext = Boolean(props.nextCursor);

  const go = (next: { cursor: string | null; stack: string[] }) => {
    const nextParams = new URLSearchParams(params.toString());
    if (next.cursor) nextParams.set("cursor", next.cursor);
    else nextParams.delete("cursor");
    if (next.stack.length) nextParams.set("stack", formatStack(next.stack));
    else nextParams.delete("stack");
    router.push(`${pathname}?${nextParams.toString()}`);
  };

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "flex-end" }}>
      <SecondaryButton
        disabled={props.loading || !canPrev}
        onClick={() => {
          const nextStack = [...stack];
          const prevCursor = nextStack.pop() ?? null;
          go({ cursor: prevCursor, stack: nextStack });
        }}
      >
        Prev
      </SecondaryButton>
      <SecondaryButton
        disabled={props.loading || !canNext}
        onClick={() => {
          const nextStack = [...stack, ...(cursor ? [cursor] : [])];
          go({ cursor: props.nextCursor, stack: nextStack });
        }}
      >
        Next
      </SecondaryButton>
    </div>
  );
}

export function DataTable<Row>(props: {
  columns: Array<Column<Row>>;
  rows: Row[];
  keyForRow: (row: Row) => string;
  emptyText: string;
}) {
  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr>
              {props.columns.map((c) => (
                <th
                  key={c.key}
                  style={{
                    textAlign: c.align ?? "left",
                    fontSize: 12,
                    fontWeight: 900,
                    color: AdminColors.muted,
                    padding: "12px 14px",
                    borderBottom: `1px solid ${AdminColors.divider}`,
                    background: AdminColors.card,
                    whiteSpace: "nowrap",
                    width: c.width,
                  }}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {props.rows.length === 0 ? (
              <tr>
                <td colSpan={props.columns.length} style={{ padding: 16, color: AdminColors.muted }}>
                  {props.emptyText}
                </td>
              </tr>
            ) : (
              props.rows.map((r) => (
                <tr key={props.keyForRow(r)}>
                  {props.columns.map((c) => (
                    <td
                      key={`${props.keyForRow(r)}:${c.key}`}
                      style={{
                        padding: "12px 14px",
                        borderBottom: `1px solid ${AdminColors.divider}`,
                        color: AdminColors.text,
                        fontSize: 13,
                        verticalAlign: "top",
                        whiteSpace: "nowrap",
                        textAlign: c.align ?? "left",
                      }}
                    >
                      {c.render(r)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div
        style={{
          padding: 12,
          borderTop: `1px solid ${AdminColors.divider}`,
          background: AdminColors.card,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ color: AdminColors.muted, fontSize: 12 }}>{props.rows.length} shown</div>
        <div style={{ borderRadius: AdminRadii.pill }} />
      </div>
    </Card>
  );
}

