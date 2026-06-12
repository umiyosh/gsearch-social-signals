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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

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

// API のキーはリクエスト URL と一致しないことがある（http/https、クエリ有無）。
// その揺れを吸収する候補キー生成と照合は純粋関数として公開し、直接テストする。
export function buildCandidateKeys(normalizedRequest: string): string[] {
  const flippedProtocol = normalizedRequest.startsWith("https://")
    ? normalizedRequest.replace("https://", "http://")
    : normalizedRequest.replace("http://", "https://")
  return [
    normalizedRequest,
    flippedProtocol,
    stripQueryString(normalizedRequest),
    stripQueryString(flippedProtocol)
  ]
}

export function normalizeCountKeys(chunkCounts: HatenaCountMap): Map<string, number> {
  const normalized = new Map<string, number>()
  Object.entries(chunkCounts).forEach(([key, value]) => {
    normalized.set(normalizeForComparison(key), value ?? 0)
  })
  return normalized
}

export function resolveRequestedCount(
  normalizedRequest: string,
  normalizedCounts: ReadonlyMap<string, number>
): number | null {
  const matched = buildCandidateKeys(normalizedRequest).find((candidate) =>
    normalizedCounts.has(candidate)
  )
  return matched !== undefined ? (normalizedCounts.get(matched) ?? 0) : null
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
  let parsed: unknown
  try {
    parsed = JSON.parse(payloadText)
  } catch (error) {
    console.error("Failed to parse Hatena API response", error)
    throw error
  }

  if (!isRecord(parsed)) {
    throw new Error("Hatena API returned an unexpected payload shape")
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
      const normalizedMap = normalizeCountKeys(await requestChunk(batch))

      uniqueUrls.forEach((requestedUrl) => {
        const normalizedRequest = normalizeForComparison(
          normalizedRequestMap.get(requestedUrl) ?? requestedUrl
        )
        counts[requestedUrl] = resolveRequestedCount(normalizedRequest, normalizedMap)
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

  const payload: unknown = await response.json()
  const bookmarks = isRecord(payload) && Array.isArray(payload.bookmarks) ? payload.bookmarks : []

  return bookmarks.flatMap((bookmark: unknown): HatenaBookmarkSummary[] => {
    if (!isRecord(bookmark) || typeof bookmark.comment !== "string") {
      return []
    }
    const comment = bookmark.comment.trim()
    if (!comment) {
      return []
    }
    return [
      {
        user: typeof bookmark.user === "string" ? bookmark.user : "anonymous",
        comment,
        ...(typeof bookmark.timestamp === "string" ? { timestamp: bookmark.timestamp } : {}),
        ...(typeof bookmark.permalink === "string" ? { permalink: bookmark.permalink } : {})
      }
    ]
  })
}
