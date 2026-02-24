import { promises as fs } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

const TARGET_DIRS = [
  "apps/api/src/services/v4",
  "apps/api/src/validation/v4",
  "apps/api/app/api/web/v4",
  "apps/web/src/app/api/v4",
  "apps/web/src/app/post-job",
];

const BLOCKED_PATTERNS = [
  "JobDraft",
  "wizard",
  "autosave",
  "legacy",
  "oldProfile",
  "oldJob",
  "/v2/",
  "/v3/",
];

async function listFilesRecursively(dirPath) {
  const out = [];
  let entries = [];
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listFilesRecursively(fullPath)));
    } else if (entry.isFile()) {
      out.push(fullPath);
    }
  }
  return out;
}

function findMatches(content, relPath) {
  const lines = content.split(/\r?\n/);
  const matches = [];
  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx];
    for (const pattern of BLOCKED_PATTERNS) {
      if (line.includes(pattern)) {
        matches.push({
          file: relPath,
          line: idx + 1,
          pattern,
          text: line.trim(),
        });
      }
    }
  }
  return matches;
}

async function run() {
  const findings = [];
  for (const relativeDir of TARGET_DIRS) {
    const absoluteDir = path.join(repoRoot, relativeDir);
    const files = await listFilesRecursively(absoluteDir);
    for (const filePath of files) {
      let raw = "";
      try {
        raw = await fs.readFile(filePath, "utf8");
      } catch {
        continue;
      }
      findings.push(...findMatches(raw, path.relative(repoRoot, filePath)));
    }
  }

  if (findings.length > 0) {
    console.error("V4 guardrail violations detected:");
    for (const hit of findings) {
      console.error(`${hit.file}:${hit.line} [${hit.pattern}] ${hit.text}`);
    }
    process.exit(1);
  }

  console.log("V4 guardrail passed: no legacy references found in V4 namespaces.");
}

run().catch((err) => {
  console.error("V4 guardrail failed unexpectedly.");
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
