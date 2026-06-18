import type { HatenaBookmarkSummary, HatenaCountMap } from "../shared/hatena"
import type { HackerNewsSummary } from "../shared/hackerNews"
import {
  MESSAGE_TYPES,
  err,
  isExtensionRequest,
  ok,
  type HackerNewsResponse,
  type HatenaCountsResponse,
  type HatenaEntryResponse,
  type HnSummaryMap
} from "../shared/messages"

export interface BackgroundDeps {
  fetchHatenaCounts: (urls: readonly string[]) => Promise<HatenaCountMap>
  fetchHatenaEntry: (url: string) => Promise<HatenaBookmarkSummary[]>
  fetchHackerNewsSummaries: (urls: readonly string[]) => Promise<HnSummaryMap>
  hnCache: Map<string, HackerNewsSummary | null>
}

// content script からの入力はページ DOM 由来で攻撃者の影響を受けうる。
// fetch に渡す前に http(s) の実 URL のみへ絞り、異常な量は処理しない。
export const MAX_URLS_PER_REQUEST = 500
export const MAX_HN_URLS_PER_REQUEST = 40
export const MAX_HN_CACHE_ENTRIES = 200

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

async function handleEntry(deps: BackgroundDeps, url: string): Promise<HatenaEntryResponse> {
  if (!isHttpUrl(url)) {
    return ok([])
  }

  try {
    return ok(await deps.fetchHatenaEntry(url))
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
    if (uncached.length) {
      const fetched = await deps.fetchHackerNewsSummaries(uncached)
      Object.entries(fetched).forEach(([url, summary]) => {
        deps.hnCache.set(url, summary)
      })
      trimOldestEntries(deps.hnCache, MAX_HN_CACHE_ENTRIES)
    }

    const summaries: HnSummaryMap = {}
    urls.forEach((url) => {
      summaries[url] = deps.hnCache.get(url) ?? null
    })
    return ok(summaries)
  } catch (error: unknown) {
    console.error("Failed to fetch Hacker News summaries", error)
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
        return handleEntry(deps, message.url)
      case MESSAGE_TYPES.HN_REQUEST:
        return handleHackerNews(deps, message.urls)
      default: {
        const exhaustive: never = message
        return exhaustive
      }
    }
  }
}
