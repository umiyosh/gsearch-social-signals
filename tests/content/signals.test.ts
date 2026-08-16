import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { insertBadge, insertHnBadge } from "../../src/content/badges"
import {
  beginOverlaySession,
  cancelOverlayHide,
  presentOverlay,
  scheduleOverlayHide
} from "../../src/content/overlay"
import {
  createSignalPipeline,
  type SignalPipeline,
  type SignalPipelineDeps
} from "../../src/content/signals"
import type { SearchResultTarget } from "../../src/content/searchResults"
import { FILTERED_RESULT_CLASS } from "../../src/content/styles"

type CountRequest = SignalPipelineDeps["requestHatenaCounts"]
type HnRequest = SignalPipelineDeps["requestHnSummaries"]
type EntryRequest = SignalPipelineDeps["requestEntryBookmarks"]

let deps: SignalPipelineDeps
let queueTargets: SignalPipeline
let requestHatenaCounts: ReturnType<
  typeof vi.fn<Parameters<CountRequest>, ReturnType<CountRequest>>
>
let requestHnSummaries: ReturnType<typeof vi.fn<Parameters<HnRequest>, ReturnType<HnRequest>>>
let requestEntryBookmarks: ReturnType<
  typeof vi.fn<Parameters<EntryRequest>, ReturnType<EntryRequest>>
>

function buildTarget(url: string): SearchResultTarget {
  const container = document.createElement("div")
  const wrap = document.createElement("div")
  const anchor = document.createElement("a")
  anchor.href = url
  wrap.appendChild(anchor)
  container.appendChild(wrap)
  document.body.appendChild(container)
  return { container, anchor, url }
}

function lastCountsCall(): {
  urls: string[]
  apply: (url: string, count: number | null | undefined) => void
  settle: (url: string) => void
} {
  const call = requestHatenaCounts.mock.calls.at(-1)
  if (!call) {
    throw new Error("requestHatenaCounts was not called")
  }
  return { urls: call[0], apply: call[1], settle: call[2] }
}

function lastHnCall(): {
  urls: string[]
  apply: Parameters<HnRequest>[1]
  settle: Parameters<HnRequest>[2]
} {
  const call = requestHnSummaries.mock.calls.at(-1)
  if (!call) {
    throw new Error("requestHnSummaries was not called")
  }
  return { urls: call[0], apply: call[1], settle: call[2] }
}

beforeEach(() => {
  document.body.textContent = ""
  requestHatenaCounts = vi.fn<Parameters<CountRequest>, ReturnType<CountRequest>>()
  requestHnSummaries = vi.fn<Parameters<HnRequest>, ReturnType<HnRequest>>()
  requestEntryBookmarks = vi.fn<Parameters<EntryRequest>, ReturnType<EntryRequest>>()
  deps = {
    requestHatenaCounts,
    requestHnSummaries,
    requestEntryBookmarks,
    insertBadge,
    insertHnBadge,
    beginOverlaySession,
    presentOverlay,
    scheduleOverlayHide,
    cancelOverlayHide
  }
  queueTargets = createSignalPipeline(deps)
})

afterEach(() => {
  vi.useRealTimers()
})

