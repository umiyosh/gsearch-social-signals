import { defineConfig } from "tsup"

export default defineConfig({
  entry: {
    background: "src/background/index.ts",
    content: "src/content/index.ts",
    options: "src/options/index.ts"
  },
  format: ["esm"],
  sourcemap: false,
  clean: true,
  splitting: false,
  treeshake: true,
  define: {
    GSPLUS_DIAGNOSTICS: JSON.stringify(process.env.GSPLUS_DIAGNOSTICS === "1"),
    GSPLUS_COMMIT_SHA: JSON.stringify(process.env.GSPLUS_COMMIT_SHA ?? "unknown")
  },
  minify: false,
  target: "chrome110",
  outDir: process.env.GSPLUS_OUT_DIR ?? "dist",
  skipNodeModulesBundle: true,
  dts: false
})
