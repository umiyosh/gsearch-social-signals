import { afterEach, describe, expect, it, vi } from "vitest"
import {
  fetchHackerNewsSummaries,
  HACKER_NEWS_SUMMARY_UNAVAILABLE,
  HN_REQUEST_TIMEOUT_MS
} from "../../src/shared/hackerNews"

function mockFetchResponse(payload: unknown, ok = true, status = ok ? 200 : 500): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      status,
      json: () => Promise.resolve(payload)
    })
  )
}

function mockFetchJsonError(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError("invalid json"))
    })
  )
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("fetchHackerNewsSummaries", () => {
  it("summarizes hits with max points, comments, and top story link", async () => {
    mockFetchResponse({
      nbHits: 2,
      hits: [
        { objectID: "111", points: 10, num_comments: 4, url: "https://example.com/article" },
        { objectID: "222", points: 50, num_comments: 2, url: "https://example.com/article" }
      ]
    })

    const summaries = await fetchHackerNewsSummaries(["https://example.com/article"])
    const summary = summaries["https://example.com/article"]
    expect(summary).toEqual({
      nbHits: 2,
      maxPoints: 50,
      maxComments: 4,
      topStoryId: "222",
      topStoryUrl: "https://news.ycombinator.com/item?id=222"
    })
  })

  it("returns nbHits only when the payload has no hits array", async () => {
    mockFetchResponse({ nbHits: 3 })

    const summaries = await fetchHackerNewsSummaries(["https://example.com/"])
    expect(summaries["https://example.com/"]).toEqual({ nbHits: 3 })
  })

  it("defaults nbHits to 0 when the payload omits it", async () => {
    mockFetchResponse({ hits: [] })

    const summaries = await fetchHackerNewsSummaries(["https://example.com/"])
    expect(summaries["https://example.com/"]).toMatchObject({ nbHits: 0 })
  })

  it("returns a zero-point summary when the API returns empty hits", async () => {
    mockFetchResponse({ nbHits: 0, hits: [] })

    const summaries = await fetchHackerNewsSummaries(["https://example.com/empty"])
    expect(summaries["https://example.com/empty"]).toEqual({
      nbHits: 0,
      maxPoints: 0,
      maxComments: 0
    })
  })

  it("maps failed requests to unavailable without rejecting", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    mockFetchResponse({}, false)

    const summaries = await fetchHackerNewsSummaries(["https://example.com/"])
    expect(summaries["https://example.com/"]).toBe(HACKER_NEWS_SUMMARY_UNAVAILABLE)
  })

  it("maps invalid JSON responses to unavailable without rejecting", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    mockFetchJsonError()

    const summaries = await fetchHackerNewsSummaries(["https://example.com/invalid-json"])
    expect(summaries["https://example.com/invalid-json"]).toBe(HACKER_NEWS_SUMMARY_UNAVAILABLE)
  })
})

