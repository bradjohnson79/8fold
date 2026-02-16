import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Deterministic Mobile Interaction Audit
 * - Detects common "dead tap target" causes (Link asChild wrapping non-pressable elements).
 * - Detects auth UI drift (local Colors objects reintroduced in auth screens).
 *
 * This is intentionally conservative: it will fail loudly if it finds risky patterns.
 */

const ROOT = process.cwd();
const MOBILE_DIR = join(ROOT, "apps", "mobile");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      // Skip heavy caches
      if (name === "node_modules" || name === ".expo" || name === ".turbo") continue;
      out.push(...walk(p));
      continue;
    }
    if (p.endsWith(".tsx") || p.endsWith(".ts")) out.push(p);
  }
  return out;
}

function fail(msg: string) {
  // eslint-disable-next-line no-console
  console.error(msg);
  process.exitCode = 1;
}

function auditLinkAsChild(content: string, file: string) {
  // Flag: <Link ... asChild> <View> ... </View>
  // This often breaks because View doesn't accept onPress.
  const re = /<Link\b[^>]*\basChild\b[^>]*>\s*<View\b/gs;
  if (re.test(content)) {
    fail(`[mobile-interactive-audit] Link asChild wraps <View> in ${file}`);
  }
}

function auditAuthLocalColors(content: string, file: string) {
  // Flag local `const Colors = { ... }` inside auth screens (design drift).
  if (!file.includes(`${join("app", "(auth)")}`)) return;
  const re = /\bconst\s+Colors\s*=\s*\{/;
  if (re.test(content)) {
    fail(`[mobile-interactive-audit] Local Colors object found in auth screen ${file}`);
  }
}

function main() {
  const files = walk(MOBILE_DIR);
  for (const f of files) {
    const content = readFileSync(f, "utf8");
    auditLinkAsChild(content, f);
    auditAuthLocalColors(content, f);
  }

  if (process.exitCode) return;
  // eslint-disable-next-line no-console
  console.log("[mobile-interactive-audit] OK");
}

main();

