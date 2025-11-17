import { describe, expect, it } from "vitest"
import { extractExternalUrlFromHref, normalizeUrl } from "../../src/shared/url"

describe("normalizeUrl", () => {
  it("strips hash fragments and enforces protocol", () => {
    expect(normalizeUrl("https://example.com/path#section")).toBe("https://example.com/path")
    expect(normalizeUrl("mailto:test@example.com")).toBeNull()
  })
})

describe("extractExternalUrlFromHref", () => {
  it("returns direct https links", () => {
    expect(extractExternalUrlFromHref("https://example.com/foo")).toBe("https://example.com/foo")
  })

  it("unwraps Google redirect links", () => {
    const target = encodeURIComponent("https://example.org/article")
    const href = `https://www.google.com/url?q=${target}&sa=U`
    expect(extractExternalUrlFromHref(href)).toBe("https://example.org/article")
  })

  it("ignores Google internal links", () => {
    expect(extractExternalUrlFromHref("https://www.google.com/search?q=test")).toBeNull()
  })
})
