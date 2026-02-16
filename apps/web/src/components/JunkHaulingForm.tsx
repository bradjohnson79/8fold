"use client";

import React from "react";

export type JunkItem = {
  category:
    | "Furniture"
    | "Appliances"
    | "Cardboard"
    | "Garbage"
    | "Yard Waste"
    | "Construction Debris"
    | "Other";
  item: string;
  quantity: number;
  notes?: string;
};

export function JunkHaulingForm({
  items,
  onChange,
  showValidation,
  forceShowAll,
  rowErrors,
  title,
  helper,
  defaultCategory,
  itemPlaceholder,
}: {
  items: JunkItem[];
  onChange: (items: JunkItem[]) => void;
  showValidation?: boolean;
  forceShowAll?: boolean;
  rowErrors?: Array<{ category?: string; item?: string; quantity?: string }>;
  title?: string;
  helper?: string;
  defaultCategory?: JunkItem["category"];
  itemPlaceholder?: string;
}) {
  const [touched, setTouched] = React.useState<Record<string, boolean>>({});

  function mark(idx: number, key: "category" | "item" | "quantity") {
    setTouched((t) => ({ ...t, [`${idx}:${key}`]: true }));
  }

  function shouldShow(idx: number, key: "category" | "item" | "quantity") {
    if (!showValidation) return false;
    if (forceShowAll) return true;
    return Boolean(touched[`${idx}:${key}`]);
  }

  function update(idx: number, patch: Partial<JunkItem>) {
    onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function add() {
    onChange([
      ...items,
      { category: defaultCategory ?? "Furniture", item: "", quantity: 1 }
    ]);
  }

  function remove(idx: number) {
    onChange(items.filter((_, i) => i !== idx));
  }

  function showIcon(v: "neutral" | "valid" | "invalid") {
    if (v === "valid") return <span className="text-green-600 font-bold">✓</span>;
    if (v === "invalid") return <span className="text-red-600 font-bold">✕</span>;
    return null;
  }

  return (
    <div className="border border-gray-200 rounded-xl p-4">
      <div className="text-sm font-semibold text-gray-900">{title ?? "Items"}</div>
      <div className="text-sm text-gray-600 mt-1">
        {helper ?? "Add items and quantities. This helps the AI generate an accurate price."}
      </div>

      <div className="mt-4 space-y-3">
        {items.map((it, idx) => (
          <div key={idx} className="border border-gray-200 rounded-xl p-3">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <label className="block md:col-span-3">
                <div className="text-xs font-medium text-gray-700 flex items-center justify-between">
                  <span>Category</span>
                  {shouldShow(idx, "category")
                    ? showIcon(rowErrors?.[idx]?.category ? "invalid" : it.category ? "valid" : "neutral")
                    : null}
                </div>
                <select
                  className={[
                    "mt-1 w-full border rounded-lg px-3 py-2",
                    shouldShow(idx, "category") && rowErrors?.[idx]?.category ? "border-red-400" : "border-gray-300",
                  ].join(" ")}
                  value={it.category}
                  onChange={(e) => update(idx, { category: e.target.value as JunkItem["category"] })}
                  onBlur={() => mark(idx, "category")}
                >
                  <option value="Furniture">Furniture</option>
                  <option value="Appliances">Appliances</option>
                  <option value="Cardboard">Cardboard</option>
                  <option value="Garbage">Garbage</option>
                  <option value="Yard Waste">Yard Waste</option>
                  <option value="Construction Debris">Construction Debris</option>
                  <option value="Other">Other</option>
                </select>
                {shouldShow(idx, "category") && rowErrors?.[idx]?.category ? (
                  <div className="mt-1 text-xs text-red-600">{rowErrors[idx]!.category}</div>
                ) : null}
              </label>

              <label className="block md:col-span-5">
                <div className="text-xs font-medium text-gray-700 flex items-center justify-between">
                  <span>Item description</span>
                  {shouldShow(idx, "item")
                    ? showIcon(rowErrors?.[idx]?.item ? "invalid" : it.item.trim() ? "valid" : "neutral")
                    : null}
                </div>
                <input
                  className={[
                    "mt-1 w-full border rounded-lg px-3 py-2",
                    shouldShow(idx, "item") && rowErrors?.[idx]?.item ? "border-red-400" : "border-gray-300",
                  ].join(" ")}
                  placeholder={itemPlaceholder ?? 'e.g., "coffee table", "lawnmower", "flattened boxes"'}
                  value={it.item}
                  onChange={(e) => update(idx, { item: e.target.value })}
                  onBlur={() => mark(idx, "item")}
                />
                {shouldShow(idx, "item") && rowErrors?.[idx]?.item ? (
                  <div className="mt-1 text-xs text-red-600">{rowErrors[idx]!.item}</div>
                ) : null}
              </label>

              <label className="block md:col-span-2">
                <div className="text-xs font-medium text-gray-700 flex items-center justify-between">
                  <span>Quantity</span>
                  {shouldShow(idx, "quantity")
                    ? showIcon(rowErrors?.[idx]?.quantity ? "invalid" : it.quantity >= 1 ? "valid" : "neutral")
                    : null}
                </div>
                <input
                  type="number"
                  min={1}
                  step={1}
                  className={[
                    "mt-1 w-full border rounded-lg px-3 py-2",
                    shouldShow(idx, "quantity") && rowErrors?.[idx]?.quantity ? "border-red-400" : "border-gray-300",
                  ].join(" ")}
                  value={String(it.quantity ?? "")}
                  onChange={(e) => update(idx, { quantity: Number(e.target.value) })}
                  onBlur={() => {
                    mark(idx, "quantity");
                    const n = Number.isFinite(it.quantity) ? Math.floor(it.quantity) : 1;
                    update(idx, { quantity: Math.max(1, n) });
                  }}
                />
                {shouldShow(idx, "quantity") && rowErrors?.[idx]?.quantity ? (
                  <div className="mt-1 text-xs text-red-600">{rowErrors[idx]!.quantity}</div>
                ) : null}
              </label>

              <div className="md:col-span-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => remove(idx)}
                  className="w-full border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold px-3 py-2 rounded-lg"
                >
                  Remove
                </button>
              </div>
            </div>

            <label className="block mt-3">
              <div className="text-xs font-medium text-gray-700">Optional notes</div>
              <input
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                placeholder="e.g., square wooden table, king mattress, boxes are already flattened"
                value={it.notes ?? ""}
                onChange={(e) => update(idx, { notes: e.target.value })}
              />
            </label>
          </div>
        ))}

        {!items.length ? (
          <div className="text-sm text-gray-600">No items added yet.</div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={add}
        className="mt-4 bg-gray-900 text-white hover:bg-black font-semibold px-4 py-2 rounded-lg"
      >
        Add item
      </button>
    </div>
  );
}

