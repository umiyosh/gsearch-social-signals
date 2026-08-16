import { describe, expect, it, vi } from "vitest"
import {
  createMessageHandler,
  MAX_BLUESKY_CACHE_ENTRIES,
  MAX_BLUESKY_URLS_PER_REQUEST,
  MAX_HN_CACHE_ENTRIES,
  MAX_HN_URLS_PER_REQUEST,
  type BackgroundDeps
} from "../../src/background/handlers"
import { MESSAGE_TYPES } from "../../src/shared/messages"
import type { HatenaEntryResponse } from "../../src/shared/messages"
import {
  HACKER_NEWS_SUMMARY_UNAVAILABLE,
  type HackerNewsSummary
} from "../../src/shared/hackerNews"
import type { HatenaEntryFetchTiming } from "../../src/shared/diagnostics"
import { BLUESKY_SUMMARY_UNAVAILABLE, type BlueskySummary } from "../../src/shared/bluesky"

const diagnosticResponseHeaders = {
  xCache: "Hit from cloudfront",
  age: "41",
  xAmzCfPop: "NRT57-P4"
}

function buildDeps(overrides: Partial<BackgroundDeps> = {}): BackgroundDeps {
  return {
    fetchHatenaCounts: vi.fn().mockResolvedValue({}),
    fetchHatenaEntry: vi.fn().mockResolvedValue([]),
    fetchHackerNewsSummaries: vi.fn().mockResolvedValue({}),
    hnCache: new Map<string, HackerNewsSummary | null>(),
    fetchBlueskySummaries: vi.fn().mockResolvedValue({ summaries: {} }),
    blueskyCache: new Map<string, BlueskySummary>(),
    ...overrides
  }
}

