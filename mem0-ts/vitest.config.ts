import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 600_000, // 10 minutes for container tests
    hookTimeout: 600_000,
    include: ["tests/**/*.test.ts", "src/**/tests/*.test.ts"],
    globals: true,
    environment: "node",
    setupFiles: ["dotenv/config"],
    alias: {
      // Mock problematic Google SDK that has Node.js compatibility issues
      "@google/genai": new URL(
        "./tests/__mocks__/@google/genai.ts",
        import.meta.url,
      ).pathname,
    },
  },
});
