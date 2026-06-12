import { beforeEach, describe, expect, it } from "vitest"
import { BADGE_CLASS, OVERLAY_CLASS, ensureStyles } from "../../src/content/styles"

describe("ensureStyles", () => {
  beforeEach(() => {
    document.head.innerHTML = ""
  })

  it("injects the style element with badge and overlay rules", () => {
    ensureStyles()

    const style = document.getElementById("gsplus-hatebu-style")
    expect(style).not.toBeNull()
    expect(style?.textContent).toContain(`.${BADGE_CLASS}`)
    expect(style?.textContent).toContain(`.${OVERLAY_CLASS}`)
  })

  it("is idempotent", () => {
    ensureStyles()
    ensureStyles()

    expect(document.querySelectorAll("#gsplus-hatebu-style")).toHaveLength(1)
  })
})
