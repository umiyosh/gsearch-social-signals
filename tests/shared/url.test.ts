import { describe, expect, it } from "vitest"
import {
  buildHatenaEntryUrl,
  extractExternalUrlFromHref,
  normalizeForComparison,
  normalizeRequestUrl,
  normalizeUrl,
  stripQueryString
} from "../../src/shared/url"

describe("normalizeUrl", () => {
  it("strips hash fragments and enforces protocol", () => {
    expect(normalizeUrl("https://example.com/path#section")).toBe("https://example.com/path")
    expect(normalizeUrl("mailto:test@example.com")).toBeNull()
  })

  it("returns null for unparseable input", () => {
    expect(normalizeUrl("not a url")).toBeNull()
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

  it("returns null for redirects without a target parameter", () => {
    expect(extractExternalUrlFromHref("https://www.google.com/url?sa=U")).toBeNull()
  })

  it("falls back to normalizeUrl for relative hrefs", () => {
    expect(extractExternalUrlFromHref("/relative/path")).toBeNull()
  })
})

describe("buildHatenaEntryUrl", () => {
  it("creates https entry paths with s segment", () => {
    expect(buildHatenaEntryUrl("https://developers.line.biz/ja/")).toBe(
      "https://b.hatena.ne.jp/entry/s/developers.line.biz/ja/"
    )
  })

  it("creates http entry paths with http segment", () => {
    expect(buildHatenaEntryUrl("http://example.com/path?q=1")).toBe(
      "https://b.hatena.ne.jp/entry/http/example.com/path?q=1"
    )
  })

  it("falls back to the Hatena top page for invalid urls", () => {
    expect(buildHatenaEntryUrl("not a url")).toBe("https://b.hatena.ne.jp/")
  })
})

describe("normalizeForComparison", () => {
  it("normalizes protocol, host casing, and trailing slash", () => {
    expect(normalizeForComparison("https://Example.com")).toBe("https://example.com/")
    expect(normalizeForComparison("https://example.com/index?q=1")).toBe(
      "https://example.com/index?q=1"
    )
  })

  it("keeps http scheme and returns invalid input unchanged", () => {
    expect(normalizeForComparison("http://Example.com/a")).toBe("http://example.com/a")
    expect(normalizeForComparison("not a url")).toBe("not a url")
  })
})

describe("stripQueryString", () => {
  it("removes the query string when present", () => {
    expect(stripQueryString("https://example.com/a?q=1")).toBe("https://example.com/a")
    expect(stripQueryString("https://example.com/a")).toBe("https://example.com/a")
  })
})

describe("normalizeRequestUrl", () => {
  it("drops known tracking parameters and keeps the rest", () => {
    expect(normalizeRequestUrl("https://example.com/a?utm_source=x&page=2&fbclid=y")).toBe(
      "https://example.com/a?page=2"
    )
  })

  it("removes the query entirely when only tracking parameters remain", () => {
    expect(normalizeRequestUrl("https://example.com/a?gclid=z")).toBe("https://example.com/a")
  })

  it("returns urls without queries unchanged", () => {
    expect(normalizeRequestUrl("https://example.com/a")).toBe("https://example.com/a")
  })
})