describe("fetchHackerNewsSummaries request control", () => {
  it("logs failed requests once per batch", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
    mockFetchResponse({}, false)

    const summaries = await fetchHackerNewsSummaries([
      "https://example.com/a",
      "https://example.com/b",
      "https://example.com/c"
    ])

    expect(summaries["https://example.com/a"]).toBe(HACKER_NEWS_SUMMARY_UNAVAILABLE)
    expect(summaries["https://example.com/b"]).toBe(HACKER_NEWS_SUMMARY_UNAVAILABLE)
    expect(summaries["https://example.com/c"]).toBe(HACKER_NEWS_SUMMARY_UNAVAILABLE)
    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to fetch Hacker News summaries",
      expect.objectContaining({ failedRequests: 3, requestedUrls: 3 })
    )
  })

  it("deduplicates urls before fetching", async () => {
    mockFetchResponse({ nbHits: 1, hits: [] })

    await fetchHackerNewsSummaries(["https://example.com/", "https://example.com/"])
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
  })

  it("passes an abort signal to HN fetch requests", async () => {
    mockFetchResponse({ nbHits: 0, hits: [] })

    await fetchHackerNewsSummaries(["https://example.com/"])

    const requestInit = vi.mocked(fetch).mock.calls[0]?.[1]
    expect(requestInit?.signal).toBeInstanceOf(AbortSignal)
  })

  it("times out slow HN fetch requests", async () => {
    vi.useFakeTimers()
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string | URL | Request, init?: RequestInit) => {
        const signal = init?.signal
        return new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"))
          })
        })
      })
    )

    const request = fetchHackerNewsSummaries(["https://example.com/slow"])
    await vi.advanceTimersByTimeAsync(HN_REQUEST_TIMEOUT_MS)

    await expect(request).resolves.toEqual({
      "https://example.com/slow": HACKER_NEWS_SUMMARY_UNAVAILABLE
    })
  })

  it("limits concurrent HN requests to four across simultaneous batches and preserves FIFO", async () => {
    const releaseFetches: Array<() => void> = []
    const startedUrls: string[] = []
    let activeRequests = 0
    let maxActiveRequests = 0

    vi.stubGlobal(
      "fetch",
      vi.fn((requestUrl: string | URL | Request) => {
        const endpoint = new URL(requestUrl.toString())
        startedUrls.push(endpoint.searchParams.get("query") ?? "")
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
            json: () => Promise.resolve({ nbHits: 0, hits: [] })
          }
        })
      })
    )

    const urls = Array.from({ length: 6 }, (_, index) => `https://example.com/${index + 1}`)
    const requests = urls.map((url) => fetchHackerNewsSummaries([url]))

    await vi.waitFor(() => {
      expect(startedUrls).toHaveLength(4)
    })
    expect(startedUrls).toEqual(urls.slice(0, 4))
    expect(maxActiveRequests).toBe(4)

    releaseFetches.shift()?.()

    await vi.waitFor(() => {
      expect(startedUrls).toHaveLength(5)
    })
    expect(startedUrls[4]).toBe(urls[4])

    releaseFetches.shift()?.()

    await vi.waitFor(() => {
      expect(startedUrls).toHaveLength(6)
    })
    expect(startedUrls[5]).toBe(urls[5])

    releaseFetches.splice(0).forEach((releaseFetch) => releaseFetch())
    await Promise.all(requests)

    expect(maxActiveRequests).toBe(4)
  })

  it("retries an aborted HN request before marking it unavailable", async () => {
    vi.useFakeTimers()
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("The operation was aborted.", "AbortError"))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ nbHits: 0, hits: [] })
      })
    vi.stubGlobal("fetch", fetchMock)

    const request = fetchHackerNewsSummaries(["https://example.com/retry"])
    await vi.runAllTimersAsync()

    await expect(request).resolves.toEqual({
      "https://example.com/retry": { nbHits: 0, maxPoints: 0, maxComments: 0 }
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe("fetchHackerNewsSummaries URL matching", () => {
  it("searches with a normalized URL without unsupported Algolia filters", async () => {
    mockFetchResponse({ nbHits: 0, hits: [] })

    await fetchHackerNewsSummaries([
      "https://Example.com/article?utm_source=google&keep=1#comments"
    ])

    const requestUrl = new URL(String(vi.mocked(fetch).mock.calls[0]?.[0]))
    expect(requestUrl.searchParams.get("query")).toBe("https://example.com/article?keep=1")
    expect(requestUrl.searchParams.has("restrictSearchableAttributes")).toBe(false)
    expect(requestUrl.searchParams.has("numericFilters")).toBe(false)
  })

  it("counts only hits whose url matches the requested URL", async () => {
    mockFetchResponse({
      nbHits: 2,
      hits: [
        { objectID: "111", points: 10, num_comments: 4, url: "http://example.com/article" },
        { objectID: "222", points: 50, num_comments: 2, url: "https://other.example/article" }
      ]
    })

    const summaries = await fetchHackerNewsSummaries(["https://example.com/article?utm_medium=cpc"])
    expect(summaries["https://example.com/article?utm_medium=cpc"]).toEqual({
      nbHits: 1,
      maxPoints: 10,
      maxComments: 4,
      topStoryId: "111",
      topStoryUrl: "https://news.ycombinator.com/item?id=111"
    })
  })

  it("filters non-positive points locally instead of using Algolia numeric filters", async () => {
    mockFetchResponse({
      nbHits: 4,
      hits: [
        { objectID: "111", points: 0, num_comments: 4, url: "https://example.com/article" },
        { objectID: "222", num_comments: 8, url: "https://example.com/article" },
        { objectID: "333", points: 12, num_comments: 2, url: "https://example.com/article" },
        { objectID: "444", points: 99, num_comments: 1, url: "https://other.example/article" }
      ]
    })

    const summaries = await fetchHackerNewsSummaries(["https://example.com/article"])
    const requestUrl = new URL(String(vi.mocked(fetch).mock.calls[0]?.[0]))

    expect(requestUrl.searchParams.has("numericFilters")).toBe(false)
    expect(summaries["https://example.com/article"]).toEqual({
      nbHits: 1,
      maxPoints: 12,
      maxComments: 2,
      topStoryId: "333",
      topStoryUrl: "https://news.ycombinator.com/item?id=333"
    })
  })

  it("treats HN 400 responses as unavailable", async () => {
    mockFetchResponse({}, false, 400)

    const summaries = await fetchHackerNewsSummaries(["https://example.com/"])
    expect(summaries["https://example.com/"]).toBe(HACKER_NEWS_SUMMARY_UNAVAILABLE)
  })
})
