import { fetchHatenaCounts, fetchHatenaEntry } from "../shared/hatena"
import { fetchHackerNewsSummaries, type HackerNewsSummary } from "../shared/hackerNews"
import {
  MESSAGE_TYPES,
  isHatenaCountsRequest,
  isHatenaEntryRequest,
  isHackerNewsRequest,
  type HatenaCountsResponse,
  type HatenaEntryResponse,
  type HackerNewsResponse
} from "../shared/messages"

const hnCache = new Map<string, HackerNewsSummary | null>()

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (isHatenaCountsRequest(message)) {
    ;(async () => {
      const counts = await fetchHatenaCounts(message.urls)
      const response: HatenaCountsResponse = {
        type: MESSAGE_TYPES.COUNT_RESPONSE,
        counts
      }
      sendResponse(response)
    })().catch((error: unknown) => {
      console.error("Failed to fetch Hatena counts", error)
      const empty: HatenaCountsResponse = {
        type: MESSAGE_TYPES.COUNT_RESPONSE,
        counts: Object.fromEntries(message.urls.map((url: string) => [url, null]))
      }
      sendResponse(empty)
    })

    return true
  }

  if (isHatenaEntryRequest(message)) {
    ;(async () => {
      const bookmarks = await fetchHatenaEntry(message.url)
      const response: HatenaEntryResponse = {
        type: MESSAGE_TYPES.ENTRY_RESPONSE,
        url: message.url,
        bookmarks
      }
      sendResponse(response)
    })().catch((error: unknown) => {
      console.error("Failed to fetch Hatena entry details", error)
      const response: HatenaEntryResponse = {
        type: MESSAGE_TYPES.ENTRY_RESPONSE,
        url: message.url,
        bookmarks: []
      }
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

      const response: HackerNewsResponse = {
        type: MESSAGE_TYPES.HN_RESPONSE,
        summaries
      }
      sendResponse(response)
    })().catch((error: unknown) => {
      console.error("Failed to fetch Hacker News summaries", error)
      const empty: HackerNewsResponse = {
        type: MESSAGE_TYPES.HN_RESPONSE,
        summaries: Object.fromEntries(message.urls.map((url) => [url, null]))
      }
      sendResponse(empty)
    })

    return true
  }

  return false
})

export {}
