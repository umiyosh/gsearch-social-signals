import { afterEach, describe, expect, it, vi } from "vitest"
import {
  buildCandidateKeys,
  chunkArray,
  fetchHatenaCounts,
  fetchHatenaEntry,
  HATENA_COUNT_UNAVAILABLE,
  normalizeCountKeys,
  resolveRequestedCount
} from "../../src/shared/hatena"
import type { HatenaEntryFetchTiming } from "../../src/shared/diagnostics"

function mockFetchResponse(
  payload: unknown,
  ok = true,
  status = ok ? 200 : 500,
  headers: Record<string, string> = {}
): void {
  const normalizedHeaders = new Map(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value])
  )
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      status,
      headers: { get: (name: string) => normalizedHeaders.get(name.toLowerCase()) ?? null },
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
  vi.useRealTimers()
  vi.restoreAllMocks()
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

  it("marks only the failed batch urls as unavailable", async () => {
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
        status: 400,
        text: () => Promise.resolve("{}"),
        json: () => Promise.resolve({})
      })
    vi.stubGlobal("fetch", fetchMock)

    const counts = await fetchHatenaCounts(urls)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(counts[firstUrl]).toBe(1)
    expect(counts[lastFirstBatchUrl]).toBeNull()
    expect(counts[secondBatchUrl]).toBe(HATENA_COUNT_UNAVAILABLE)
  })

  it("marks every url in a batch as unavailable when the API fails", async () => {
    mockFetchResponse({}, false)

    const counts = await fetchHatenaCounts(["https://example.com/x"])
    expect(counts["https://example.com/x"]).toBe(HATENA_COUNT_UNAVAILABLE)
  })

  it("marks every url in a batch as unavailable when the API returns 400", async () => {
    mockFetchResponse({}, false, 400)

    const counts = await fetchHatenaCounts(["https://example.com/bad-request"])
    expect(counts["https://example.com/bad-request"]).toBe(HATENA_COUNT_UNAVAILABLE)
  })

  it("marks every url in a batch as unavailable when the API returns invalid JSON", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    mockFetchText("{not valid json")

    const counts = await fetchHatenaCounts(["https://example.com/invalid-json"])
    expect(counts["https://example.com/invalid-json"]).toBe(HATENA_COUNT_UNAVAILABLE)
  })
})

describe("fetchHatenaCounts request control", () => {
  it("limits concurrent Hatena requests to two across simultaneous batches and preserves FIFO", async () => {
    const releaseFetches: Array<() => void> = []
    const startedUrls: string[] = []
    let activeRequests = 0
    let maxActiveRequests = 0

    vi.stubGlobal(
      "fetch",
      vi.fn((requestUrl: string | URL | Request) => {
        const endpoint = new URL(
          typeof requestUrl === "string"
            ? requestUrl
            : requestUrl instanceof URL
              ? requestUrl.href
              : requestUrl.url
        )
        startedUrls.push(endpoint.searchParams.get("url") ?? "")
        activeRequests += 1
        maxActiveRequests = Math.max(maxActiveRequests, activeRequests)

        let releaseFetch: () => void = () => {}
        const waitForRelease = new Promise<void>((resolve) => {
          releaseFetch = resolve
        })
        releaseFetches.push(releaseFetch)

        return waitForRelease.then(() => {
          activeRequests -= 1
          return {
            ok: true,
            status: 200,
            text: () => Promise.resolve("{}")
          }
        })
      })
    )

    const urls = Array.from({ length: 4 }, (_, index) => `https://example.com/${index + 1}`)
    const requests = urls.map((url) => fetchHatenaCounts([url]))

    await vi.waitFor(() => {
      expect(startedUrls).toHaveLength(2)
    })
    expect(startedUrls).toEqual(urls.slice(0, 2))
    expect(maxActiveRequests).toBe(2)

    releaseFetches.shift()?.()
    await vi.waitFor(() => {
      expect(startedUrls).toHaveLength(3)
    })
    expect(startedUrls[2]).toBe(urls[2])

    releaseFetches.shift()?.()
    await vi.waitFor(() => {
      expect(startedUrls).toHaveLength(4)
    })
    expect(startedUrls[3]).toBe(urls[3])

    releaseFetches.splice(0).forEach((releaseFetch) => releaseFetch())
    await Promise.all(requests)

    expect(maxActiveRequests).toBe(2)
  })

  it("retries a transient Hatena 503 response", async () => {
    vi.useFakeTimers()
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: () => Promise.resolve("{}")
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ "https://example.com/retry": 7 }))
      })
    vi.stubGlobal("fetch", fetchMock)

    const request = fetchHatenaCounts(["https://example.com/retry"])
    await vi.runAllTimersAsync()

    await expect(request).resolves.toEqual({ "https://example.com/retry": 7 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("does not retry a permanent Hatena 400 response", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    mockFetchResponse({}, false, 400)

    const counts = await fetchHatenaCounts(["https://example.com/bad-request"])

    expect(counts["https://example.com/bad-request"]).toBe(HATENA_COUNT_UNAVAILABLE)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

describe("fetchHatenaEntry", () => {
  it("uses the browser default cache for entry previews", async () => {
    mockFetchResponse({ bookmarks: [] })

    await fetchHatenaEntry("https://example.com/entry")

    expect(fetch).toHaveBeenCalledWith(expect.any(String), {
      method: "GET",
      cache: "default"
    })
  })

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

  it("reports fetch, parse, filter, and total timings without changing bookmarks", async () => {
    mockFetchResponse(
      {
        bookmarks: [
          { user: "alice", comment: " useful " },
          { user: "bob", comment: " " }
        ]
      },
      true,
      200,
      {
        "x-cache": "Hit from cloudfront",
        age: "41",
        "x-amz-cf-pop": "NRT57-P4"
      }
    )
    let reportedTiming: HatenaEntryFetchTiming | undefined
    const reportTiming = (timing: HatenaEntryFetchTiming): void => {
      reportedTiming = timing
    }

    const bookmarks = await fetchHatenaEntry("https://example.com/entry", reportTiming)

    expect(bookmarks).toEqual([{ user: "alice", comment: "useful" }])
    expect(reportedTiming).toBeDefined()
    expect(typeof reportedTiming?.fetchHeadersMs).toBe("number")
    expect(typeof reportedTiming?.bodyParseMs).toBe("number")
    expect(typeof reportedTiming?.filterMs).toBe("number")
    expect(typeof reportedTiming?.totalMs).toBe("number")
    expect(reportedTiming?.responseHeaders).toEqual({
      xCache: "Hit from cloudfront",
      age: "41",
      xAmzCfPop: "NRT57-P4"
    })
  })

  it("reports null for diagnostic response headers that are absent", async () => {
    mockFetchResponse({ bookmarks: [] })
    let reportedTiming: HatenaEntryFetchTiming | undefined

    await fetchHatenaEntry("https://example.com/entry", (timing) => {
      reportedTiming = timing
    })

    expect(reportedTiming?.responseHeaders).toEqual({
      xCache: null,
      age: null,
      xAmzCfPop: null
    })
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
