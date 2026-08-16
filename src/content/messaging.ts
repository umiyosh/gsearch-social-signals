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
import { HATENA_COUNT_UNAVAILABLE } from "../shared/hatena"
import {
  HACKER_NEWS_SUMMARY_UNAVAILABLE,
  HN_REQUEST_BATCH_SIZE,
  type HackerNewsSummary
} from "../shared/hackerNews"
import {
  BUILD_COMMIT_SHA,
  DIAGNOSTICS_ENABLED,
  sanitizeDiagnosticTarget
} from "../shared/diagnostics"

export interface EntryRequestOptions {
  diagnostics?: boolean
}

type RuntimeMessageQueue = (task: (release: () => void) => void) => void

interface RuntimeMessageResult<T> {
  response?: T | undefined
  runtimeError?: { message: string | undefined } | undefined
  thrownError?: unknown
}

const RUNTIME_MESSAGE_MAX_ATTEMPTS = 3
const RUNTIME_MESSAGE_RETRY_BASE_DELAY_MS = 250
const enqueueHatenaRuntimeMessage = createRuntimeMessageQueue(2)
const enqueueHnRuntimeMessage = createRuntimeMessageQueue(4)

function createRuntimeMessageQueue(maxConcurrent: number): RuntimeMessageQueue {
  const pending: Array<(release: () => void) => void> = []
  let active = 0

  const drain = (): void => {
    while (active < maxConcurrent) {
      const next = pending.shift()
      if (!next) {
        return
      }

      active += 1
      let released = false
      next(() => {
        if (released) {
          return
        }
        released = true
        active -= 1
        drain()
      })
    }
  }

  return (task): void => {
    pending.push(task)
    drain()
  }
}

function sendQueuedRuntimeMessage<T>(
  enqueue: RuntimeMessageQueue,
  request: unknown,
  shouldRetryResponse: (response: T | undefined) => boolean,
  complete: (result: RuntimeMessageResult<T>) => void
): void {
  let attempt = 1

  const runAttempt = (): void => {
    enqueue((release) => {
      let completed = false
      const completeAttempt = (result: RuntimeMessageResult<T>): void => {
        if (completed) {
          return
        }
        completed = true
        release()

        const retryable =
          result.runtimeError !== undefined ||
          result.thrownError !== undefined ||
          shouldRetryResponse(result.response)
        if (retryable && attempt < RUNTIME_MESSAGE_MAX_ATTEMPTS) {
          const delayMs = RUNTIME_MESSAGE_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1)
          attempt += 1
          setTimeout(runAttempt, delayMs)
          return
        }

        complete(result)
      }

      try {
        chrome.runtime.sendMessage(request, (response: T | undefined) => {
          const lastError = chrome.runtime.lastError
          completeAttempt({
            response,
            ...(lastError ? { runtimeError: { message: lastError.message } } : {})
          })
        })
      } catch (error) {
        completeAttempt({ thrownError: error })
      }
    })
  }

  runAttempt()
}

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
      apply(url, undefined)
    })
    return
  }

  const request = { type: MESSAGE_TYPES.COUNT_REQUEST, urls }
  sendQueuedRuntimeMessage<HatenaCountsResponse>(
    enqueueHatenaRuntimeMessage,
    request,
    (response) => !isExtensionResponse(response, isCountMap) || !response.ok,
    ({ response, runtimeError, thrownError }) => {
      urls.forEach((url) => settle(url))

      if (runtimeError) {
        console.error("Failed to retrieve Hatena counts", runtimeError)
        urls.forEach((url) => apply(url, undefined))
        return
      }

      if (thrownError !== undefined) {
        console.error("Unhandled error while requesting Hatena counts", thrownError)
        urls.forEach((url) => apply(url, undefined))
        return
      }

      if (!isExtensionResponse(response, isCountMap)) {
        console.warn("Unexpected Hatena response", response)
        urls.forEach((url) => apply(url, undefined))
        return
      }

      if (!response.ok) {
        console.error("Hatena counts fetch failed", response.error)
        urls.forEach((url) => apply(url, undefined))
        return
      }

      Object.entries(response.data).forEach(([url, count]) => {
        apply(url, count === HATENA_COUNT_UNAVAILABLE ? undefined : count)
      })

      urls.filter((url) => !(url in response.data)).forEach((url) => apply(url, null))
    }
  )
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
      apply(url, undefined)
    })
    return
  }

  for (let index = 0; index < urls.length; index += HN_REQUEST_BATCH_SIZE) {
    requestHnSummaryBatch(urls.slice(index, index + HN_REQUEST_BATCH_SIZE), apply, settle)
  }
}

function requestHnSummaryBatch(
  urls: string[],
  apply: (url: string, summary: HackerNewsSummary | null | undefined) => void,
  settle: (url: string) => void
): void {
  const request = { type: MESSAGE_TYPES.HN_REQUEST, urls }
  sendQueuedRuntimeMessage<HackerNewsResponse>(
    enqueueHnRuntimeMessage,
    request,
    (response) => !isExtensionResponse(response, isHnSummaryMap) || !response.ok,
    ({ response, runtimeError, thrownError }) => {
      urls.forEach((url) => settle(url))

      if (runtimeError) {
        console.error("Failed to retrieve HN summaries", runtimeError)
        urls.forEach((url) => apply(url, undefined))
        return
      }

      if (thrownError !== undefined) {
        console.error("Unhandled error while requesting HN summaries", thrownError)
        urls.forEach((url) => apply(url, undefined))
        return
      }

      if (!isExtensionResponse(response, isHnSummaryMap)) {
        console.warn("Unexpected HN response", response)
        urls.forEach((url) => apply(url, undefined))
        return
      }

      if (!response.ok) {
        console.error("HN summaries fetch failed", response.error)
        urls.forEach((url) => apply(url, undefined))
        return
      }

      Object.entries(response.data).forEach(([url, summary]) => {
        apply(url, summary === HACKER_NEWS_SUMMARY_UNAVAILABLE ? undefined : summary)
      })

      urls.filter((url) => !(url in response.data)).forEach((url) => apply(url, null))
    }
  )
}

export function requestEntryBookmarks(
  url: string,
  options: EntryRequestOptions = {}
): Promise<HatenaBookmarkSummary[] | null> {
  if (!runtimeAvailable()) {
    return Promise.resolve(null)
  }

  return new Promise((resolve) => {
    const diagnosticsEnabled = options.diagnostics ?? DIAGNOSTICS_ENABLED
    const requestStartedAt = diagnosticsEnabled ? performance.now() : 0
    const diagnostics = diagnosticsEnabled
      ? { requestId: crypto.randomUUID(), sentAtEpochMs: Date.now() }
      : undefined
    const request = diagnostics
      ? { type: MESSAGE_TYPES.ENTRY_REQUEST, url, diagnostics }
      : { type: MESSAGE_TYPES.ENTRY_REQUEST, url }
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

      if (diagnostics && response.diagnostics) {
        const roundTripMs = performance.now() - requestStartedAt
        console.info("[GSPLUS_DIAGNOSTICS]", {
          event: "hatena-entry",
          requestId: diagnostics.requestId,
          extensionVersion: chrome.runtime.getManifest().version,
          buildCommit: BUILD_COMMIT_SHA,
          target: sanitizeDiagnosticTarget(url),
          roundTripMs,
          runtimeDeliveryMs: Math.max(
            0,
            roundTripMs -
              response.diagnostics.backgroundReceivedDelayMs -
              response.diagnostics.backgroundTotalMs
          ),
          background: response.diagnostics
        })
      }

      resolve(response.data)
    })
  })
}
