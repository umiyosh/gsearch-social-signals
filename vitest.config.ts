import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    // scripts/*.test.mjs は node:test ランナー用 (npm run quality:test)。vitest の対象外。
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      include: ["src/**/*.ts"],
      // background/index.ts と content/index.ts は chrome.* ランタイム結線と DOM 描画の
      // entrypoint 層。ロジックは shared/ と searchResults.ts に寄せ、そこを per-file で gate する。
      exclude: ["src/background/index.ts", "src/content/index.ts"],
      thresholds: {
        perFile: true,
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 70
      }
    }
  }
})
