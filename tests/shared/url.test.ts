import { describe, expect, it } from "vitest"
import {
  buildHatenaEntryUrl,
  extractExternalUrlFromHref,
  normalizeUrl
} from "../../src/shared/url"

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

describe("buildHatenaEntryUrl", () => {
  it("creates https entry paths with s segment", () => {
    expect(buildHatenaEntryUrl("https://developers.line.biz/ja/"))
      .toBe("https://b.hatena.ne.jp/entry/s/developers.line.biz/ja/")
  })

  it("creates http entry paths with http segment", () => {
    expect(buildHatenaEntryUrl("http://example.com/path?q=1"))
      .toBe("https://b.hatena.ne.jp/entry/http/example.com/path?q=1")
  })
})
