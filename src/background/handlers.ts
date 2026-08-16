import type { HatenaBookmarkSummary, HatenaCountMap } from "../shared/hatena"
import { HACKER_NEWS_SUMMARY_UNAVAILABLE, type HackerNewsSummaryResult } from "../shared/hackerNews"
import {
  BLUESKY_REQUEST_BATCH_SIZE,
  BLUESKY_SUMMARY_UNAVAILABLE,
  type BlueskySummary,
  type BlueskySummaryMap
} from "../shared/bluesky"
import type { HatenaEntryFetchTiming } from "../shared/diagnostics"
import { normalizeRequestUrl } from "../shared/url"
import {
  MESSAGE_TYPES,
  err,
  isExtensionRequest,
  ok,
  type HackerNewsResponse,
  type BlueskyResponse,
  type HatenaCountsResponse,
  type HatenaEntryRequest,
  type HatenaEntryResponse,
  type HnSummaryMap
} from "../shared/messages"

export interface BackgroundDeps {
  fetchHatenaCounts: (urls: readonly string[]) => Promise<HatenaCountMap>
  fetchHatenaEntry: (
    url: string,
    reportTiming?: (timing: HatenaEntryFetchTiming) => void
  ) => Promise<HatenaBookmarkSummary[]>
  fetchHackerNewsSummaries: (urls: readonly string[]) => Promise<HnSummaryMap>
  hnCache: Map<string, HackerNewsSummaryResult>
  fetchBlueskySummaries: (urls: readonly string[]) => Promise<BlueskySummaryMap>
  blueskyCache: Map<string, BlueskySummary>
}

// content script からの入力はページ DOM 由来で攻撃者の影響を受けうる。
// fetch に渡す前に http(s) の実 URL のみへ絞り、異常な量は処理しない。
export const MAX_URLS_PER_REQUEST = 500
export const MAX_HN_URLS_PER_REQUEST = 40
export const MAX_HN_CACHE_ENTRIES = 200
export const MAX_BLUESKY_URLS_PER_REQUEST = BLUESKY_REQUEST_BATCH_SIZE
export const MAX_BLUESKY_CACHE_ENTRIES = 200

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

function sanitizeUrls(urls: string[], maxUrls: number): string[] | null {
  if (urls.length > maxUrls) {
    return null
  }
  return urls.filter(isHttpUrl)
}

function trimOldestEntries<T>(cache: Map<string, T>, maxEntries: number): void {
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value
    if (oldestKey === undefined) {
      return
    }
    cache.delete(oldestKey)
  }
}

async function handleCounts(deps: BackgroundDeps, urls: string[]): Promise<HatenaCountsResponse> {
  const sanitized = sanitizeUrls(urls, MAX_URLS_PER_REQUEST)
  if (sanitized === null) {
    return err(`counts request rejected: more than ${MAX_URLS_PER_REQUEST} urls`)
  }

  try {
    return ok(await deps.fetchHatenaCounts(sanitized))
  } catch (error: unknown) {
    console.error("Failed to fetch Hatena counts", error)
    return err(error)
  }
}

async function handleEntry(
  deps: BackgroundDeps,
  request: HatenaEntryRequest
): Promise<HatenaEntryResponse> {
  const { url, diagnostics } = request
  if (!isHttpUrl(url)) {
    return ok([])
  }

  try {
    if (!diagnostics) {
      return ok(await deps.fetchHatenaEntry(url))
    }

    const backgroundStartedAt = performance.now()
    const backgroundReceivedDelayMs = Math.max(0, Date.now() - diagnostics.sentAtEpochMs)
    let fetchTiming: HatenaEntryFetchTiming | undefined
    const data = await deps.fetchHatenaEntry(url, (timing) => {
      fetchTiming = timing
    })
    if (!fetchTiming) {
      return ok(data)
    }
    return {
      ok: true,
      data,
      diagnostics: {
        requestId: diagnostics.requestId,
        backgroundReceivedDelayMs,
        backgroundTotalMs: performance.now() - backgroundStartedAt,
        fetch: fetchTiming
      }
    }
  } catch (error: unknown) {
    console.error("Failed to fetch Hatena entry details", error)
    return err(error)
  }
}