describe("createMessageHandler", () => {
  it("returns null for messages that are not extension requests", () => {
    const handler = createMessageHandler(buildDeps())
    expect(handler({ type: "unknown" })).toBeNull()
    expect(handler(null)).toBeNull()
    expect(handler({ type: MESSAGE_TYPES.COUNT_REQUEST, urls: [42] })).toBeNull()
  })

  describe("counts request", () => {
    it("responds with an ok envelope of counts", async () => {
      const fetchHatenaCounts = vi.fn().mockResolvedValue({ "https://a": 3 })
      const handler = createMessageHandler(buildDeps({ fetchHatenaCounts }))

      const response = await handler({
        type: MESSAGE_TYPES.COUNT_REQUEST,
        urls: ["https://a"]
      })

      expect(response).toEqual({ ok: true, data: { "https://a": 3 } })
      expect(fetchHatenaCounts).toHaveBeenCalledWith(["https://a"])
    })

    it("drops non-http(s) urls before fetching", async () => {
      const fetchHatenaCounts = vi.fn().mockResolvedValue({})
      const handler = createMessageHandler(buildDeps({ fetchHatenaCounts }))

      await handler({
        type: MESSAGE_TYPES.COUNT_REQUEST,
        urls: ["javascript:alert(1)", "https://a", "not a url", "ftp://x"]
      })

      expect(fetchHatenaCounts).toHaveBeenCalledWith(["https://a"])
    })

    it("rejects oversized url lists with an error envelope", async () => {
      const fetchHatenaCounts = vi.fn()
      const handler = createMessageHandler(buildDeps({ fetchHatenaCounts }))

      const urls = Array.from({ length: 501 }, (_, i) => `https://example.com/${i}`)
      const response = await handler({ type: MESSAGE_TYPES.COUNT_REQUEST, urls })

      expect(response).toMatchObject({ ok: false })
      expect(fetchHatenaCounts).not.toHaveBeenCalled()
    })

    it("maps fetch failures to an error envelope", async () => {
      const fetchHatenaCounts = vi.fn().mockRejectedValue(new Error("boom"))
      const handler = createMessageHandler(buildDeps({ fetchHatenaCounts }))

      const response = await handler({ type: MESSAGE_TYPES.COUNT_REQUEST, urls: ["https://a"] })

      expect(response).toEqual({ ok: false, error: "boom" })
    })
  })

  describe("entry request", () => {
    it("responds with bookmarks for an http(s) url", async () => {
      const bookmarks = [{ user: "alice", comment: "nice" }]
      const fetchHatenaEntry = vi.fn().mockResolvedValue(bookmarks)
      const handler = createMessageHandler(buildDeps({ fetchHatenaEntry }))

      const response = await handler({
        type: MESSAGE_TYPES.ENTRY_REQUEST,
        url: "https://a"
      })

      expect(response).toEqual({ ok: true, data: bookmarks })
    })

    it("returns an empty list without fetching for non-http urls", async () => {
      const fetchHatenaEntry = vi.fn()
      const handler = createMessageHandler(buildDeps({ fetchHatenaEntry }))

      const response = await handler({
        type: MESSAGE_TYPES.ENTRY_REQUEST,
        url: "javascript:alert(1)"
      })

      expect(response).toEqual({ ok: true, data: [] })
      expect(fetchHatenaEntry).not.toHaveBeenCalled()
    })

    it("maps fetch failures to an error envelope", async () => {
      const fetchHatenaEntry = vi.fn().mockRejectedValue(new Error("entry down"))
      const handler = createMessageHandler(buildDeps({ fetchHatenaEntry }))

      const response = await handler({ type: MESSAGE_TYPES.ENTRY_REQUEST, url: "https://a" })

      expect(response).toEqual({ ok: false, error: "entry down" })
    })

    it("returns background and fetch timings for diagnostic requests", async () => {
      const bookmarks = [{ user: "alice", comment: "nice" }]
      const fetchHatenaEntry = vi.fn(
        (_url: string, reportTiming?: (timing: HatenaEntryFetchTiming) => void) => {
          reportTiming?.({
            fetchHeadersMs: 12,
            bodyParseMs: 3,
            filterMs: 1,
            totalMs: 16,
            responseHeaders: diagnosticResponseHeaders
          })
          return Promise.resolve(bookmarks)
        }
      )
      const handler = createMessageHandler(buildDeps({ fetchHatenaEntry }))

      const response = await handler({
        type: MESSAGE_TYPES.ENTRY_REQUEST,
        url: "https://a",
        diagnostics: { requestId: "entry-1", sentAtEpochMs: Date.now() }
      })

      expect(fetchHatenaEntry).toHaveBeenCalledWith("https://a", expect.any(Function))
      expect(response).toMatchObject({
        ok: true,
        data: bookmarks,
        diagnostics: {
          requestId: "entry-1",
          fetch: {
            fetchHeadersMs: 12,
            bodyParseMs: 3,
            filterMs: 1,
            totalMs: 16,
            responseHeaders: diagnosticResponseHeaders
          }
        }
      })
      const diagnosticResponse = response as HatenaEntryResponse
      expect(typeof diagnosticResponse.diagnostics?.backgroundReceivedDelayMs).toBe("number")
      expect(typeof diagnosticResponse.diagnostics?.backgroundTotalMs).toBe("number")
    })
  })
})

