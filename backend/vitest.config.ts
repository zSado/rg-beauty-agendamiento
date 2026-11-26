import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    fileParallelism: false, // todas las pruebas comparten la misma base de datos
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
