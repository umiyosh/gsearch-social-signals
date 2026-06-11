import { afterEach, describe, expect, it, vi } from "vitest"
import { chunkArray, fetchHatenaCounts, fetchHatenaEntry } from "../../src/shared/hatena"

function mockFetchResponse(payload: unknown, ok = true): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      status: ok ? 200 : 500,
      text: () => Promise.resolve(JSON.stringify(payload)),
      json: () => Promise.resolve(payload)
    })
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("chunkArray", () => {
  it("splits arrays into even chunks", () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it("throws on invalid size", () => {
    expect(() => chunkArray([1], 0)).toThrowError()
  })
})

describe("fetchHatenaCounts", () => {
  it("maps API counts back to the requested urls", async () => {
    mockFetchResponse({ "https://example.com/foo": 12 })

    const counts = await fetchHatenaCounts(["https://example.com/foo"])
    expect(counts["https://example.com/foo"]).toBe(12)
  })

  it("matches counts across protocol flips and stripped queries", async () => {
    mockFetchResponse({ "http://example.com/article": 7 })

    const counts = await fetchHatenaCounts(["https://example.com/article?utm_source=feed"])
    expect(counts["https://example.com/article?utm_source=feed"]).toBe(7)
  })

  it("coerces string counts and falls back to null when unmatched", async () => {
    mockFetchResponse({ "https://example.com/a": "3" })

    const counts = await fetchHatenaCounts(["https://example.com/a", "https://example.com/b"])
    expect(counts["https://example.com/a"]).toBe(3)
    expect(counts["https://example.com/b"]).toBeNull()
  })

  it("marks every url in a batch as null when the API fails", async () => {
    mockFetchResponse({}, false)

    const counts = await fetchHatenaCounts(["https://example.com/x"])
    expect(counts["https://example.com/x"]).toBeNull()
  })
})

describe("fetchHatenaEntry", () => {
  it("returns bookmarks that carry non-empty comments", async () => {
    mockFetchResponse({
      bookmarks: [
        { user: "alice", comment: " great read ", timestamp: "2024", permalink: "https://p/1" },
        { user: "bob", comment: "   " },
        { user: "carol" }
      ]
    })

    const bookmarks = await fetchHatenaEntry("https://example.com/entry")
    expect(bookmarks).toEqual([
      { user: "alice", comment: "great read", timestamp: "2024", permalink: "https://p/1" }
    ])
  })

  it("returns an empty list for non-http urls", async () => {
    const bookmarks = await fetchHatenaEntry("mailto:test@example.com")
    expect(bookmarks).toEqual([])
  })

  it("returns an empty list when the payload has no bookmarks", async () => {
    mockFetchResponse({})

    const bookmarks = await fetchHatenaEntry("https://example.com/entry")
    expect(bookmarks).toEqual([])
  })

  it("rejects when the entry API responds with an error", async () => {
    mockFetchResponse({}, false)

    await expect(fetchHatenaEntry("https://example.com/entry")).rejects.toThrowError()
  })
})
