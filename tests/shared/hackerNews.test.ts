import { afterEach, describe, expect, it, vi } from "vitest"
import { fetchHackerNewsSummaries } from "../../src/shared/hackerNews"

function mockFetchResponse(payload: unknown, ok = true): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      status: ok ? 200 : 500,
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
        { objectID: "111", points: 10, num_comments: 4 },
        { objectID: "222", points: 50, num_comments: 2 }
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
})