describe("queueTargets", () => {
  it("requests each unique url once and renders badges on positive counts", () => {
    const first = buildTarget("https://signals.example/one")
    const second = buildTarget("https://signals.example/one")

    queueTargets([first, second])

    const { urls, apply } = lastCountsCall()
    expect(urls).toEqual(["https://signals.example/one"])

    apply("https://signals.example/one", 9)

    expect(first.container.querySelector(".gsplus-hatebu-count")?.textContent).toContain("9 users")
    expect(second.container.querySelector(".gsplus-hatebu-count")?.textContent).toContain("9 users")
  })

  it("marks containers as done for zero or null counts", () => {
    const target = buildTarget("https://signals.example/zero")

    queueTargets([target])
    lastCountsCall().apply("https://signals.example/zero", 0)

    expect(target.container.getAttribute("data-gsplus-hatebu")).toBe("done")
    expect(target.container.querySelector(".gsplus-hatebu-count")).toBeNull()
  })

  it("serves cached counts without issuing a second request", () => {
    const first = buildTarget("https://signals.example/cached")
    queueTargets([first])
    const { apply, settle } = lastCountsCall()
    apply("https://signals.example/cached", 4)
    settle("https://signals.example/cached")
    const requestsSoFar = requestHatenaCounts.mock.calls.length

    const second = buildTarget("https://signals.example/cached")
    queueTargets([second])

    expect(requestHatenaCounts.mock.calls.length).toBe(requestsSoFar)
    expect(second.container.querySelector(".gsplus-hatebu-count")?.textContent).toContain("4 users")
  })

  it("suppresses duplicate requests while a url is in flight", () => {
    const first = buildTarget("https://signals.example/inflight")
    queueTargets([first])
    const requestsSoFar = requestHatenaCounts.mock.calls.length

    const second = buildTarget("https://signals.example/inflight")
    queueTargets([second])

    expect(requestHatenaCounts.mock.calls.length).toBe(requestsSoFar)
  })

  it("does not cache an unknown result for a later matching target", () => {
    const url = "https://signals.example/retry-unknown"
    const first = buildTarget(url)
    queueTargets([first])
    const firstCall = lastCountsCall()
    firstCall.apply(url, undefined)
    firstCall.settle(url)
    const requestsSoFar = requestHatenaCounts.mock.calls.length

    const second = buildTarget(url)
    queueTargets([second])

    expect(requestHatenaCounts.mock.calls.length).toBe(requestsSoFar + 1)
    expect(lastCountsCall().urls).toEqual([url])
  })

  it("renders HN badges when summaries report positive max points", () => {
    const target = buildTarget("https://signals.example/hn")

    queueTargets([target])

    const hnCall = requestHnSummaries.mock.calls.at(-1)
    expect(hnCall?.[0]).toEqual(["https://signals.example/hn"])
    hnCall?.[1]("https://signals.example/hn", { nbHits: 6, maxPoints: 42 })

    expect(target.container.querySelector(".gsplus-hn-count")?.textContent).toContain("HN 42 pts")
  })

  it("skips HN badges for null, zero-point, or points-missing summaries", () => {
    const nullTarget = buildTarget("https://signals.example/hn-null")
    const zeroTarget = buildTarget("https://signals.example/hn-zero")
    const missingTarget = buildTarget("https://signals.example/hn-missing")

    queueTargets([nullTarget, zeroTarget, missingTarget])
    const hnCall = requestHnSummaries.mock.calls.at(-1)
    hnCall?.[1]("https://signals.example/hn-null", null)
    hnCall?.[1]("https://signals.example/hn-zero", { nbHits: 2, maxPoints: 0 })
    hnCall?.[1]("https://signals.example/hn-missing", { nbHits: 2 })

    expect(nullTarget.container.querySelector(".gsplus-hn-count")).toBeNull()
    expect(zeroTarget.container.querySelector(".gsplus-hn-count")).toBeNull()
    expect(missingTarget.container.querySelector(".gsplus-hn-count")).toBeNull()
  })

  it("keeps rendering Hatena badges when HN max points are zero", () => {
    const target = buildTarget("https://signals.example/hatena-only")

    queueTargets([target])
    lastCountsCall().apply("https://signals.example/hatena-only", 5)
    requestHnSummaries.mock.calls.at(-1)?.[1]("https://signals.example/hatena-only", {
      nbHits: 2,
      maxPoints: 0
    })

    expect(target.container.querySelector(".gsplus-hatebu-count")?.textContent).toContain("5 users")
    expect(target.container.querySelector(".gsplus-hn-count")).toBeNull()
  })
})

