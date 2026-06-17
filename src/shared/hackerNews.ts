import { normalizeForComparison, normalizeRequestUrl, stripQueryString } from "./url"

export interface HackerNewsSummary {
  nbHits: number
  maxPoints?: number
  maxComments?: number
  topStoryId?: string
  topStoryUrl?: string
}

const HN_ENDPOINT = "https://hn.algolia.com/api/v1/search"
const HITS_PER_PAGE = 50

interface HackerNewsSearchHit {
  objectID?: string
  points?: number
  num_comments?: number
  url?: string
}

interface HackerNewsSearchResponse {
  nbHits?: number
  hits?: HackerNewsSearchHit[]
}

function flipProtocol(normalizedUrl: string): string {
  return normalizedUrl.startsWith("https://")
    ? normalizedUrl.replace("https://", "http://")
    : normalizedUrl.replace("http://", "https://")
}

function buildCandidateKeys(normalizedRequest: string): Set<string> {
  const flippedProtocol = flipProtocol(normalizedRequest)
  return new Set([
    normalizedRequest,
    flippedProtocol,
    stripQueryString(normalizedRequest),
    stripQueryString(flippedProtocol)
  ])
}

function hitMatchesRequest(hit: HackerNewsSearchHit, normalizedRequest: string): boolean {
  if (typeof hit.url !== "string") {
    return false
  }
  return buildCandidateKeys(normalizedRequest).has(normalizeForComparison(hit.url))
}

function hasPositivePoints(hit: HackerNewsSearchHit): boolean {
  return typeof hit.points === "number" && hit.points > 0
}

function summarizeHits(hits: HackerNewsSearchHit[]): HackerNewsSummary {
  let maxPoints = 0
  let maxComments = 0
  let topStoryId: string | undefined

  hits.forEach((hit) => {
    const points = typeof hit.points === "number" ? hit.points : 0
    const comments = typeof hit.num_comments === "number" ? hit.num_comments : 0
    if (points >= maxPoints) {
      maxPoints = points
      topStoryId = hit.objectID
    }
    if (comments > maxComments) {
      maxComments = comments
    }
  })

  return {
    nbHits: hits.length,
    maxPoints,
    maxComments,
    ...(topStoryId !== undefined
      ? { topStoryId, topStoryUrl: `https://news.ycombinator.com/item?id=${topStoryId}` }
      : {})
  }
}

async function fetchHackerNewsSummary(url: string): Promise<HackerNewsSummary | null> {
  const normalizedRequest = normalizeRequestUrl(url)
  const endpoint = new URL(HN_ENDPOINT)
  endpoint.searchParams.set("query", normalizedRequest)
  endpoint.searchParams.set("tags", "story")
  endpoint.searchParams.set("hitsPerPage", String(HITS_PER_PAGE))

  const response = await fetch(endpoint.toString(), {
    method: "GET",
    cache: "no-cache"
  })

  if (!response.ok) {
    if (response.status === 400) {
      return null
    }
    throw new Error(`HN API responded with ${response.status}`)
  }

  const payload = (await response.json()) as HackerNewsSearchResponse
  if (!Array.isArray(payload.hits)) {
    return { nbHits: typeof payload.nbHits === "number" ? payload.nbHits : 0 }
  }
  const matchingHits = payload.hits.filter(
    (hit) => hitMatchesRequest(hit, normalizedRequest) && hasPositivePoints(hit)
  )
  return summarizeHits(matchingHits)
}

export async function fetchHackerNewsSummaries(
  urls: readonly string[]
): Promise<Record<string, HackerNewsSummary | null>> {
  const uniqueUrls = [...new Set(urls)]
  const summaries: Record<string, HackerNewsSummary | null> = {}

  await Promise.all(
    uniqueUrls.map(async (url) => {
      try {
        summaries[url] = await fetchHackerNewsSummary(url)
      } catch (error) {
        console.error("Failed to fetch Hacker News summary", error)
        summaries[url] = null
      }
    })
  )

  return summaries
}
