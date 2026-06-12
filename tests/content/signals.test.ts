import { beforeEach, describe, expect, it, vi } from "vitest"
import { queueTargets } from "../../src/content/signals"
import {
  requestEntryBookmarks,
  requestHatenaCounts,
  requestHnSummaries
} from "../../src/content/messaging"
import type { SearchResultTarget } from "../../src/content/searchResults"

vi.mock("../../src/content/messaging", () => ({
  requestHatenaCounts: vi.fn(),
  requestHnSummaries: vi.fn(),
  requestEntryBookmarks: vi.fn()
}))

const mockedCounts = vi.mocked(requestHatenaCounts)
const mockedHn = vi.mocked(requestHnSummaries)
const mockedEntry = vi.mocked(requestEntryBookmarks)

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
  const call = mockedCounts.mock.calls.at(-1)
  if (!call) {
    throw new Error("requestHatenaCounts was not called")
  }
  return { urls: call[0], apply: call[1], settle: call[2] }
}

beforeEach(() => {
  document.body.textContent = ""
  vi.clearAllMocks()
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
    const requestsSoFar = mockedCounts.mock.calls.length

    const second = buildTarget("https://signals.example/cached")
    queueTargets([second])

    expect(mockedCounts.mock.calls.length).toBe(requestsSoFar)
    expect(second.container.querySelector(".gsplus-hatebu-count")?.textContent).toContain("4 users")
  })

  it("suppresses duplicate requests while a url is in flight", () => {
    const first = buildTarget("https://signals.example/inflight")
    queueTargets([first])
    const requestsSoFar = mockedCounts.mock.calls.length

    const second = buildTarget("https://signals.example/inflight")
    queueTargets([second])

    expect(mockedCounts.mock.calls.length).toBe(requestsSoFar)
  })

  it("renders HN badges when summaries report hits", () => {
    const target = buildTarget("https://signals.example/hn")

    queueTargets([target])

    const hnCall = mockedHn.mock.calls.at(-1)
    expect(hnCall?.[0]).toEqual(["https://signals.example/hn"])
    hnCall?.[1]("https://signals.example/hn", { nbHits: 6 })

    expect(target.container.querySelector(".gsplus-hn-count")?.textContent).toContain("HN 6 posts")
  })

  it("skips HN badges for null or zero-hit summaries", () => {
    const target = buildTarget("https://signals.example/hn-none")

    queueTargets([target])
    mockedHn.mock.calls.at(-1)?.[1]("https://signals.example/hn-none", null)

    expect(target.container.querySelector(".gsplus-hn-count")).toBeNull()
  })
})

describe("badge hover previews", () => {
  it("loads entry previews once and shows them in the overlay", async () => {
    const url = "https://signals.example/preview"
    const target = buildTarget(url)
    mockedEntry.mockResolvedValue([{ user: "alice", comment: "insightful" }])

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

    expect(mockedEntry).toHaveBeenCalledTimes(1)
  })
})