describe("result filtering", () => {
  it("hides a result only after both signal requests settle without a positive signal", () => {
    const target = buildTarget("https://signals.example/none")
    queueTargets.setFilterEnabled(true)

    queueTargets([target])
    lastCountsCall().apply(target.url, 0)

    expect(target.container.classList.contains(FILTERED_RESULT_CLASS)).toBe(false)

    lastHnCall().apply(target.url, null)

    expect(target.container.classList.contains(FILTERED_RESULT_CLASS)).toBe(true)
  })

  it("keeps a result visible when either signal is positive", () => {
    const hatenaTarget = buildTarget("https://signals.example/hatena-positive")
    const hnTarget = buildTarget("https://signals.example/hn-positive")
    queueTargets.setFilterEnabled(true)

    queueTargets([hatenaTarget, hnTarget])
    lastCountsCall().apply(hatenaTarget.url, 3)
    lastHnCall().apply(hatenaTarget.url, null)
    lastCountsCall().apply(hnTarget.url, 0)
    lastHnCall().apply(hnTarget.url, { nbHits: 1, maxPoints: 7 })

    expect(hatenaTarget.container.classList.contains(FILTERED_RESULT_CLASS)).toBe(false)
    expect(hnTarget.container.classList.contains(FILTERED_RESULT_CLASS)).toBe(false)
  })

  it("hides a settled result when no provider has a known positive signal", () => {
    const target = buildTarget("https://signals.example/unknown")
    queueTargets.setFilterEnabled(true)

    queueTargets([target])
    lastCountsCall().apply(target.url, undefined)
    lastHnCall().apply(target.url, null)

    expect(target.container.classList.contains(FILTERED_RESULT_CLASS)).toBe(true)
  })

  it("restores hidden results when the filter is disabled", () => {
    const target = buildTarget("https://signals.example/toggle")
    queueTargets.setFilterEnabled(true)
    queueTargets([target])
    lastCountsCall().apply(target.url, 0)
    lastHnCall().apply(target.url, null)
    expect(target.container.classList.contains(FILTERED_RESULT_CLASS)).toBe(true)

    queueTargets.setFilterEnabled(false)

    expect(target.container.classList.contains(FILTERED_RESULT_CLASS)).toBe(false)
  })

  it("retries only unknown providers when the filter is re-enabled", () => {
    const target = buildTarget("https://signals.example/retry-filter")
    queueTargets.setFilterEnabled(true)
    queueTargets([target])

    const countsCall = lastCountsCall()
    countsCall.apply(target.url, undefined)
    countsCall.settle(target.url)
    const hnCall = lastHnCall()
    hnCall.apply(target.url, null)
    hnCall.settle(target.url)
    const hnRequestsSoFar = requestHnSummaries.mock.calls.length

    queueTargets.setFilterEnabled(false)
    queueTargets.setFilterEnabled(true)

    expect(lastCountsCall().urls).toEqual([target.url])
    expect(requestHnSummaries.mock.calls.length).toBe(hnRequestsSoFar)

    lastCountsCall().apply(target.url, 0)

    expect(target.container.classList.contains(FILTERED_RESULT_CLASS)).toBe(true)
  })

  it("renders a recovered HN signal when the filter is re-enabled", () => {
    const target = buildTarget("https://signals.example/retry-hn")
    queueTargets.setFilterEnabled(true)
    queueTargets([target])

    const countsCall = lastCountsCall()
    countsCall.apply(target.url, 0)
    countsCall.settle(target.url)
    const hnCall = lastHnCall()
    hnCall.apply(target.url, undefined)
    hnCall.settle(target.url)

    queueTargets.setFilterEnabled(false)
    queueTargets.setFilterEnabled(true)
    lastHnCall().apply(target.url, { nbHits: 1, maxPoints: 9 })

    expect(target.container.querySelector(".gsplus-hn-count")?.textContent).toContain("HN 9 pts")
    expect(target.container.classList.contains(FILTERED_RESULT_CLASS)).toBe(false)
  })
})

