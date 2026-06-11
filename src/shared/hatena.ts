import { normalizeRequestUrl, normalizeUrl, normalizeForComparison, stripQueryString } from "./url"

export type HatenaCountMap = Record<string, number | null>

export interface HatenaBookmarkSummary {
  user: string
  comment: string
  timestamp?: string
  permalink?: string
}

const API_ENDPOINT = "https://bookmark.hatenaapis.com/count/entries"
const MAX_BATCH_SIZE = 50
const ENTRY_ENDPOINT = "https://b.hatena.ne.jp/entry/jsonlite/"

export function chunkArray<T>(values: readonly T[], size: number): T[][] {
  if (size <= 0) {
    throw new Error("chunk size must be positive")
  }

  const chunks: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
  return chunks
}

async function requestChunk(urls: readonly string[]): Promise<HatenaCountMap> {
  if (urls.length === 0) {
    return {}
  }

  const endpoint = new URL(API_ENDPOINT)
  urls.forEach((url) => endpoint.searchParams.append("url", url))

  const response = await fetch(endpoint.toString(), {
    method: "GET",
    cache: "no-cache"
  })

  if (!response.ok) {
    throw new Error(`Hatena API responded with ${response.status}`)
  }

  const payloadText = await response.text()
  let parsed: Record<string, number | string>
  try {
    parsed = JSON.parse(payloadText) as Record<string, number | string>
  } catch (error) {
    console.error("Failed to parse Hatena API response", error)
    throw error
  }

  return Object.fromEntries(
    Object.entries(parsed).map(([key, value]) => [
      key,
      typeof value === "number" ? value : Number(value) || 0
    ])
  )
}

export async function fetchHatenaCounts(urls: readonly string[]): Promise<HatenaCountMap> {
  const uniqueUrls = [...new Set(urls)]
  const normalizedRequestMap = new Map<string, string>()
  uniqueUrls.forEach((originalUrl) => {
    normalizedRequestMap.set(originalUrl, normalizeRequestUrl(originalUrl))
  })
  const counts: HatenaCountMap = {}

  const normalizedUrls = uniqueUrls.map((url) => normalizedRequestMap.get(url) ?? url)
  const batches = chunkArray(normalizedUrls, MAX_BATCH_SIZE)
  for (const batch of batches) {
    try {
      const chunkCounts = await requestChunk(batch)
      const normalizedMap = new Map<string, number>()
      Object.entries(chunkCounts).forEach(([key, value]) => {
        normalizedMap.set(normalizeForComparison(key), value ?? 0)
      })

      uniqueUrls.forEach((requestedUrl) => {
        const normalizedRequest = normalizeForComparison(
          normalizedRequestMap.get(requestedUrl) ?? requestedUrl
        )

        const candidates: string[] = [normalizedRequest]
        const flippedProtocol = normalizedRequest.startsWith("https://")
          ? normalizedRequest.replace("https://", "http://")
          : normalizedRequest.replace("http://", "https://")
        candidates.push(flippedProtocol)
        candidates.push(stripQueryString(normalizedRequest))
        candidates.push(stripQueryString(flippedProtocol))

        const matchedCandidate = candidates.find((candidate) => normalizedMap.has(candidate))

        if (matchedCandidate) {
          counts[requestedUrl] = normalizedMap.get(matchedCandidate) ?? 0
        } else {
          counts[requestedUrl] = null
        }
      })
    } catch (error) {
      console.error("Hatena API chunk failed", error)
      batch.forEach((url) => {
        counts[url] = null
      })
    }
  }

  return counts
}

export async function fetchHatenaEntry(url: string): Promise<HatenaBookmarkSummary[]> {
  const normalized = normalizeUrl(url)
  if (!normalized) {
    return []
  }

  const endpoint = new URL(ENTRY_ENDPOINT)
  endpoint.searchParams.set("url", normalized)

  const response = await fetch(endpoint.toString(), {
    method: "GET",
    cache: "no-cache"
  })

  if (!response.ok) {
    throw new Error(`Hatena entry API failed with status ${response.status}`)
  }

  const payload = (await response.json()) as {
    bookmarks?: Array<{
      user?: string
      comment?: string
      timestamp?: string
      permalink?: string
    }>
  }

  const bookmarks = payload.bookmarks ?? []
  return bookmarks
    .filter(
      (bookmark) => typeof bookmark?.comment === "string" && bookmark.comment.trim().length > 0
    )
    .map((bookmark) => ({
      user: bookmark.user ?? "anonymous",
      comment: bookmark.comment?.trim() ?? "",
      timestamp: bookmark.timestamp,
      permalink: bookmark.permalink
    }))
}
