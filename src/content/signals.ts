import type { SearchResultTarget } from "./searchResults"
import type { HatenaBookmarkSummary } from "../shared/hatena"
import type { HackerNewsSummary } from "../shared/hackerNews"
import { DATA_ATTR } from "../shared/url"
import { FILTERED_RESULT_CLASS } from "./styles"

export interface SignalPipelineDeps {
  requestHatenaCounts: (
    urls: string[],
    apply: (url: string, count: number | null | undefined) => void,
    settle: (url: string) => void
  ) => void
  requestHnSummaries: (
    urls: string[],
    apply: (url: string, summary: HackerNewsSummary | null | undefined) => void,
    settle: (url: string) => void
  ) => void
  requestEntryBookmarks: (url: string) => Promise<HatenaBookmarkSummary[] | null>
  insertBadge: (
    target: SearchResultTarget,
    count: number,
    hover: {
      onEnter: (badge: HTMLAnchorElement, url: string) => void
      onLeave: () => void
    }
  ) => void
  insertHnBadge: (target: SearchResultTarget, summary: HackerNewsSummary) => void
  beginOverlaySession: (url: string, badge: HTMLElement) => void
  presentOverlay: (
    url: string,
    badge: HTMLElement,
    bookmarks: HatenaBookmarkSummary[] | null
  ) => void
  scheduleOverlayHide: () => void
  cancelOverlayHide: () => void
}

export interface SignalPipeline {
  (targets: SearchResultTarget[]): void
  setFilterEnabled: (enabled: boolean) => void
}

type SignalState = "pending" | "positive" | "none" | "unknown"

interface TargetSignalState {
  target: SearchResultTarget
  hatena: SignalState
  hackerNews: SignalState
}

function createSignalRenderer(
  deps: SignalPipelineDeps,
  badgeHover: Parameters<SignalPipelineDeps["insertBadge"]>[2],
  targetStates: Map<HTMLElement, TargetSignalState>,
  isFilterEnabled: () => boolean
) {
  function applyFilter(state: TargetSignalState): void {
    const shouldHide = isFilterEnabled() && state.hatena === "none" && state.hackerNews === "none"
    state.target.container.classList.toggle(FILTERED_RESULT_CLASS, shouldHide)
  }

  function signalState(value: unknown, positive: boolean): SignalState {
    if (value === undefined) {
      return "unknown"
    }
    return positive ? "positive" : "none"
  }

  function renderCount(target: SearchResultTarget, count: number | null | undefined): void {
    const state = targetStates.get(target.container)
    if (!state) {
      return
    }

    const positive = typeof count === "number" && count > 0
    state.hatena = signalState(count, positive)
    if (positive) {
      deps.insertBadge(target, count, badgeHover)
    } else {
      target.container.setAttribute(DATA_ATTR, "done")
    }
    applyFilter(state)
  }

  function renderHnSummary(
    target: SearchResultTarget,
    summary: HackerNewsSummary | null | undefined
  ): void {
    const state = targetStates.get(target.container)
    if (!state) {
      return
    }

    const positive = Boolean(
      summary && typeof summary.maxPoints === "number" && summary.maxPoints > 0
    )
    state.hackerNews = signalState(summary, positive)
    if (positive && summary) {
      deps.insertHnBadge(target, summary)
    }
    applyFilter(state)
  }

  return { applyFilter, renderCount, renderHnSummary }
}

export function createSignalPipeline(deps: SignalPipelineDeps): SignalPipeline {
  const urlTargets = new Map<string, SearchResultTarget[]>()
  const cachedCounts = new Map<string, number | null | undefined>()
  const inflightUrls = new Set<string>()
  const hnTargets = new Map<string, SearchResultTarget[]>()
  const cachedHnSummaries = new Map<string, HackerNewsSummary | null | undefined>()
  const hnInflight = new Set<string>()
  const entryPreviewCache = new Map<string, HatenaBookmarkSummary[] | null>()
  const entryPreviewRequests = new Map<string, Promise<HatenaBookmarkSummary[] | null>>()
  const targetStates = new Map<HTMLElement, TargetSignalState>()
  let filterEnabled = false

  const badgeHover = {
    onEnter: (badge: HTMLAnchorElement, url: string) => {
      deps.cancelOverlayHide()
      void handleBadgeHover(badge, url)
    },
    onLeave: () => {
      deps.scheduleOverlayHide()
    }
  }
  const renderer = createSignalRenderer(deps, badgeHover, targetStates, () => filterEnabled)

  async function handleBadgeHover(badge: HTMLAnchorElement, url: string): Promise<void> {
    deps.beginOverlaySession(url, badge)

    if (entryPreviewCache.has(url)) {
      deps.presentOverlay(url, badge, entryPreviewCache.get(url) ?? null)
      return
    }

    let previews: HatenaBookmarkSummary[] | null = null
    try {
      previews = await getEntryPreviews(url)
    } finally {
      entryPreviewCache.set(url, previews ?? null)
    }

    deps.presentOverlay(url, badge, previews)
  }

  async function getEntryPreviews(url: string): Promise<HatenaBookmarkSummary[] | null> {
    let pending = entryPreviewRequests.get(url)
    if (!pending) {
      pending = deps.requestEntryBookmarks(url)
      entryPreviewRequests.set(url, pending)
    }

    const result = await pending
    entryPreviewRequests.delete(url)
    return result
  }

  function applyCount(url: string, count: number | null | undefined): void {
    cachedCounts.set(url, count)

    const targets = urlTargets.get(url) ?? []
    targets.forEach((target) => renderer.renderCount(target, count))
    urlTargets.delete(url)
  }

  function applyHnSummary(url: string, summary: HackerNewsSummary | null | undefined): void {
    cachedHnSummaries.set(url, summary)
    const targets = hnTargets.get(url) ?? []
    targets.forEach((target) => renderer.renderHnSummary(target, summary))
    hnTargets.delete(url)
  }

  const queueTargets = (targets: SearchResultTarget[]): void => {
    const urlsToRequest: string[] = []
    const hnUrlsToRequest: string[] = []

    targets.forEach((target) => {
      targetStates.set(target.container, {
        target,
        hatena: "pending",
        hackerNews: "pending"
      })

      if (cachedCounts.has(target.url)) {
        renderer.renderCount(target, cachedCounts.get(target.url))
      } else if (!inflightUrls.has(target.url)) {
        urlTargets.set(target.url, [target])
        inflightUrls.add(target.url)
        urlsToRequest.push(target.url)
      } else {
        const list = urlTargets.get(target.url) ?? []
        list.push(target)
        urlTargets.set(target.url, list)
      }

      if (cachedHnSummaries.has(target.url)) {
        renderer.renderHnSummary(target, cachedHnSummaries.get(target.url))
      } else if (!hnInflight.has(target.url)) {
        hnTargets.set(target.url, [target])
        hnInflight.add(target.url)
        hnUrlsToRequest.push(target.url)
      } else {
        const hnList = hnTargets.get(target.url) ?? []
        hnList.push(target)
        hnTargets.set(target.url, hnList)
      }
    })

    if (urlsToRequest.length) {
      deps.requestHatenaCounts(urlsToRequest, applyCount, (url) => inflightUrls.delete(url))
    }

    if (hnUrlsToRequest.length) {
      deps.requestHnSummaries(hnUrlsToRequest, applyHnSummary, (url) => hnInflight.delete(url))
    }
  }

  queueTargets.setFilterEnabled = (enabled: boolean): void => {
    filterEnabled = enabled
    targetStates.forEach(renderer.applyFilter)
  }

  return queueTargets
}
