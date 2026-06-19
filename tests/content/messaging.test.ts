import { afterEach, describe, expect, it, vi } from "vitest"
import {
  requestEntryBookmarks,
  requestHatenaCounts,
  requestHnSummaries
} from "../../src/content/messaging"
import { err, ok } from "../../src/shared/messages"

type ChromeStub = {
  runtime?: {
    id?: string | undefined
    lastError?: { message: string } | undefined
    sendMessage: (message: unknown, callback: (response: unknown) => void) => void
  }
}

function stubChrome(options: {
  id?: string | undefined
  lastError?: { message: string } | undefined
  respond?: unknown
  throwOnSend?: boolean | undefined
}): void {
  const stub: ChromeStub = {
    runtime: {
      id: options.id,
      lastError: options.lastError,
      sendMessage: (message, callback) => {
        if (options.throwOnSend) {
          throw new Error("send failed")
        }
        callback(options.respond)
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
})
