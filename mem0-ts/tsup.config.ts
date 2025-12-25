import { defineConfig } from "tsup";

const external = [
  "openai",
  "@anthropic-ai/sdk",
  "groq-sdk",
  "uuid",
  "pg",
  "zod",
  "sqlite3",
  "@qdrant/js-client-rest",
  "redis",
  "@langchain/core",
  "@langchain/community",
];

export default defineConfig([
  {
    entry: ["src/client/index.ts"],
    format: ["cjs", "esm"],
    dts: true,
    sourcemap: true,
    external,
  },
  {
    entry: ["src/oss/src/index.ts"],
    outDir: "dist/oss",
    format: ["cjs", "esm"],
    dts: true,
    sourcemap: true,
    external,
  },
  {
    entry: ["src/community/src/index.ts"],
    outDir: "dist/community",
    format: ["cjs", "esm"],
    dts: true,
    sourcemap: true,
    external,
  },
  {
    entry: ["src/community/src/integrations/langchain/index.ts"],
    outDir: "dist/community/integrations/langchain",
    format: ["cjs", "esm"],
    dts: true,
    sourcemap: true,
    external,
  },
]);
