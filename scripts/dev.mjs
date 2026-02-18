import { spawn, execFileSync } from "node:child_process";

function isWindows() {
  return process.platform === "win32";
}

function killPorts(ports) {
  // Keep this dependency-free. On macOS/Linux, `lsof` is the most reliable.
  if (isWindows()) return;

  for (const port of ports) {
    try {
      const out = execFileSync("lsof", ["-ti", `tcp:${port}`], { encoding: "utf8" }).trim();
      if (!out) continue;
      const pids = out
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const pid of pids) {
        try {
          process.kill(Number(pid), "SIGTERM");
        } catch {
          // Ignore races (process already gone).
        }
      }
    } catch {
      // lsof not available or nothing listening; ignore.
    }
  }
}

const portsToFree = [3002, 3003, 3004, 3006];
killPorts(portsToFree);

const children = [];
const procs = [
  { name: "web", cmd: "pnpm", args: ["dev:web"] },
  { name: "admin", cmd: "pnpm", args: ["dev:admin"] },
  { name: "api", cmd: "pnpm", args: ["dev:api"] },
  { name: "dise", cmd: "pnpm", args: ["dev:dise"] },
];

function shutdown(code = 0) {
  for (const c of children) {
    try {
      c.kill("SIGTERM");
    } catch {
      // ignore
    }
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

for (const p of procs) {
  const child = spawn(p.cmd, p.args, {
    stdio: "inherit",
    shell: true,
    env: process.env,
  });
  children.push(child);

  child.on("exit", (code, signal) => {
    // If one exits (especially due to EADDRINUSE), stop the whole stack so
    // we don't end up with a half-running dev environment.
    if (signal) shutdown(1);
    if (typeof code === "number" && code !== 0) shutdown(code);
  });
}