async function handleHackerNews(deps: BackgroundDeps, urls: string[]): Promise<HackerNewsResponse> {
  const sanitized = sanitizeUrls(urls, MAX_HN_URLS_PER_REQUEST)
  if (sanitized === null) {
    return err(`hn request rejected: more than ${MAX_HN_URLS_PER_REQUEST} urls`)
  }

  try {
    const uncached = sanitized.filter((url) => !deps.hnCache.has(url))
    let fetched: HnSummaryMap = {}
    if (uncached.length) {
      fetched = await deps.fetchHackerNewsSummaries(uncached)
      Object.entries(fetched).forEach(([url, summary]) => {
        if (summary !== HACKER_NEWS_SUMMARY_UNAVAILABLE) {
          deps.hnCache.set(url, summary)
        }
      })
      trimOldestEntries(deps.hnCache, MAX_HN_CACHE_ENTRIES)
    }

    const summaries: HnSummaryMap = {}
    urls.forEach((url) => {
      summaries[url] = deps.hnCache.has(url)
        ? (deps.hnCache.get(url) ?? null)
        : (fetched[url] ?? null)
    })
    return ok(summaries)
  } catch (error: unknown) {
    console.error("Failed to fetch Hacker News summaries", error)
    return err(error)
  }
}

async function handleBluesky(deps: BackgroundDeps, urls: string[]): Promise<BlueskyResponse> {
  const sanitized = sanitizeUrls(urls, MAX_BLUESKY_URLS_PER_REQUEST)
  if (sanitized === null) {
    return err(`bluesky request rejected: more than ${MAX_BLUESKY_URLS_PER_REQUEST} urls`)
  }

  try {
    const normalizedByUrl = new Map(sanitized.map((url) => [url, normalizeRequestUrl(url)]))
    const uncached = [...new Set(normalizedByUrl.values())].filter(
      (url) => !deps.blueskyCache.has(url)
    )
    let fetched: BlueskySummaryMap = {}
    if (uncached.length) {
      fetched = await deps.fetchBlueskySummaries(uncached)
      Object.entries(fetched).forEach(([url, summary]) => {
        if (summary !== BLUESKY_SUMMARY_UNAVAILABLE) {
          deps.blueskyCache.set(url, summary)
        }
      })
      trimOldestEntries(deps.blueskyCache, MAX_BLUESKY_CACHE_ENTRIES)
    }

    const summaries: BlueskySummaryMap = {}
    urls.forEach((url) => {
      const normalized = normalizedByUrl.get(url)
      summaries[url] = normalized
        ? (deps.blueskyCache.get(normalized) ?? fetched[normalized] ?? BLUESKY_SUMMARY_UNAVAILABLE)
        : BLUESKY_SUMMARY_UNAVAILABLE
    })
    return ok(summaries)
  } catch (error: unknown) {
    console.error("Failed to fetch Bluesky summaries", error)
    return err(error)
  }
}

export function createMessageHandler(deps: BackgroundDeps) {
  return (message: unknown): Promise<unknown> | null => {
    if (!isExtensionRequest(message)) {
      return null
    }

    switch (message.type) {
      case MESSAGE_TYPES.COUNT_REQUEST:
        return handleCounts(deps, message.urls)
      case MESSAGE_TYPES.ENTRY_REQUEST:
        return handleEntry(deps, message)
      case MESSAGE_TYPES.HN_REQUEST:
        return handleHackerNews(deps, message.urls)
      case MESSAGE_TYPES.BLUESKY_REQUEST:
        return handleBluesky(deps, message.urls)
      default: {
        const exhaustive: never = message
        return exhaustive
      }
    }
  }
}