describe("dynamic result filtering", () => {
  it("applies cached filtering decisions to added results", () => {
    const url = "https://signals.example/dynamic"
    const first = buildTarget(url)
    queueTargets.setFilterEnabled(true)
    queueTargets([first])
    lastCountsCall().apply(url, 0)
    lastHnCall().apply(url, null)

    const second = buildTarget(url)
    queueTargets([second])

    expect(first.container.classList.contains(FILTERED_RESULT_CLASS)).toBe(true)
    expect(second.container.classList.contains(FILTERED_RESULT_CLASS)).toBe(true)
  })

  it("automatically retries an unavailable signal for a result added after pagination", async () => {
    vi.useFakeTimers()
    queueTargets.setFilterEnabled(true)

    const firstPageTarget = buildTarget("https://signals.example/first-page")
    queueTargets([firstPageTarget])
    const firstCountsCall = lastCountsCall()
    firstCountsCall.apply(firstPageTarget.url, 0)
    firstCountsCall.settle(firstPageTarget.url)
    const firstHnCall = lastHnCall()
    firstHnCall.apply(firstPageTarget.url, null)
    firstHnCall.settle(firstPageTarget.url)

    const nextPageTarget = buildTarget("https://signals.example/next-page")
    queueTargets([nextPageTarget])
    const nextCountsCall = lastCountsCall()
    nextCountsCall.apply(nextPageTarget.url, 0)
    nextCountsCall.settle(nextPageTarget.url)
    const nextHnCall = lastHnCall()
    nextHnCall.apply(nextPageTarget.url, undefined)
    nextHnCall.settle(nextPageTarget.url)
    const countsRequests = requestHatenaCounts.mock.calls.length
    const hnRequests = requestHnSummaries.mock.calls.length

    expect(nextPageTarget.container.classList.contains(FILTERED_RESULT_CLASS)).toBe(true)

    await vi.advanceTimersByTimeAsync(2_000)

    expect(requestHatenaCounts).toHaveBeenCalledTimes(countsRequests)
    expect(requestHnSummaries).toHaveBeenCalledTimes(hnRequests + 1)
    expect(lastHnCall().urls).toEqual([nextPageTarget.url])

    lastHnCall().apply(nextPageTarget.url, { nbHits: 1, maxPoints: 11 })

    expect(nextPageTarget.container.classList.contains(FILTERED_RESULT_CLASS)).toBe(false)
    expect(nextPageTarget.container.querySelector(".gsplus-hn-count")?.textContent).toContain(
      "HN 11 pts"
    )
  })

  it("bounds automatic retries while a provider remains unavailable", async () => {
    vi.useFakeTimers()
    queueTargets.setFilterEnabled(true)
    const target = buildTarget("https://signals.example/persistently-unavailable")
    queueTargets([target])

    const countsCall = lastCountsCall()
    countsCall.apply(target.url, 0)
    countsCall.settle(target.url)
    const hnCall = lastHnCall()
    hnCall.apply(target.url, undefined)
    hnCall.settle(target.url)

    for (const delay of [2_000, 10_000, 50_000, 60_000]) {
      await vi.advanceTimersByTimeAsync(delay)
      const retry = lastHnCall()
      retry.apply(target.url, undefined)
      retry.settle(target.url)
    }

    expect(requestHnSummaries).toHaveBeenCalledTimes(5)

    await vi.advanceTimersByTimeAsync(120_000)

    expect(requestHnSummaries).toHaveBeenCalledTimes(5)
    expect(target.container.classList.contains(FILTERED_RESULT_CLASS)).toBe(true)
  })
})

describe("provider retry scheduling", () => {
  it("does not rearm exhausted URL retries when pagination adds another result", async () => {
    vi.useFakeTimers()
    queueTargets.setFilterEnabled(true)
    const exhausted = buildTarget("https://signals.example/exhausted")
    queueTargets([exhausted])

    lastCountsCall().apply(exhausted.url, 0)
    lastCountsCall().settle(exhausted.url)
    lastHnCall().apply(exhausted.url, undefined)
    lastHnCall().settle(exhausted.url)

    for (const delay of [2_000, 10_000, 50_000, 60_000]) {
      await vi.advanceTimersByTimeAsync(delay)
      lastHnCall().apply(exhausted.url, undefined)
      lastHnCall().settle(exhausted.url)
    }
    const exhaustedRequests = requestHnSummaries.mock.calls.length

    const added = buildTarget("https://signals.example/added")
    queueTargets([added])
    lastCountsCall().apply(added.url, 0)
    lastCountsCall().settle(added.url)
    lastHnCall().apply(added.url, undefined)
    lastHnCall().settle(added.url)

    await vi.advanceTimersByTimeAsync(2_000)

    expect(requestHnSummaries).toHaveBeenCalledTimes(exhaustedRequests + 2)
    expect(lastHnCall().urls).toEqual([added.url])
  })
})

describe("badge hover previews", () => {
  it("loads entry previews once and shows them in the overlay", async () => {
    const url = "https://signals.example/preview"
    const target = buildTarget(url)
    requestEntryBookmarks.mockResolvedValue([{ user: "alice", comment: "insightful" }])

    queueTargets([target])
    lastCountsCall().apply(url, 3)

    const badge = target.container.querySelector<HTMLAnchorElement>(".gsplus-hatebu-count")
    badge?.dispatchEvent(new MouseEvent("mouseenter"))
    await vi.waitFor(() => {
      expect(document.getElementById("gsplus-hatebu-overlay")?.textContent).toContain("insightful")
    })

    badge?.dispatchEvent(new MouseEvent("mouseenter"))
    await vi.waitFor(() => {
      expect(document.getElementById("gsplus-hatebu-overlay")?.textContent).toContain("insightful")
    })

    expect(requestEntryBookmarks).toHaveBeenCalledTimes(1)
  })
})
