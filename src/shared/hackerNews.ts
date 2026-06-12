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

async function fetchHackerNewsSummary(url: string): Promise<HackerNewsSummary | null> {
  const endpoint = new URL(HN_ENDPOINT)
  endpoint.searchParams.set("query", url)
  endpoint.searchParams.set("tags", "story")
  endpoint.searchParams.set("restrictSearchableAttributes", "url")
  endpoint.searchParams.set("numericFilters", "points>0")
  endpoint.searchParams.set("hitsPerPage", String(HITS_PER_PAGE))

  const response = await fetch(endpoint.toString(), {
    method: "GET",
    cache: "no-cache"
  })

  if (!response.ok) {
    throw new Error(`HN API responded with ${response.status}`)
  }

  const payload = (await response.json()) as HackerNewsSearchResponse
  const nbHits = typeof payload.nbHits === "number" ? payload.nbHits : 0
  if (!Array.isArray(payload.hits)) {
    return { nbHits }
  }

  let maxPoints = 0
  let maxComments = 0
  let topStoryId: string | undefined

  payload.hits.forEach((hit) => {
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
    nbHits,
    maxPoints,
    maxComments,
    ...(topStoryId !== undefined
      ? { topStoryId, topStoryUrl: `https://news.ycombinator.com/item?id=${topStoryId}` }
      : {})
  }
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
