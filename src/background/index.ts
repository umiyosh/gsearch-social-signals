import { fetchHatenaCounts, fetchHatenaEntry } from "../shared/hatena"
import { fetchHackerNewsSummaries, type HackerNewsSummary } from "../shared/hackerNews"
import {
  err,
  isHackerNewsRequest,
  isHatenaCountsRequest,
  isHatenaEntryRequest,
  ok,
  type HackerNewsResponse,
  type HatenaCountsResponse,
  type HatenaEntryResponse
} from "../shared/messages"

const hnCache = new Map<string, HackerNewsSummary | null>()

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (isHatenaCountsRequest(message)) {
    ;(async () => {
      const counts = await fetchHatenaCounts(message.urls)
      const response: HatenaCountsResponse = ok(counts)
      sendResponse(response)
    })().catch((error: unknown) => {
      console.error("Failed to fetch Hatena counts", error)
      const response: HatenaCountsResponse = err(error)
      sendResponse(response)
    })

    return true
  }

  if (isHatenaEntryRequest(message)) {
    ;(async () => {
      const bookmarks = await fetchHatenaEntry(message.url)
      const response: HatenaEntryResponse = ok(bookmarks)
      sendResponse(response)
    })().catch((error: unknown) => {
      console.error("Failed to fetch Hatena entry details", error)
      const response: HatenaEntryResponse = err(error)
      sendResponse(response)
    })

    return true
  }

  if (isHackerNewsRequest(message)) {
    ;(async () => {
      const summaries: Record<string, HackerNewsSummary | null> = {}
      const uncached = message.urls.filter((url) => !hnCache.has(url))
      if (uncached.length) {
        const fetched = await fetchHackerNewsSummaries(uncached)
        Object.entries(fetched).forEach(([url, summary]) => {
          hnCache.set(url, summary)
        })
      }

      message.urls.forEach((url) => {
        summaries[url] = hnCache.get(url) ?? null
      })

      const response: HackerNewsResponse = ok(summaries)
      sendResponse(response)
    })().catch((error: unknown) => {
      console.error("Failed to fetch Hacker News summaries", error)
      const response: HackerNewsResponse = err(error)
      sendResponse(response)
    })

    return true
  }

  return false
})

export {}
