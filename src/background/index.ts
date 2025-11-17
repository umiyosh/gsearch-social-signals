import { fetchHatenaCounts } from "../shared/hatena"
import {
  MESSAGE_TYPES,
  isHatenaCountsRequest,
  type HatenaCountsResponse
} from "../shared/messages"

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isHatenaCountsRequest(message)) {
    return
  }

  ;(async () => {
    const counts = await fetchHatenaCounts(message.urls)
    const response: HatenaCountsResponse = {
      type: MESSAGE_TYPES.RESPONSE,
      counts
    }
    sendResponse(response)
  })().catch((error: unknown) => {
    console.error("Failed to fetch Hatena counts", error)
    const empty: HatenaCountsResponse = {
      type: MESSAGE_TYPES.RESPONSE,
      counts: Object.fromEntries(message.urls.map((url: string) => [url, null]))
    }
    sendResponse(empty)
  })

  return true
})

export {}
