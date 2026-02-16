import path from "path";
import dotenv from "dotenv";

let loaded = false;

/**
 * Next.js loads env files relative to the app directory (apps/api).
 * In this monorepo, some secrets live in the repo-root `.env`.
 *
 * Load repo-root env files once (non-overriding) so API runtime can see them.
 */
export function loadRootEnvOnce() {
  if (loaded) return;
  loaded = true;

  const rootEnv = path.resolve(process.cwd(), "../../.env");
  const rootEnvLocal = path.resolve(process.cwd(), "../../.env.local");

  dotenv.config({ path: rootEnv, override: false });
  dotenv.config({ path: rootEnvLocal, override: false });

  // Startup assertion (requested): prove model config is visible in API runtime.
  // eslint-disable-next-line no-console
  console.log("[env] AI MODEL:", process.env.OPENAI_MODEL ?? "(unset)");
}

