import { fetchHatenaCounts, fetchHatenaEntry } from "../shared/hatena"
import {
  MESSAGE_TYPES,
  isHatenaCountsRequest,
  isHatenaEntryRequest,
  type HatenaCountsResponse,
  type HatenaEntryResponse
} from "../shared/messages"

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

  return false
})

export {}