describe("hacker news request", () => {
  it("fetches uncached urls once and serves repeats from the cache", async () => {
    const fetchHackerNewsSummaries = vi.fn().mockResolvedValue({ "https://a": { nbHits: 5 } })
    const deps = buildDeps({ fetchHackerNewsSummaries })
    const handler = createMessageHandler(deps)
    const request = { type: MESSAGE_TYPES.HN_REQUEST, urls: ["https://a"] }

    const first = await handler(request)
    const second = await handler(request)

    expect(first).toEqual({ ok: true, data: { "https://a": { nbHits: 5 } } })
    expect(second).toEqual(first)
    expect(fetchHackerNewsSummaries).toHaveBeenCalledTimes(1)
  })

  it("does not cache unavailable HN results so a later request can retry", async () => {
    const fetchHackerNewsSummaries = vi
      .fn()
      .mockResolvedValueOnce({ "https://a": HACKER_NEWS_SUMMARY_UNAVAILABLE })
      .mockResolvedValueOnce({ "https://a": { nbHits: 0 } })
    const handler = createMessageHandler(buildDeps({ fetchHackerNewsSummaries }))
    const request = { type: MESSAGE_TYPES.HN_REQUEST, urls: ["https://a"] }

    const first = await handler(request)
    const second = await handler(request)

    expect(first).toEqual({
      ok: true,
      data: { "https://a": HACKER_NEWS_SUMMARY_UNAVAILABLE }
    })
    expect(second).toEqual({ ok: true, data: { "https://a": { nbHits: 0 } } })
    expect(fetchHackerNewsSummaries).toHaveBeenCalledTimes(2)
  })

  it("answers null for urls that were filtered out", async () => {
    const handler = createMessageHandler(buildDeps())

    const response = await handler({
      type: MESSAGE_TYPES.HN_REQUEST,
      urls: ["not a url"]
    })

    expect(response).toEqual({ ok: true, data: { "not a url": null } })
  })

  it("rejects oversized url lists with the HN-specific limit", async () => {
    const handler = createMessageHandler(buildDeps())
    const urls = Array.from(
      { length: MAX_HN_URLS_PER_REQUEST + 1 },
      (_, i) => `https://example.com/${i}`
    )

    const response = await handler({ type: MESSAGE_TYPES.HN_REQUEST, urls })

    expect(response).toMatchObject({ ok: false })
  })

  it("evicts the oldest HN cache entries after fetching new summaries", async () => {
    const hnCache = new Map<string, HackerNewsSummary | null>(
      Array.from({ length: MAX_HN_CACHE_ENTRIES }, (_, i) => [
        `https://example.com/cached-${i}`,
        { nbHits: i }
      ])
    )
    const fetchHackerNewsSummaries = vi
      .fn()
      .mockResolvedValue({ "https://example.com/new": { nbHits: 999 } })
    const handler = createMessageHandler(buildDeps({ fetchHackerNewsSummaries, hnCache }))

    const response = await handler({
      type: MESSAGE_TYPES.HN_REQUEST,
      urls: ["https://example.com/new"]
    })

    expect(response).toEqual({
      ok: true,
      data: { "https://example.com/new": { nbHits: 999 } }
    })
    expect(hnCache.size).toBe(MAX_HN_CACHE_ENTRIES)
    expect(hnCache.has("https://example.com/cached-0")).toBe(false)
    expect(hnCache.get("https://example.com/new")).toEqual({ nbHits: 999 })
  })

  it("maps fetch failures to an error envelope", async () => {
    const fetchHackerNewsSummaries = vi.fn().mockRejectedValue(new Error("hn down"))
    const handler = createMessageHandler(buildDeps({ fetchHackerNewsSummaries }))

    const response = await handler({ type: MESSAGE_TYPES.HN_REQUEST, urls: ["https://a"] })

    expect(response).toEqual({ ok: false, error: "hn down" })
  })
})

