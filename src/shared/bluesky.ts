import { createRequestQueue, HttpResponseError, retryTransientRequest } from "./request-queue"
import { normalizeRequestUrl } from "./url"

export interface BlueskySummary {
  hitsTotal: number
}

export const BLUESKY_SUMMARY_UNAVAILABLE = "unavailable" as const
export type BlueskySummaryResult = BlueskySummary | typeof BLUESKY_SUMMARY_UNAVAILABLE
export type BlueskySummaryMap = Record<string, BlueskySummaryResult>

export interface BlueskyFetchResult {
  summaries: BlueskySummaryMap
  retryAfterMs?: number
}

export const BLUESKY_REQUEST_TIMEOUT_MS = 5_000
export const BLUESKY_RATE_LIMIT_FALLBACK_MS = 60_000
export const BLUESKY_REQUEST_BATCH_SIZE = 40

const BLUESKY_ENDPOINT = "https://api.bsky.app/xrpc/app.bsky.feed.searchPosts"
const MAX_CONCURRENT_REQUESTS = 3

interface BlueskySearchResponse {
  posts?: unknown
  hitsTotal?: unknown
}

interface BlueskyClientOptions {
  fetcher?: typeof fetch
  now?: () => number
}

export interface BlueskyClient {
  fetchSummaries: (urls: readonly string[]) => Promise<BlueskySummaryMap>
  fetchSummariesWithRetryInfo: (urls: readonly string[]) => Promise<BlueskyFetchResult>
}

class BlueskyRateLimitError extends Error {
  constructor() {
    super("Bluesky API rate limit reached")
    this.name = "BlueskyRateLimitError"
  }
}

class BlueskyCircuitOpenError extends Error {
  constructor() {
    super("Bluesky API circuit is open")
    this.name = "BlueskyCircuitOpenError"
  }
}

function parseResetDelayMs(headers: Headers, now: number): number {
  const retryAfter = headers.get("retry-after")
  if (retryAfter) {
    const seconds = Number(retryAfter)
    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1_000
    }

    const retryAt = Date.parse(retryAfter)
    if (Number.isFinite(retryAt)) {
      return Math.max(0, retryAt - now)
    }
  }

  const reset = headers.get("ratelimit-reset") ?? headers.get("x-ratelimit-reset")
  if (reset) {
    const resetEpochSeconds = Number(reset)
    if (Number.isFinite(resetEpochSeconds) && resetEpochSeconds >= 0) {
      return Math.max(0, resetEpochSeconds * 1_000 - now)
    }
  }

  return BLUESKY_RATE_LIMIT_FALLBACK_MS
}

function parseSummary(payload: BlueskySearchResponse): BlueskySummary {
  if (!Array.isArray(payload.posts)) {
    throw new TypeError("Bluesky API returned an invalid search response")
  }

  if (payload.hitsTotal === undefined) {
    throw new TypeError("Bluesky API omitted hitsTotal from the search response")
  }

  if (!Number.isInteger(payload.hitsTotal) || (payload.hitsTotal as number) < 0) {
    throw new TypeError("Bluesky API returned an invalid search response")
  }

  return { hitsTotal: payload.hitsTotal as number }
}

export function createBlueskyClient(options: BlueskyClientOptions = {}): BlueskyClient {
  const fetcher = options.fetcher ?? ((input, init) => fetch(input, init))
  const now = options.now ?? Date.now
  const enqueue = createRequestQueue(MAX_CONCURRENT_REQUESTS)
  let blockedUntil = 0

  async function fetchSummary(normalizedUrl: string): Promise<BlueskySummary> {
    if (now() < blockedUntil) {
      throw new BlueskyCircuitOpenError()
    }

    const endpoint = new URL(BLUESKY_ENDPOINT)
    endpoint.searchParams.set("q", normalizedUrl)
    endpoint.searchParams.set("url", normalizedUrl)
    endpoint.searchParams.set("limit", "1")
    endpoint.searchParams.set("sort", "top")

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), BLUESKY_REQUEST_TIMEOUT_MS)
    let response: Response
    try {
      response = await fetcher(endpoint.toString(), {
        method: "GET",
        cache: "no-cache",
        signal: controller.signal
      })
    } finally {
      clearTimeout(timeoutId)
    }

    if (response.status === 429) {
      blockedUntil = Math.max(blockedUntil, now() + parseResetDelayMs(response.headers, now()))
      throw new BlueskyRateLimitError()
    }
    if (!response.ok) {
      throw new HttpResponseError("Bluesky", response.status)
    }

    return parseSummary((await response.json()) as BlueskySearchResponse)
  }

  async function fetchSummariesWithRetryInfo(
    urls: readonly string[]
  ): Promise<BlueskyFetchResult> {
    const normalizedToOriginals = new Map<string, string[]>()
    urls.forEach((url) => {
      const normalized = normalizeRequestUrl(url)
      const originals = normalizedToOriginals.get(normalized) ?? []
      originals.push(url)
      normalizedToOriginals.set(normalized, originals)
    })

    const summaries: BlueskySummaryMap = {}
    let failedRequests = 0
    let firstError: unknown = null
    let retryAfterMs: number | undefined

    await Promise.all(
      [...normalizedToOriginals.entries()].map(async ([normalized, originals]) => {
        let result: BlueskySummaryResult
        try {
          result = await enqueue(() => retryTransientRequest(() => fetchSummary(normalized)))
        } catch (error) {
          failedRequests += 1
          firstError ??= error
          if (error instanceof BlueskyRateLimitError || error instanceof BlueskyCircuitOpenError) {
            retryAfterMs = Math.max(retryAfterMs ?? 0, Math.max(0, blockedUntil - now()))
          }
          result = BLUESKY_SUMMARY_UNAVAILABLE
        }
        originals.forEach((url) => {
          summaries[url] = result
        })
      })
    )

    if (failedRequests > 0) {
      console.error("Failed to fetch Bluesky summaries", {
        failedRequests,
        requestedUrls: urls.length,
        error: firstError
      })
    }

    return retryAfterMs === undefined ? { summaries } : { summaries, retryAfterMs }
  }

  async function fetchSummaries(urls: readonly string[]): Promise<BlueskySummaryMap> {
    return (await fetchSummariesWithRetryInfo(urls)).summaries
  }

  return { fetchSummaries, fetchSummariesWithRetryInfo }
}

export const fetchBlueskySummaries = createBlueskyClient().fetchSummariesWithRetryInfo
