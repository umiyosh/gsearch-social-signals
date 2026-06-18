import assert from "node:assert/strict"
import test from "node:test"
import { validateArchiveEntries, validateDistFiles } from "./package-store.mjs"

test("validateArchiveEntries accepts a minimal Chrome extension package", () => {
  assert.doesNotThrow(() =>
    validateArchiveEntries([
      "manifest.json",
      "background.js",
      "content.js",
      "icons/icon16.png",
      "icons/icon128.png"
    ])
  )
})

test("validateArchiveEntries requires manifest.json at the zip root", () => {
  assert.throws(
    () => validateArchiveEntries(["dist/manifest.json", "background.js"]),
    /manifest\.json at the zip root/
  )
})

test("validateArchiveEntries rejects source maps and repository files", () => {
  assert.throws(
    () =>
      validateArchiveEntries([
        "manifest.json",
        "content.js.map",
        "src/content/index.ts",
        ".env.local"
      ]),
    /forbidden entries/
  )
})

test("validateDistFiles rejects files that must not be packaged", () => {
  assert.throws(
    () => validateDistFiles(["manifest.json", "background.js", "__MACOSX/._manifest.json"]),
    /must not be packaged/
  )
})
