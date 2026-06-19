import { afterEach, describe, expect, it, vi } from "vitest"
import {
  buildCandidateKeys,
  chunkArray,
  fetchHatenaCounts,
  fetchHatenaEntry,
  normalizeCountKeys,
  resolveRequestedCount
} from "../../src/shared/hatena"

function mockFetchResponse(payload: unknown, ok = true, status = ok ? 200 : 500): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      status,
      text: () => Promise.resolve(JSON.stringify(payload)),
      json: () => Promise.resolve(payload)
    })
  )
}

function mockFetchText(payloadText: string, ok = true, status = ok ? 200 : 500): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      status,
      text: () => Promise.resolve(payloadText),
      json: () => Promise.resolve(JSON.parse(payloadText))
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

  it("keeps counts scoped to each batch when more than 50 urls are requested", async () => {
    const urls = Array.from({ length: 51 }, (_, index) => `https://example.com/${index}`)
    const firstUrl = urls[0]!
    const lastFirstBatchUrl = urls[49]!
    const secondBatchUrl = urls[50]!
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ [firstUrl]: 1, [lastFirstBatchUrl]: 49 })),
        json: () => Promise.resolve({})
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ [secondBatchUrl]: 50 })),
        json: () => Promise.resolve({})
      })
    vi.stubGlobal("fetch", fetchMock)

    const counts = await fetchHatenaCounts(urls)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(counts[firstUrl]).toBe(1)
    expect(counts[lastFirstBatchUrl]).toBe(49)
    expect(counts[secondBatchUrl]).toBe(50)
  })

  it("marks only the failed batch urls as null", async () => {
    const urls = Array.from({ length: 51 }, (_, index) => `https://example.com/${index}`)
    const firstUrl = urls[0]!
    const lastFirstBatchUrl = urls[49]!
    const secondBatchUrl = urls[50]!
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ [firstUrl]: 1 })),
        json: () => Promise.resolve({})
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve("{}"),
        json: () => Promise.resolve({})
      })
    vi.stubGlobal("fetch", fetchMock)

    const counts = await fetchHatenaCounts(urls)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(counts[firstUrl]).toBe(1)
    expect(counts[lastFirstBatchUrl]).toBeNull()
    expect(counts[secondBatchUrl]).toBeNull()
  })

  it("marks every url in a batch as null when the API fails", async () => {
    mockFetchResponse({}, false)

    const counts = await fetchHatenaCounts(["https://example.com/x"])
    expect(counts["https://example.com/x"]).toBeNull()
  })

  it("marks every url in a batch as null when the API returns 400", async () => {
    mockFetchResponse({}, false, 400)

    const counts = await fetchHatenaCounts(["https://example.com/bad-request"])
    expect(counts["https://example.com/bad-request"]).toBeNull()
  })

  it("marks every url in a batch as null when the API returns invalid JSON", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    mockFetchText("{not valid json")

    const counts = await fetchHatenaCounts(["https://example.com/invalid-json"])
    expect(counts["https://example.com/invalid-json"]).toBeNull()
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

describe("buildCandidateKeys", () => {
  it("expands a request into protocol flips and query-stripped variants", () => {
    expect(buildCandidateKeys("https://example.com/a?q=1")).toEqual([
      "https://example.com/a?q=1",
      "http://example.com/a?q=1",
      "https://example.com/a",
      "http://example.com/a"
    ])
  })
})

describe("resolveRequestedCount", () => {
  it("returns the count of the first matching candidate", () => {
    const counts = new Map([["http://example.com/a", 8]])
    expect(resolveRequestedCount("https://example.com/a?q=1", counts)).toBe(8)
  })

  it("returns null when no candidate matches", () => {
    expect(resolveRequestedCount("https://example.com/a", new Map())).toBeNull()
  })
})

describe("normalizeCountKeys", () => {
  it("normalizes API keys for comparison and coerces null counts to zero", () => {
    const normalized = normalizeCountKeys({ "https://Example.com/A": 3, "https://b.example": null })
    expect(normalized.get("https://example.com/A")).toBe(3)
    expect(normalized.get("https://b.example/")).toBe(0)
  })
})
