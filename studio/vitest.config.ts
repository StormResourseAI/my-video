import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": here("."),
      // Mirror next.config.ts: ../src imports must resolve remotion packages
      // to the single studio copy, never the root node_modules copy.
      remotion: here("node_modules/remotion"),
      "@remotion/media": here("node_modules/@remotion/media"),
      // The real package throws outside a React Server context.
      "server-only": here("tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./vitest.setup.ts",
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
