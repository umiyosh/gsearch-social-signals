import { afterEach, describe, expect, it, vi } from "vitest"
import {
  buildBlueskySummaryDiagnostics,
  requestBlueskySummaries,
  requestEntryBookmarks,
  requestHatenaCounts,
  requestHnSummaries
} from "../../src/content/messaging"
import { MESSAGE_TYPES, err, isHatenaEntryRequest, ok } from "../../src/shared/messages"
import { HATENA_COUNT_UNAVAILABLE } from "../../src/shared/hatena"
import { HACKER_NEWS_SUMMARY_UNAVAILABLE } from "../../src/shared/hackerNews"
import { BLUESKY_SUMMARY_UNAVAILABLE } from "../../src/shared/bluesky"

type ChromeStub = {
  runtime?: {
    id?: string | undefined
    lastError?: { message: string } | undefined
    getManifest?: () => { version: string }
    sendMessage: (message: unknown, callback: (response: unknown) => void) => void
  }
}

function stubChrome(options: {
  id?: string | undefined
  lastError?: { message: string } | undefined
  respond?: unknown
  respondWith?: ((message: unknown) => unknown) | undefined
  throwOnSend?: boolean | undefined
  onSend?: ((message: unknown) => void) | undefined
  sendMessage?: ((message: unknown, callback: (response: unknown) => void) => void) | undefined
}): void {
  const stub: ChromeStub = {
    runtime: {
      id: options.id,
      lastError: options.lastError,
      getManifest: () => ({ version: "0.1.3" }),
      sendMessage:
        options.sendMessage ??
        ((message, callback) => {
          if (options.throwOnSend) {
            throw new Error("send failed")
          }
          options.onSend?.(message)
          callback(options.respondWith ? options.respondWith(message) : options.respond)
        })
    }
  }
  vi.stubGlobal("chrome", stub)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("requestHatenaCounts", () => {
  it("applies counts, fills missing urls with null, and settles every url", () => {
    stubChrome({ id: "ext", respond: ok({ "https://a": 2, "https://b": null }) })
    const applied: Array<[string, number | null | undefined]> = []
    const settled: string[] = []

    requestHatenaCounts(
      ["https://a", "https://b", "https://c"],
      (url, count) => applied.push([url, count]),
      (url) => settled.push(url)
    )

    expect(applied).toEqual([
      ["https://a", 2],
      ["https://b", null],
      ["https://c", null]
    ])
    expect(settled).toEqual(["https://a", "https://b", "https://c"])
  })

  it("does nothing for an empty url list", () => {
    const apply = vi.fn()
    requestHatenaCounts([], apply, vi.fn())
    expect(apply).not.toHaveBeenCalled()
  })

  it("maps unavailable Hatena results to an unknown signal after retries", async () => {
    vi.useFakeTimers()
    const sendMessage = vi.fn((_message: unknown, callback: (response: unknown) => void) => {
      callback(ok({ "https://a": HATENA_COUNT_UNAVAILABLE }))
    })
    stubChrome({ id: "ext", sendMessage })
    const apply = vi.fn()

    requestHatenaCounts(["https://a"], apply, vi.fn())
    await vi.runAllTimersAsync()

    expect(sendMessage).toHaveBeenCalledTimes(3)
    expect(apply).toHaveBeenCalledWith("https://a", undefined)
  })

  it("retries an unavailable Hatena response before applying a stable count", async () => {
    vi.useFakeTimers()
    const responses = [ok({ "https://a": HATENA_COUNT_UNAVAILABLE }), ok({ "https://a": 0 })]
    const sendMessage = vi.fn((_message: unknown, callback: (response: unknown) => void) => {
      callback(responses.shift())
    })
    stubChrome({ id: "ext", sendMessage })
    const apply = vi.fn()
    const settle = vi.fn()

    requestHatenaCounts(["https://a"], apply, settle)
    await vi.runAllTimersAsync()

    expect(sendMessage).toHaveBeenCalledTimes(2)
    expect(apply).toHaveBeenCalledOnce()
    expect(apply).toHaveBeenCalledWith("https://a", 0)
    expect(settle).toHaveBeenCalledOnce()
  })

  it("limits simultaneous Hatena runtime messages to two and preserves FIFO", () => {
    const callbacks: Array<(response: unknown) => void> = []
    const startedUrls: string[] = []
    const sendMessage = vi.fn((message: unknown, callback: (response: unknown) => void) => {
      startedUrls.push((message as { urls: string[] }).urls[0] ?? "")
      callbacks.push(callback)
    })
    stubChrome({ id: "ext", sendMessage })
    const urls = Array.from({ length: 4 }, (_, index) => `https://example.com/${index + 1}`)

    urls.forEach((url) => requestHatenaCounts([url], vi.fn(), vi.fn()))

    expect(startedUrls).toEqual(urls.slice(0, 2))
    callbacks.shift()?.(ok({ [urls[0]!]: 0 }))
    expect(startedUrls).toEqual(urls.slice(0, 3))
    callbacks.shift()?.(ok({ [urls[1]!]: 0 }))
    expect(startedUrls).toEqual(urls)
    callbacks.splice(0).forEach((callback, index) => {
      callback(ok({ [urls[index + 2]!]: 0 }))
    })
  })

  it("applies undefined when the runtime is unavailable", () => {
    stubChrome({ id: undefined })
    const applied: Array<[string, number | null | undefined]> = []
    const settled: string[] = []

    requestHatenaCounts(
      ["https://a"],
      (url, count) => applied.push([url, count]),
      (url) => settled.push(url)
    )

    expect(applied).toEqual([["https://a", undefined]])
    expect(settled).toEqual(["https://a"])
  })

  it("applies undefined on lastError, invalid envelopes, and error envelopes", async () => {
    vi.useFakeTimers()
    for (const options of [
      { id: "ext", respond: ok({}), lastError: { message: "gone" } },
      { id: "ext", respond: { bogus: true } },
      { id: "ext", respond: err("boom") }
    ]) {
      stubChrome(options)
      const applied: Array<[string, number | null | undefined]> = []
      requestHatenaCounts(["https://a"], (url, count) => applied.push([url, count]), vi.fn())
      await vi.runAllTimersAsync()
      expect(applied).toEqual([["https://a", undefined]])
    }
  })

  it("applies undefined when sendMessage throws synchronously", async () => {
    vi.useFakeTimers()
    stubChrome({ id: "ext", throwOnSend: true })
    const applied: Array<[string, number | null | undefined]> = []
    const settled: string[] = []

    requestHatenaCounts(
      ["https://a"],
      (url, count) => applied.push([url, count]),
      (url) => settled.push(url)
    )
    await vi.runAllTimersAsync()

    expect(applied).toEqual([["https://a", undefined]])
    expect(settled).toEqual(["https://a"])
  })
})

describe("requestHnSummaries", () => {
  it("applies summaries from an ok envelope", () => {
    stubChrome({ id: "ext", respond: ok({ "https://a": { nbHits: 4 }, "https://b": null }) })
    const applied: Array<[string, unknown]> = []

    requestHnSummaries(
      ["https://a", "https://b", "https://c"],
      (url, summary) => applied.push([url, summary]),
      vi.fn()
    )

    expect(applied).toEqual([
      ["https://a", { nbHits: 4 }],
      ["https://b", null],
      ["https://c", null]
    ])
  })

  it("does nothing for an empty url list", () => {
    const apply = vi.fn()
    requestHnSummaries([], apply, vi.fn())
    expect(apply).not.toHaveBeenCalled()
  })

  it("maps unavailable HN results to an unknown signal after retries", async () => {
    vi.useFakeTimers()
    const sendMessage = vi.fn((_message: unknown, callback: (response: unknown) => void) => {
      callback(ok({ "https://a": HACKER_NEWS_SUMMARY_UNAVAILABLE }))
    })
    stubChrome({ id: "ext", sendMessage })
    const apply = vi.fn()

    requestHnSummaries(["https://a"], apply, vi.fn())
    await vi.runAllTimersAsync()

    expect(sendMessage).toHaveBeenCalledTimes(3)
    expect(apply).toHaveBeenCalledWith("https://a", undefined)
  })

  it("retries an unavailable HN response before applying a stable summary", async () => {
    vi.useFakeTimers()
    const stableSummary = { nbHits: 0, maxPoints: 0, maxComments: 0 }
    const responses = [
      ok({ "https://a": HACKER_NEWS_SUMMARY_UNAVAILABLE }),
      ok({ "https://a": stableSummary })
    ]
    const sendMessage = vi.fn((_message: unknown, callback: (response: unknown) => void) => {
      callback(responses.shift())
    })
    stubChrome({ id: "ext", sendMessage })
    const apply = vi.fn()
    const settle = vi.fn()

    requestHnSummaries(["https://a"], apply, settle)
    await vi.runAllTimersAsync()

    expect(sendMessage).toHaveBeenCalledTimes(2)
    expect(apply).toHaveBeenCalledOnce()
    expect(apply).toHaveBeenCalledWith("https://a", stableSummary)
    expect(settle).toHaveBeenCalledOnce()
  })

  it("limits simultaneous HN runtime messages to four and preserves FIFO", () => {
    const callbacks: Array<(response: unknown) => void> = []
    const startedUrls: string[] = []
    const sendMessage = vi.fn((message: unknown, callback: (response: unknown) => void) => {
      startedUrls.push((message as { urls: string[] }).urls[0] ?? "")
      callbacks.push(callback)
    })
    stubChrome({ id: "ext", sendMessage })
    const urls = Array.from({ length: 6 }, (_, index) => `https://example.com/${index + 1}`)

    urls.forEach((url) => requestHnSummaries([url], vi.fn(), vi.fn()))

    expect(startedUrls).toEqual(urls.slice(0, 4))
    callbacks.shift()?.(ok({ [urls[0]!]: { nbHits: 0 } }))
    expect(startedUrls).toEqual(urls.slice(0, 5))
    callbacks.shift()?.(ok({ [urls[1]!]: { nbHits: 0 } }))
    expect(startedUrls).toEqual(urls)
    callbacks.splice(0).forEach((callback, index) => {
      callback(ok({ [urls[index + 2]!]: { nbHits: 0 } }))
    })
  })

  it("applies undefined on unavailable runtime, errors, and invalid envelopes", async () => {
    vi.useFakeTimers()
    for (const options of [
      { id: undefined },
      { id: "ext", respond: ok({}), lastError: { message: "gone" } },
      { id: "ext", respond: { bogus: true } },
      { id: "ext", respond: err("boom") },
      { id: "ext", throwOnSend: true }
    ]) {
      stubChrome(options)
      const applied: Array<[string, unknown]> = []
      requestHnSummaries(["https://a"], (url, summary) => applied.push([url, summary]), vi.fn())
      await vi.runAllTimersAsync()
      expect(applied).toEqual([["https://a", undefined]])
    }
  })
})

describe("requestBlueskySummaries", () => {
  it("splits large result sets into requests accepted by the background worker", () => {
    const urls = Array.from({ length: 81 }, (_, index) => `https://example.com/${index}`)
    const sentBatches: string[][] = []
    stubChrome({
      id: "ext",
      respondWith: (message) => {
        const batch = (message as { urls: string[] }).urls
        sentBatches.push(batch)
        return ok(Object.fromEntries(batch.map((url) => [url, { hitsTotal: 1 }])))
      }
    })
    const apply = vi.fn()
    const settle = vi.fn()

    requestBlueskySummaries(urls, apply, settle)

    expect(sentBatches.map((batch) => batch.length)).toEqual([40, 40, 1])
    expect(sentBatches.flat()).toEqual(urls)
    expect(apply).toHaveBeenCalledTimes(urls.length)
    expect(settle).toHaveBeenCalledTimes(urls.length)
  })

  it("summarizes diagnostics without exposing requested URLs", () => {
    const sensitiveUrl = "https://example.com/private?diagnosis=hidden"
    const diagnostics = buildBlueskySummaryDiagnostics(
      [sensitiveUrl, "https://example.com/zero", "https://example.com/missing"],
      {
        [sensitiveUrl]: { hitsTotal: 2 },
        "https://example.com/zero": { hitsTotal: 0 }
      }
    )

    expect(diagnostics).toEqual({ requestedUrls: 3, positive: 1, zero: 1, unavailable: 1 })
    expect(JSON.stringify(diagnostics)).not.toContain("diagnosis")
    expect(JSON.stringify(diagnostics)).not.toContain("example.com")
  })

  it("applies validated summaries and marks missing keys unknown", () => {
    stubChrome({ id: "ext", respond: ok({ "https://a": { hitsTotal: 4 } }) })
    const applied: Array<[string, unknown]> = []

    requestBlueskySummaries(
      ["https://a", "https://b"],
      (url, summary) => applied.push([url, summary]),
      vi.fn()
    )

    expect(applied).toEqual([
      ["https://a", { hitsTotal: 4 }],
      ["https://b", undefined]
    ])
  })

  it("maps unavailable results to unknown without repeating network-level retries", () => {
    const sendMessage = vi.fn((_message: unknown, callback: (response: unknown) => void) => {
      callback(ok({ "https://a": BLUESKY_SUMMARY_UNAVAILABLE }))
    })
    stubChrome({ id: "ext", sendMessage })
    const apply = vi.fn()

    requestBlueskySummaries(["https://a"], apply, vi.fn())
    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(apply).toHaveBeenCalledWith("https://a", undefined)
  })

  it("limits simultaneous runtime messages to three", () => {
    const callbacks: Array<(response: unknown) => void> = []
    const startedUrls: string[] = []
    const sendMessage = vi.fn((message: unknown, callback: (response: unknown) => void) => {
      startedUrls.push((message as { urls: string[] }).urls[0] ?? "")
      callbacks.push(callback)
    })
    stubChrome({ id: "ext", sendMessage })
    const urls = Array.from({ length: 5 }, (_, index) => `https://example.com/${index + 1}`)

    urls.forEach((url) => requestBlueskySummaries([url], vi.fn(), vi.fn()))

    expect(startedUrls).toEqual(urls.slice(0, 3))
    callbacks.shift()?.(ok({ [urls[0]!]: { hitsTotal: 0 } }))
    expect(startedUrls).toEqual(urls.slice(0, 4))
    callbacks.shift()?.(ok({ [urls[1]!]: { hitsTotal: 0 } }))
    expect(startedUrls).toEqual(urls)
    callbacks.splice(0).forEach((callback, index) => {
      callback(ok({ [urls[index + 2]!]: { hitsTotal: 0 } }))
    })
  })
})

describe("requestEntryBookmarks", () => {
  it("resolves bookmark summaries from an ok envelope", async () => {
    const bookmarks = [{ user: "alice", comment: "great" }]
    stubChrome({ id: "ext", respond: ok(bookmarks) })

    await expect(requestEntryBookmarks("https://a")).resolves.toEqual(bookmarks)
  })

  it("resolves null when the runtime is unavailable", async () => {
    stubChrome({ id: undefined })
    await expect(requestEntryBookmarks("https://a")).resolves.toBeNull()
  })

  it("resolves null on lastError and invalid envelopes", async () => {
    stubChrome({ id: "ext", respond: ok([]), lastError: { message: "gone" } })
    await expect(requestEntryBookmarks("https://a")).resolves.toBeNull()

    stubChrome({ id: "ext", respond: { bogus: true } })
    await expect(requestEntryBookmarks("https://a")).resolves.toBeNull()
  })

  it("maps error envelopes to an empty list to preserve overlay wording", async () => {
    stubChrome({ id: "ext", respond: err("boom") })
    await expect(requestEntryBookmarks("https://a")).resolves.toEqual([])
  })

  it("keeps the production request envelope unchanged when diagnostics are disabled", async () => {
    const sent: unknown[] = []
    stubChrome({ id: "ext", respond: ok([]), onSend: (message) => sent.push(message) })

    await requestEntryBookmarks("https://a", { diagnostics: false })

    expect(sent).toEqual([{ type: MESSAGE_TYPES.ENTRY_REQUEST, url: "https://a" }])
  })

  it("logs one structured round-trip record for diagnostic requests", async () => {
    const sent: unknown[] = []
    let logLabel: unknown
    let logDetails: unknown
    vi.spyOn(console, "info").mockImplementation((label: unknown, details: unknown) => {
      logLabel = label
      logDetails = details
    })
    stubChrome({
      id: "ext",
      onSend: (message) => sent.push(message),
      respondWith: (message) => {
        const request = message as { diagnostics: { requestId: string } }
        return {
          ok: true,
          data: [{ user: "alice", comment: "great" }],
          diagnostics: {
            requestId: request.diagnostics.requestId,
            backgroundReceivedDelayMs: 2,
            backgroundTotalMs: 20,
            fetch: {
              fetchHeadersMs: 12,
              bodyParseMs: 3,
              filterMs: 1,
              totalMs: 16,
              responseHeaders: {
                xCache: "Hit from cloudfront",
                age: "41",
                xAmzCfPop: "NRT57-P4"
              }
            }
          }
        }
      }
    })

    await requestEntryBookmarks("https://example.com/article?secret=1", { diagnostics: true })

    expect(sent).toHaveLength(1)
    const request = sent[0]
    expect(isHatenaEntryRequest(request)).toBe(true)
    if (!isHatenaEntryRequest(request) || !request.diagnostics) {
      throw new Error("diagnostic request was not sent")
    }
    expect(request.url).toBe("https://example.com/article?secret=1")
    expect(request.diagnostics.requestId.length).toBeGreaterThan(0)
    expect(typeof request.diagnostics.sentAtEpochMs).toBe("number")

    expect(logLabel).toBe("[GSPLUS_DIAGNOSTICS]")
    expect(logDetails).toMatchObject({
      event: "hatena-entry",
      requestId: request.diagnostics.requestId,
      extensionVersion: "0.1.3",
      target: "https://example.com/article",
      background: {
        requestId: request.diagnostics.requestId,
        fetch: {
          responseHeaders: {
            xCache: "Hit from cloudfront",
            age: "41",
            xAmzCfPop: "NRT57-P4"
          }
        }
      }
    })
    if (typeof logDetails !== "object" || logDetails === null) {
      throw new Error("diagnostic log details were not recorded")
    }
    expect(typeof (logDetails as Record<string, unknown>).roundTripMs).toBe("number")
  })
})
