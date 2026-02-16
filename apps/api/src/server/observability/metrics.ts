type Labels = Record<string, string | number | boolean | null | undefined>;

type CounterSnapshot = {
  name: string;
  labels: Record<string, string>;
  value: number;
};

const KEY = "__8FOLD_OBS_COUNTERS__";
function getStore(): Map<string, number> {
  const g = globalThis as any;
  if (!g[KEY]) g[KEY] = new Map<string, number>();
  return g[KEY] as Map<string, number>;
}

function stableLabels(labels?: Labels): Record<string, string> {
  const out: Record<string, string> = {};
  if (!labels) return out;
  const keys = Object.keys(labels).sort();
  for (const k of keys) {
    const v = (labels as any)[k];
    if (v === undefined) continue;
    out[k] = v === null ? "null" : String(v);
  }
  return out;
}

function keyOf(name: string, labels: Record<string, string>): string {
  const parts = Object.keys(labels)
    .sort()
    .map((k) => `${k}=${labels[k]}`);
  return parts.length ? `${name}|${parts.join(",")}` : name;
}

export function incCounter(name: string, labels?: Labels, by = 1) {
  const lab = stableLabels(labels);
  const key = keyOf(name, lab);
  const store = getStore();
  store.set(key, (store.get(key) ?? 0) + by);
}

export function snapshotCounters(): CounterSnapshot[] {
  const counters = getStore();
  const out: CounterSnapshot[] = [];
  for (const [k, v] of counters.entries()) {
    const [name, rest] = k.split("|");
    const labels: Record<string, string> = {};
    if (rest) {
      for (const pair of rest.split(",")) {
        const idx = pair.indexOf("=");
        if (idx === -1) continue;
        labels[pair.slice(0, idx)] = pair.slice(idx + 1);
      }
    }
    out.push({ name: name || k, labels, value: v });
  }
  out.sort((a, b) => (a.name === b.name ? JSON.stringify(a.labels).localeCompare(JSON.stringify(b.labels)) : a.name.localeCompare(b.name)));
  return out;
}

