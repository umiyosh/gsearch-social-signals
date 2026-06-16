import { afterEach, describe, expect, it, vi } from "vitest"
import { fetchHackerNewsSummaries } from "../../src/shared/hackerNews"

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

afterEach(() => {
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

  it("maps failed requests to null without rejecting", async () => {
    mockFetchResponse({}, false)

    const summaries = await fetchHackerNewsSummaries(["https://example.com/"])
    expect(summaries["https://example.com/"]).toBeNull()
  })

  it("deduplicates urls before fetching", async () => {
    mockFetchResponse({ nbHits: 1, hits: [] })

    await fetchHackerNewsSummaries(["https://example.com/", "https://example.com/"])
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
  })

  it("searches with a normalized URL without the unsupported url attribute restriction", async () => {
    mockFetchResponse({ nbHits: 0, hits: [] })

    await fetchHackerNewsSummaries([
      "https://Example.com/article?utm_source=google&keep=1#comments"
    ])

    const requestUrl = new URL(String(vi.mocked(fetch).mock.calls[0]?.[0]))
    expect(requestUrl.searchParams.get("query")).toBe("https://example.com/article?keep=1")
    expect(requestUrl.searchParams.has("restrictSearchableAttributes")).toBe(false)
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

  it("matches HN hit URLs when only a non-root trailing slash differs", async () => {
    mockFetchResponse({
      nbHits: 1,
      hits: [
        {
          objectID: "333",
          points: 500,
          num_comments: 131,
          url: "https://github.com/HackerNews/API"
        }
      ]
    })

    const summaries = await fetchHackerNewsSummaries(["https://github.com/HackerNews/API/"])
    expect(summaries["https://github.com/HackerNews/API/"]).toEqual({
      nbHits: 1,
      maxPoints: 500,
      maxComments: 131,
      topStoryId: "333",
      topStoryUrl: "https://news.ycombinator.com/item?id=333"
    })
  })

  it("matches requested URLs when only the HN hit has a non-root trailing slash", async () => {
    mockFetchResponse({
      nbHits: 1,
      hits: [{ objectID: "444", points: 42, num_comments: 7, url: "https://example.com/article/" }]
    })

    const summaries = await fetchHackerNewsSummaries(["https://example.com/article"])
    expect(summaries["https://example.com/article"]).toMatchObject({
      nbHits: 1,
      maxPoints: 42,
      maxComments: 7,
      topStoryId: "444"
    })
  })

  it("treats HN 400 responses as missing summaries", async () => {
    mockFetchResponse({}, false, 400)

    const summaries = await fetchHackerNewsSummaries(["https://example.com/"])
    expect(summaries["https://example.com/"]).toBeNull()
  })
})