describe("bluesky request", () => {
  it("fetches uncached urls once and serves repeats from the cache", async () => {
    const fetchBlueskySummaries = vi
      .fn()
      .mockResolvedValue({ summaries: { "https://a/": { hitsTotal: 5 } } })
    const handler = createMessageHandler(buildDeps({ fetchBlueskySummaries }))
    const request = { type: MESSAGE_TYPES.BLUESKY_REQUEST, urls: ["https://a"] }

    const first = await handler(request)
    const second = await handler(request)

    expect(first).toEqual({
      ok: true,
      data: { summaries: { "https://a": { hitsTotal: 5 } } }
    })
    expect(second).toEqual(first)
    expect(fetchBlueskySummaries).toHaveBeenCalledTimes(1)
  })

  it("uses normalized URL keys for deduplication and cache lookup", async () => {
    const fetchBlueskySummaries = vi.fn().mockResolvedValue({
      summaries: { "https://example.com/article?keep=1": { hitsTotal: 5 } }
    })
    const handler = createMessageHandler(buildDeps({ fetchBlueskySummaries }))

    const first = await handler({
      type: MESSAGE_TYPES.BLUESKY_REQUEST,
      urls: ["https://EXAMPLE.com/article?keep=1&utm_source=one#fragment"]
    })
    const second = await handler({
      type: MESSAGE_TYPES.BLUESKY_REQUEST,
      urls: ["https://example.com/article?utm_source=two&keep=1"]
    })

    expect(first).toEqual({
      ok: true,
      data: {
        summaries: {
          "https://EXAMPLE.com/article?keep=1&utm_source=one#fragment": { hitsTotal: 5 }
        }
      }
    })
    expect(second).toEqual({
      ok: true,
      data: {
        summaries: { "https://example.com/article?utm_source=two&keep=1": { hitsTotal: 5 } }
      }
    })
    expect(fetchBlueskySummaries).toHaveBeenCalledTimes(1)
    expect(fetchBlueskySummaries).toHaveBeenCalledWith(["https://example.com/article?keep=1"])
  })

  it("does not cache unavailable results", async () => {
    const fetchBlueskySummaries = vi
      .fn()
      .mockResolvedValueOnce({ summaries: { "https://a/": BLUESKY_SUMMARY_UNAVAILABLE } })
      .mockResolvedValueOnce({ summaries: { "https://a/": { hitsTotal: 1 } } })
    const handler = createMessageHandler(buildDeps({ fetchBlueskySummaries }))
    const request = { type: MESSAGE_TYPES.BLUESKY_REQUEST, urls: ["https://a"] }

    expect(await handler(request)).toEqual({
      ok: true,
      data: { summaries: { "https://a": BLUESKY_SUMMARY_UNAVAILABLE } }
    })
    expect(await handler(request)).toEqual({
      ok: true,
      data: { summaries: { "https://a": { hitsTotal: 1 } } }
    })
    expect(fetchBlueskySummaries).toHaveBeenCalledTimes(2)
  })

  it("forwards the Bluesky cooldown hint with unavailable summaries", async () => {
    const fetchBlueskySummaries = vi.fn().mockResolvedValue({
      summaries: { "https://a/": BLUESKY_SUMMARY_UNAVAILABLE },
      retryAfterMs: 300_000
    })
    const handler = createMessageHandler(buildDeps({ fetchBlueskySummaries }))

    expect(await handler({ type: MESSAGE_TYPES.BLUESKY_REQUEST, urls: ["https://a"] })).toEqual({
      ok: true,
      data: {
        summaries: { "https://a": BLUESKY_SUMMARY_UNAVAILABLE },
        retryAfterMs: 300_000
      }
    })
  })

  it("returns unavailable for filtered URLs and rejects oversized lists", async () => {
    const handler = createMessageHandler(buildDeps())

    expect(
      await handler({ type: MESSAGE_TYPES.BLUESKY_REQUEST, urls: ["javascript:alert(1)"] })
    ).toEqual({
      ok: true,
      data: { summaries: { "javascript:alert(1)": BLUESKY_SUMMARY_UNAVAILABLE } }
    })

    const urls = Array.from(
      { length: MAX_BLUESKY_URLS_PER_REQUEST + 1 },
      (_, index) => `https://example.com/${index}`
    )
    expect(await handler({ type: MESSAGE_TYPES.BLUESKY_REQUEST, urls })).toMatchObject({
      ok: false
    })
  })

  it("evicts the oldest cache entry", async () => {
    const blueskyCache = new Map<string, BlueskySummary>(
      Array.from({ length: MAX_BLUESKY_CACHE_ENTRIES }, (_, index) => [
        `https://example.com/cached-${index}`,
        { hitsTotal: index }
      ])
    )
    const fetchBlueskySummaries = vi
      .fn()
      .mockResolvedValue({ summaries: { "https://example.com/new": { hitsTotal: 999 } } })
    const handler = createMessageHandler(buildDeps({ blueskyCache, fetchBlueskySummaries }))

    await handler({ type: MESSAGE_TYPES.BLUESKY_REQUEST, urls: ["https://example.com/new"] })

    expect(blueskyCache.size).toBe(MAX_BLUESKY_CACHE_ENTRIES)
    expect(blueskyCache.has("https://example.com/cached-0")).toBe(false)
    expect(blueskyCache.get("https://example.com/new")).toEqual({ hitsTotal: 999 })
  })
})
