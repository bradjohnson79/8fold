type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

function isPlainObject(x: unknown): x is Record<string, unknown> {
  if (!x || typeof x !== "object") return false;
  const proto = Object.getPrototypeOf(x);
  return proto === Object.prototype || proto === null;
}

function toJsonSafe(value: unknown): JsonValue {
  // Only compare JSON-safe values. This also:
  // - drops `undefined`
  // - converts Dates -> ISO strings
  // - removes functions/symbols
  // Never throw.
  try {
    return JSON.parse(
      JSON.stringify(value, (_k, v) => {
        if (v instanceof Date) return v.toISOString();
        if (typeof v === "bigint") return v.toString();
        if (typeof v === "function") return undefined;
        if (typeof v === "symbol") return undefined;
        return v;
      }),
    ) as JsonValue;
  } catch {
    // Fallback: best-effort string
    return String(value) as unknown as JsonValue;
  }
}

function stableStringify(value: JsonValue): string {
  const seen = new WeakSet<object>();

  function inner(v: JsonValue): string {
    if (v === null) return "null";
    const t = typeof v;
    if (t === "string") return JSON.stringify(v);
    if (t === "number" || t === "boolean") return String(v);
    if (Array.isArray(v)) return `[${v.map(inner).join(",")}]`;
    if (typeof v === "object") {
      const obj = v as Record<string, JsonValue>;
      if (seen.has(obj as any)) return JSON.stringify("[Circular]");
      seen.add(obj as any);
      const keys = Object.keys(obj).sort();
      return `{${keys.map((k) => `${JSON.stringify(k)}:${inner(obj[k]!)}`).join(",")}}`;
    }
    return JSON.stringify(String(v));
  }

  return inner(value);
}

function diffPaths(a: JsonValue, b: JsonValue, path: string, out: string[], limit: number) {
  if (out.length >= limit) return;
  if (a === b) return;

  const aIsArr = Array.isArray(a);
  const bIsArr = Array.isArray(b);
  if (aIsArr || bIsArr) {
    if (!aIsArr || !bIsArr) {
      out.push(path || "(root)");
      return;
    }
    const max = Math.max(a.length, b.length);
    for (let i = 0; i < max; i++) {
      diffPaths(a[i] as any, b[i] as any, `${path}[${i}]`, out, limit);
      if (out.length >= limit) return;
    }
    return;
  }

  const aObj = isPlainObject(a) ? (a as Record<string, JsonValue>) : null;
  const bObj = isPlainObject(b) ? (b as Record<string, JsonValue>) : null;
  if (aObj || bObj) {
    if (!aObj || !bObj) {
      out.push(path || "(root)");
      return;
    }
    const keys = new Set<string>([...Object.keys(aObj), ...Object.keys(bObj)]);
    for (const k of Array.from(keys).sort()) {
      diffPaths(aObj[k] as any, bObj[k] as any, path ? `${path}.${k}` : k, out, limit);
      if (out.length >= limit) return;
    }
    return;
  }

  out.push(path || "(root)");
}

export function comparePrismaVsDrizzle<TPrisma, TDrizzle, TNorm extends JsonValue>(opts: {
  label: string;
  prismaResult: TPrisma;
  drizzleResult: TDrizzle;
  normalize: (x: TPrisma | TDrizzle) => unknown;
}): void {
  try {
    if (process.env.NODE_ENV !== "development") return;

    const prismaNorm = toJsonSafe(opts.normalize(opts.prismaResult));
    const drizzleNorm = toJsonSafe(opts.normalize(opts.drizzleResult));

    const a = stableStringify(prismaNorm);
    const b = stableStringify(drizzleNorm);
    if (a === b) return;

    const paths: string[] = [];
    diffPaths(prismaNorm, drizzleNorm, "", paths, 25);

    const diffSummary = {
      differingPaths: paths,
      truncated: paths.length >= 25,
    };

    // Never throw; never affect response.
    console.warn("[DUAL-READ DIFF]", opts.label, diffSummary);
  } catch {
    // ignore
  }
}

