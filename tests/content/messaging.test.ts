import { afterEach, describe, expect, it, vi } from "vitest"
import {
  requestEntryBookmarks,
  requestHatenaCounts,
  requestHnSummaries
} from "../../src/content/messaging"
import { MESSAGE_TYPES, err, isHatenaEntryRequest, ok } from "../../src/shared/messages"

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
}): void {
  const stub: ChromeStub = {
    runtime: {
      id: options.id,
      lastError: options.lastError,
      getManifest: () => ({ version: "0.1.3" }),
      sendMessage: (message, callback) => {
        if (options.throwOnSend) {
          throw new Error("send failed")
        }
        options.onSend?.(message)
        callback(options.respondWith ? options.respondWith(message) : options.respond)
      }
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

  it("applies null when the runtime is unavailable", () => {
    stubChrome({ id: undefined })
    const applied: Array<[string, number | null | undefined]> = []
    const settled: string[] = []

    requestHatenaCounts(
      ["https://a"],
      (url, count) => applied.push([url, count]),
      (url) => settled.push(url)
    )

    expect(applied).toEqual([["https://a", null]])
    expect(settled).toEqual(["https://a"])
  })

  it("applies null on lastError, invalid envelopes, and error envelopes", () => {
    for (const options of [
      { id: "ext", respond: ok({}), lastError: { message: "gone" } },
      { id: "ext", respond: { bogus: true } },
      { id: "ext", respond: err("boom") }
    ]) {
      stubChrome(options)
      const applied: Array<[string, number | null | undefined]> = []
      requestHatenaCounts(["https://a"], (url, count) => applied.push([url, count]), vi.fn())
      expect(applied).toEqual([["https://a", null]])
    }
  })

  it("applies null when sendMessage throws synchronously", () => {
    stubChrome({ id: "ext", throwOnSend: true })
    const applied: Array<[string, number | null | undefined]> = []
    const settled: string[] = []

    requestHatenaCounts(
      ["https://a"],
      (url, count) => applied.push([url, count]),
      (url) => settled.push(url)
    )

    expect(applied).toEqual([["https://a", null]])
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

  it("applies null on unavailable runtime, errors, and invalid envelopes", () => {
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
      expect(applied).toEqual([["https://a", null]])
    }
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
            fetch: { fetchHeadersMs: 12, bodyParseMs: 3, filterMs: 1, totalMs: 16 }
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
      background: { requestId: request.diagnostics.requestId }
    })
    if (typeof logDetails !== "object" || logDetails === null) {
      throw new Error("diagnostic log details were not recorded")
    }
    expect(typeof (logDetails as Record<string, unknown>).roundTripMs).toBe("number")
  })
})
