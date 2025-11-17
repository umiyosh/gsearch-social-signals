export type HatenaCountMap = Record<string, number | null>

const API_ENDPOINT = "https://bookmark.hatenaapis.com/count/entries"
const MAX_BATCH_SIZE = 50

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
    Object.entries(parsed).map(([key, value]) => [key, typeof value === "number" ? value : Number(value) || 0])
  )
}

export async function fetchHatenaCounts(urls: readonly string[]): Promise<HatenaCountMap> {
  const uniqueUrls = [...new Set(urls)]
  const counts: HatenaCountMap = {}

  const batches = chunkArray(uniqueUrls, MAX_BATCH_SIZE)
  for (const batch of batches) {
    try {
      const chunkCounts = await requestChunk(batch)
      Object.assign(counts, chunkCounts)
    } catch (error) {
      console.error("Hatena API chunk failed", error)
      batch.forEach((url) => {
        counts[url] = null
      })
    }
  }

  return counts
}
