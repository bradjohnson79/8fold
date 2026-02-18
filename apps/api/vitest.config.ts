import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: [
      // Mirror `apps/api/tsconfig.json` paths for Vitest/Vite.
      { find: /^@\/server\/(.*)$/, replacement: path.resolve(__dirname, "src/server/$1") },
      { find: /^@\/src\/(.*)$/, replacement: path.resolve(__dirname, "src/$1") },
      { find: /^@\/db\/(.*)$/, replacement: path.resolve(__dirname, "db/$1") },
      { find: /^@\/(.*)$/, replacement: path.resolve(__dirname, "$1") },
    ],
  },
  test: {
    environment: "node",
    globals: true
  }
});

