import {
  MESSAGE_TYPES,
  isBookmarkSummaryList,
  isCountMap,
  isExtensionResponse,
  isHnSummaryMap,
  type HackerNewsResponse,
  type HatenaCountsResponse,
  type HatenaEntryResponse
} from "../shared/messages"
import type { HatenaBookmarkSummary } from "../shared/hatena"
import type { HackerNewsSummary } from "../shared/hackerNews"

function runtimeAvailable(): boolean {
  return Boolean(chrome.runtime?.id)
}

export function requestHatenaCounts(
  urls: string[],
  apply: (url: string, count: number | null | undefined) => void,
  settle: (url: string) => void
): void {
  if (!urls.length) {
    return
  }

  if (!runtimeAvailable()) {
    console.debug("Hatena counts skipped: runtime unavailable")
    urls.forEach((url) => {
      settle(url)
      apply(url, null)
    })
    return
  }

  const request = { type: MESSAGE_TYPES.COUNT_REQUEST, urls }
  try {
    chrome.runtime.sendMessage(request, (response: HatenaCountsResponse | undefined) => {
      urls.forEach((url) => settle(url))

      if (chrome.runtime.lastError) {
        console.error("Failed to retrieve Hatena counts", chrome.runtime.lastError)
        urls.forEach((url) => apply(url, null))
        return
      }

      if (!isExtensionResponse(response, isCountMap)) {
        console.warn("Unexpected Hatena response", response)
        urls.forEach((url) => apply(url, null))
        return
      }

      if (!response.ok) {
        console.error("Hatena counts fetch failed", response.error)
        urls.forEach((url) => apply(url, null))
        return
      }

      Object.entries(response.data).forEach(([url, count]) => {
        apply(url, count)
      })

      urls.filter((url) => !(url in response.data)).forEach((url) => apply(url, null))
    })
  } catch (error) {
    urls.forEach((url) => settle(url))
    console.error("Unhandled error while requesting Hatena counts", error)
    urls.forEach((url) => apply(url, null))
  }
}

export function requestHnSummaries(
  urls: string[],
  apply: (url: string, summary: HackerNewsSummary | null | undefined) => void,
  settle: (url: string) => void
): void {
  if (!urls.length) {
    return
  }

  if (!runtimeAvailable()) {
    console.debug("HN summaries skipped: runtime unavailable")
    urls.forEach((url) => {
      settle(url)
      apply(url, null)
    })
    return
  }

  const request = { type: MESSAGE_TYPES.HN_REQUEST, urls }
  try {
    chrome.runtime.sendMessage(request, (response: HackerNewsResponse | undefined) => {
      urls.forEach((url) => settle(url))

      if (chrome.runtime.lastError) {
        console.error("Failed to retrieve HN summaries", chrome.runtime.lastError)
        urls.forEach((url) => apply(url, null))
        return
      }

      if (!isExtensionResponse(response, isHnSummaryMap)) {
        console.warn("Unexpected HN response", response)
        urls.forEach((url) => apply(url, null))
        return
      }

      if (!response.ok) {
        console.error("HN summaries fetch failed", response.error)
        urls.forEach((url) => apply(url, null))
        return
      }

      Object.entries(response.data).forEach(([url, summary]) => {
        apply(url, summary)
      })

      urls.filter((url) => !(url in response.data)).forEach((url) => apply(url, null))
    })
  } catch (error) {
    urls.forEach((url) => settle(url))
    console.error("Unhandled error while requesting HN summaries", error)
    urls.forEach((url) => apply(url, null))
  }
}

export function requestEntryBookmarks(url: string): Promise<HatenaBookmarkSummary[] | null> {
  if (!runtimeAvailable()) {
    return Promise.resolve(null)
  }

  return new Promise((resolve) => {
    const request = { type: MESSAGE_TYPES.ENTRY_REQUEST, url }
    chrome.runtime.sendMessage(request, (response: HatenaEntryResponse | undefined) => {
      if (chrome.runtime.lastError) {
        console.error("Failed to load Hatena entry", chrome.runtime.lastError)
        resolve(null)
        return
      }

      if (!isExtensionResponse(response, isBookmarkSummaryList)) {
        console.warn("Unexpected entry response", response)
        resolve(null)
        return
      }

      if (!response.ok) {
        // 旧実装は background 側の取得失敗を空リストとして返していた。
        // overlay の文言（空状態 vs エラー状態）を変えないため同じ写像を保つ。
        console.error("Hatena entry fetch failed", response.error)
        resolve([])
        return
      }

      resolve(response.data)
    })
  })
}
