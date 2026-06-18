import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { normalizeVersion, validateReleaseVersion } from "./validate-release-version.mjs"

describe("normalizeVersion", () => {
  it("accepts plain semantic versions", () => {
    assert.equal(normalizeVersion("0.1.0"), "0.1.0")
  })

  it("accepts v-prefixed semantic versions", () => {
    assert.equal(normalizeVersion("v0.1.0"), "0.1.0")
  })

  it("rejects non-semantic versions", () => {
    assert.throws(() => normalizeVersion("0.1"), /Version must be semantic version/)
  })
})

describe("validateReleaseVersion", () => {
  it("accepts aligned release versions", () => {
    assert.equal(
      validateReleaseVersion({
        tag: "v0.1.0",
        packageVersion: "0.1.0",
        manifestVersion: "0.1.0",
        lockVersion: "0.1.0"
      }),
      "0.1.0"
    )
  })

  it("rejects package, manifest, or lock mismatches", () => {
    assert.throws(
      () =>
        validateReleaseVersion({
          tag: "v0.2.0",
          packageVersion: "0.2.0",
          manifestVersion: "0.1.0",
          lockVersion: "0.2.0"
        }),
      /public\/manifest\.json has 0\.1\.0/
    )
  })
})
