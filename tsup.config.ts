import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    background: "src/background/index.ts",
    content: "src/content/index.ts"
  },
  format: ["esm"],
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  minify: false,
  target: "chrome110",
  outDir: "dist",
  skipNodeModulesBundle: true,
  dts: false
});
