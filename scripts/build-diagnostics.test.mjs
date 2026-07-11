import assert from "node:assert/strict"
import test from "node:test"

import { createDiagnosticsManifest } from "./build-diagnostics.mjs"

test("createDiagnosticsManifest identifies the artifact without changing its version", () => {
  const manifest = createDiagnosticsManifest(
    {
      manifest_version: 3,
      name: "__MSG_appName__",
      version: "0.1.3",
      permissions: []
    },
    "abc1234"
  )

  assert.deepEqual(manifest, {
    manifest_version: 3,
    name: "GSearch With Social Signals Diagnostics",
    version: "0.1.3",
    version_name: "0.1.3 diagnostics abc1234",
    permissions: []
  })
})
