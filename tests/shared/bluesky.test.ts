import { afterEach, describe, expect, it, vi } from "vitest"
import {
  BLUESKY_REQUEST_TIMEOUT_MS,
  BLUESKY_SUMMARY_UNAVAILABLE,
  createBlueskyClient
} from "../../src/shared/bluesky"

function response(payload: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: () => Promise.resolve(payload)
  } as Response
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("createBlueskyClient", () => {
  it("requests a normalized URL and returns hitsTotal", async () => {
    let requestedUrl = ""
    const fetcher = vi.fn((input: string | URL | Request) => {
      requestedUrl = String(input)
      return Promise.resolve(response({ posts: [{}], hitsTotal: 12 }))
    })
    const client = createBlueskyClient({ fetcher })

    const summaries = await client.fetchSummaries([
      "https://Example.com/article?utm_source=google&keep=1#comments"
    ])

    expect(summaries).toEqual({
      "https://Example.com/article?utm_source=google&keep=1#comments": { hitsTotal: 12 }
    })
    const endpoint = new URL(requestedUrl)
    expect(endpoint.origin).toBe("https://api.bsky.app")
    expect(endpoint.pathname).toBe("/xrpc/app.bsky.feed.searchPosts")
    expect(endpoint.searchParams.get("q")).toBe("https://example.com/article?keep=1")
    expect(endpoint.searchParams.get("url")).toBe("https://example.com/article?keep=1")
    expect(endpoint.searchParams.get("limit")).toBe("1")
    expect(endpoint.searchParams.get("sort")).toBe("top")
  })

  it("keeps zero distinct from an unavailable result", async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ posts: [], hitsTotal: 0 }))
    const client = createBlueskyClient({ fetcher })

    await expect(client.fetchSummaries(["https://example.com/zero"])).resolves.toEqual({
      "https://example.com/zero": { hitsTotal: 0 }
    })
  })

  it.each([
    { posts: [] },
    { posts: [{}] },
    { posts: [], hitsTotal: -1 },
    { posts: [], hitsTotal: 1.5 },
    { posts: "invalid", hitsTotal: 1 }
  ])("maps malformed payloads to unavailable: %o", async (payload) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const client = createBlueskyClient({ fetcher: vi.fn().mockResolvedValue(response(payload)) })

    await expect(client.fetchSummaries(["https://example.com/invalid"])).resolves.toEqual({
      "https://example.com/invalid": BLUESKY_SUMMARY_UNAVAILABLE
    })
  })

  it("maps invalid JSON to unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const invalidJsonResponse = response({})
    invalidJsonResponse.json = () => Promise.reject(new SyntaxError("invalid JSON"))
    const fetcher = vi.fn().mockResolvedValue(invalidJsonResponse)
    const client = createBlueskyClient({ fetcher })

    await expect(client.fetchSummaries(["https://example.com/invalid-json"])).resolves.toEqual({
      "https://example.com/invalid-json": BLUESKY_SUMMARY_UNAVAILABLE
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it.each([400, 403])("does not retry HTTP %s", async (status) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const fetcher = vi.fn().mockResolvedValue(response({}, status))
    const client = createBlueskyClient({ fetcher })

    await expect(client.fetchSummaries([`https://example.com/status-${status}`])).resolves.toEqual({
      [`https://example.com/status-${status}`]: BLUESKY_SUMMARY_UNAVAILABLE
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it("deduplicates URLs after request normalization", async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ posts: [], hitsTotal: 2 }))
    const client = createBlueskyClient({ fetcher })
    const first = "https://example.com/article?utm_source=one"
    const second = "https://EXAMPLE.com/article?utm_source=two#section"

    await expect(client.fetchSummaries([first, second])).resolves.toEqual({
      [first]: { hitsTotal: 2 },
      [second]: { hitsTotal: 2 }
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})

describe("Bluesky request control", () => {
  it("limits concurrent requests to three across batches", async () => {
    const releases: Array<() => void> = []
    let active = 0
    let maxActive = 0
    const fetcher = vi.fn(() => {
      active += 1
      maxActive = Math.max(maxActive, active)
      return new Promise<Response>((resolve) => {
        releases.push(() => {
          active -= 1
          resolve(response({ posts: [], hitsTotal: 0 }))
        })
      })
    })
    const client = createBlueskyClient({ fetcher })
    const urls = Array.from({ length: 5 }, (_, index) => `https://example.com/${index}`)
    const pending = urls.map((url) => client.fetchSummaries([url]))

    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3))
    expect(maxActive).toBe(3)
    releases.shift()?.()
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(4))
    releases.shift()?.()
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(5))
    releases.splice(0).forEach((release) => release())

    await Promise.all(pending)
    expect(maxActive).toBe(3)
  })

  it("opens a circuit from Retry-After without retrying the 429 request", async () => {
    let now = 1_700_000_000_000
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({}, 429, { "Retry-After": "120" }))
      .mockResolvedValue(response({ posts: [], hitsTotal: 3 }))
    const client = createBlueskyClient({ fetcher, now: () => now })

    await expect(client.fetchSummaries(["https://example.com/limited"])).resolves.toEqual({
      "https://example.com/limited": BLUESKY_SUMMARY_UNAVAILABLE
    })
    await expect(client.fetchSummaries(["https://example.com/blocked"])).resolves.toEqual({
      "https://example.com/blocked": BLUESKY_SUMMARY_UNAVAILABLE
    })
    expect(fetcher).toHaveBeenCalledTimes(1)

    now += 120_001
    await expect(client.fetchSummaries(["https://example.com/recovered"])).resolves.toEqual({
      "https://example.com/recovered": { hitsTotal: 3 }
    })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it("uses the fallback circuit interval when a 429 has no reset header", async () => {
    let now = 1_700_000_000_000
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({}, 429))
      .mockResolvedValue(response({ posts: [], hitsTotal: 1 }))
    const client = createBlueskyClient({ fetcher, now: () => now })

    await client.fetchSummaries(["https://example.com/limited"])
    now += 59_999
    await client.fetchSummaries(["https://example.com/still-blocked"])
    expect(fetcher).toHaveBeenCalledTimes(1)

    now += 2
    await expect(client.fetchSummaries(["https://example.com/recovered"])).resolves.toEqual({
      "https://example.com/recovered": { hitsTotal: 1 }
    })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it("honors a RateLimit-Reset epoch header", async () => {
    let now = 1_700_000_000_000
    const resetAtSeconds = now / 1_000 + 30
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({}, 429, { "RateLimit-Reset": String(resetAtSeconds) }))
      .mockResolvedValue(response({ posts: [], hitsTotal: 1 }))
    const client = createBlueskyClient({ fetcher, now: () => now })

    await client.fetchSummaries(["https://example.com/limited"])
    now += 29_999
    await client.fetchSummaries(["https://example.com/still-blocked"])
    expect(fetcher).toHaveBeenCalledTimes(1)

    now += 2
    await client.fetchSummaries(["https://example.com/recovered"])
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it("retries transient 5xx responses at most three times", async () => {
    vi.useFakeTimers()
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const fetcher = vi.fn().mockResolvedValue(response({}, 503))
    const client = createBlueskyClient({ fetcher })

    const pending = client.fetchSummaries(["https://example.com/unavailable"])
    await vi.runAllTimersAsync()

    await expect(pending).resolves.toEqual({
      "https://example.com/unavailable": BLUESKY_SUMMARY_UNAVAILABLE
    })
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it("aborts slow requests and eventually marks them unavailable", async () => {
    vi.useFakeTimers()
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const fetcher = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"))
        })
      })
    })
    const client = createBlueskyClient({ fetcher })

    const pending = client.fetchSummaries(["https://example.com/slow"])
    await vi.advanceTimersByTimeAsync(BLUESKY_REQUEST_TIMEOUT_MS * 3 + 2_000)

    await expect(pending).resolves.toEqual({
      "https://example.com/slow": BLUESKY_SUMMARY_UNAVAILABLE
    })
    expect(fetcher).toHaveBeenCalledTimes(3)
  })
})
