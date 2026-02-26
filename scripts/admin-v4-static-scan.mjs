#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const FILE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

function listFiles(baseDir) {
  const out = [];
  function walk(dir) {
    let entries = [];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const full = path.join(dir, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        walk(full);
        continue;
      }
      if (!st.isFile()) continue;
      if (FILE_EXT.has(path.extname(name))) out.push(full);
    }
  }
  walk(baseDir);
  return out;
}

function scanFile(file, checks, problems) {
  const src = readFileSync(file, "utf8");
  const lines = src.split(/\r?\n/);
  lines.forEach((line, idx) => {
    checks.forEach((check) => {
      if (check.test(line)) {
        problems.push({
          file,
          line: idx + 1,
          message: check.message,
          snippet: line.trim().slice(0, 240),
        });
      }
    });
  });
}

const problems = [];

const adminSrcFiles = listFiles("apps/admin/src");
adminSrcFiles.forEach((file) => {
  scanFile(
    file,
    [
      {
        test: (line) => line.includes("/api/admin/") && !line.includes("/api/admin/v4/"),
        message: "Non-v4 admin endpoint usage is forbidden in apps/admin/src",
      },
      {
        test: (line) => line.includes("/api/app/"),
        message: "Legacy /api/app/* usage is forbidden in apps/admin/src",
      },
      {
        test: (line) => /\[object Object\]/.test(line),
        message: "Literal [object Object] rendering artifact found",
      },
    ],
    problems,
  );
});

const adminPages = listFiles("apps/admin/src/app/(admin)");
const placeholderPatterns = [
  /coming soon/i,
  /not implemented/i,
  /placeholder page/i,
  /placeholder content/i,
  /todo:?\s*placeholder/i,
  /tbd/i,
];
adminPages.forEach((file) => {
  scanFile(
    file,
    placeholderPatterns.map((re) => ({
      test: (line) => re.test(line),
      message: `Placeholder copy is forbidden in Admin V4 pages (${re})`,
    })),
    problems,
  );
});

const apiV4RouteFiles = listFiles("apps/api/app/api/admin/v4");
apiV4RouteFiles.forEach((file) => {
  scanFile(
    file,
    [
      {
        test: (line) => /from\s+["']@\/src\/lib\/auth\/adminSession["']/.test(line),
        message: "Legacy adminSession import is forbidden in /api/admin/v4/*",
      },
      {
        test: (line) => /from\s+["']@\/src\/lib\/auth\/requireAdmin["']/.test(line),
        message: "Legacy requireAdmin import is forbidden in /api/admin/v4/*",
      },
      {
        test: (line) => /from\s+["']@clerk\/nextjs["']/.test(line),
        message: "Clerk imports are forbidden in /api/admin/v4/*",
      },
      {
        test: (line) => /from\s+["']@\/src\/auth\/requireAdmin["']/.test(line),
        message: "Non-v4 admin guard import is forbidden in /api/admin/v4/*",
      },
    ],
    problems,
  );
});

if (problems.length > 0) {
  console.error(`[admin-v4 static scan] failed with ${problems.length} violation(s):`);
  for (const p of problems) {
    const rel = path.relative(ROOT, p.file);
    console.error(`- ${rel}:${p.line} ${p.message}`);
    if (p.snippet) console.error(`  ${p.snippet}`);
  }
  process.exit(1);
}

console.log("[admin-v4 static scan] ok: no violations");
