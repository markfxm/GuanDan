/// <reference types="vitest" />

import react from "@vitejs/plugin-react";
import { defineConfig, type UserConfig } from "vite";
import type { InlineConfig } from "vitest";

const config = {
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:5174",
      "/ws": {
        target: "http://127.0.0.1:5174",
        ws: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    passWithNoTests: true,
    setupFiles: ["tests/setup.ts"],
  },
} satisfies UserConfig & { test: InlineConfig };

export default defineConfig(config);
