import { describe, expect, it, vi } from "vitest"
import { createMessageHandler, type BackgroundDeps } from "../../src/background/handlers"
import { MESSAGE_TYPES } from "../../src/shared/messages"
import type { HackerNewsSummary } from "../../src/shared/hackerNews"

function buildDeps(overrides: Partial<BackgroundDeps> = {}): BackgroundDeps {
  return {
    fetchHatenaCounts: vi.fn().mockResolvedValue({}),
    fetchHatenaEntry: vi.fn().mockResolvedValue([]),
    fetchHackerNewsSummaries: vi.fn().mockResolvedValue({}),
    hnCache: new Map<string, HackerNewsSummary | null>(),
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

    it("answers null for urls that were filtered out", async () => {
      const handler = createMessageHandler(buildDeps())

      const response = await handler({
        type: MESSAGE_TYPES.HN_REQUEST,
        urls: ["not a url"]
      })

      expect(response).toEqual({ ok: true, data: { "not a url": null } })
    })

    it("rejects oversized url lists with an error envelope", async () => {
      const handler = createMessageHandler(buildDeps())
      const urls = Array.from({ length: 501 }, (_, i) => `https://example.com/${i}`)

      const response = await handler({ type: MESSAGE_TYPES.HN_REQUEST, urls })

      expect(response).toMatchObject({ ok: false })
    })

    it("maps fetch failures to an error envelope", async () => {
      const fetchHackerNewsSummaries = vi.fn().mockRejectedValue(new Error("hn down"))
      const handler = createMessageHandler(buildDeps({ fetchHackerNewsSummaries }))

      const response = await handler({ type: MESSAGE_TYPES.HN_REQUEST, urls: ["https://a"] })

      expect(response).toEqual({ ok: false, error: "hn down" })
    })
  })
})
