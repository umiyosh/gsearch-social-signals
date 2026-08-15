import type { SearchResultTarget } from "./searchResults"
import type { HatenaBookmarkSummary } from "../shared/hatena"
import type { HackerNewsSummary } from "../shared/hackerNews"
import type { BlueskySummary } from "../shared/bluesky"
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
  requestBlueskySummaries: (
    urls: string[],
    apply: (url: string, summary: BlueskySummary | undefined) => void,
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
  insertBlueskyBadge: (target: SearchResultTarget, summary: BlueskySummary) => void
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
  bluesky: SignalState
}

interface ProviderPipelineState<T> {
  targets: Map<string, SearchResultTarget[]>
  cache: Map<string, T>
  inflight: Set<string>
}

function createProviderPipelineState<T>(): ProviderPipelineState<T> {
  return { targets: new Map(), cache: new Map(), inflight: new Set() }
}

function queueProviderTarget<T>(
  target: SearchResultTarget,
  state: ProviderPipelineState<T>,
  render: (target: SearchResultTarget, value: T | undefined) => void,
  urlsToRequest: string[]
): void {
  if (state.cache.has(target.url)) {
    render(target, state.cache.get(target.url))
  } else if (!state.inflight.has(target.url)) {
    state.targets.set(target.url, [target])
    state.inflight.add(target.url)
    urlsToRequest.push(target.url)
  } else {
    const targets = state.targets.get(target.url) ?? []
    targets.push(target)
    state.targets.set(target.url, targets)
  }
}

function applyProviderResult<T>(
  url: string,
  value: T,
  state: ProviderPipelineState<T>,
  render: (target: SearchResultTarget, value: T) => void
): void {
  if (value === undefined) {
    state.cache.delete(url)
  } else {
    state.cache.set(url, value)
  }
  const targets = state.targets.get(url) ?? []
  targets.forEach((target) => render(target, value))
  state.targets.delete(url)
}

function createSignalRenderer(
  deps: SignalPipelineDeps,
  badgeHover: Parameters<SignalPipelineDeps["insertBadge"]>[2],
  targetStates: Map<HTMLElement, TargetSignalState>,
  isFilterEnabled: () => boolean
) {
  function applyFilter(state: TargetSignalState): void {
    const shouldHide =
      isFilterEnabled() &&
      state.hatena === "none" &&
      state.hackerNews === "none" &&
      state.bluesky === "none"
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

  function renderBlueskySummary(target: SearchResultTarget, summary: BlueskySummary | undefined) {
    const state = targetStates.get(target.container)
    if (!state) {
      return
    }

    const positive = Boolean(summary && summary.hitsTotal > 0)
    state.bluesky = signalState(summary, positive)
    if (positive && summary) {
      deps.insertBlueskyBadge(target, summary)
    }
    applyFilter(state)
  }

  return { applyFilter, renderCount, renderHnSummary, renderBlueskySummary }
}

function createSignalRequestCoordinator(
  deps: SignalPipelineDeps,
  renderer: ReturnType<typeof createSignalRenderer>,
  targetStates: Map<HTMLElement, TargetSignalState>
) {
  const hatena = createProviderPipelineState<number | null | undefined>()
  const hackerNews = createProviderPipelineState<HackerNewsSummary | null | undefined>()
  const bluesky = createProviderPipelineState<BlueskySummary | undefined>()

  const applyCount = (url: string, count: number | null | undefined): void => {
    applyProviderResult(url, count, hatena, renderer.renderCount)
  }
  const applyHnSummary = (url: string, summary: HackerNewsSummary | null | undefined): void => {
    applyProviderResult(url, summary, hackerNews, renderer.renderHnSummary)
  }
  const applyBlueskySummary = (url: string, summary: BlueskySummary | undefined): void => {
    applyProviderResult(url, summary, bluesky, renderer.renderBlueskySummary)
  }

  function requestQueuedTargets(
    urlsToRequest: string[],
    hnUrlsToRequest: string[],
    blueskyUrlsToRequest: string[]
  ): void {
    if (urlsToRequest.length) {
      deps.requestHatenaCounts(urlsToRequest, applyCount, (url) => hatena.inflight.delete(url))
    }
    if (hnUrlsToRequest.length) {
      deps.requestHnSummaries(hnUrlsToRequest, applyHnSummary, (url) =>
        hackerNews.inflight.delete(url)
      )
    }
    if (blueskyUrlsToRequest.length) {
      deps.requestBlueskySummaries(blueskyUrlsToRequest, applyBlueskySummary, (url) =>
        bluesky.inflight.delete(url)
      )
    }
  }

  function retryUnknownTargets(): void {
    const urlsToRequest: string[] = []
    const hnUrlsToRequest: string[] = []
    const blueskyUrlsToRequest: string[] = []

    targetStates.forEach((state) => {
      if (state.hatena === "unknown") {
        state.hatena = "pending"
        queueProviderTarget<number | null | undefined>(
          state.target,
          hatena,
          renderer.renderCount,
          urlsToRequest
        )
      }
      if (state.hackerNews === "unknown") {
        state.hackerNews = "pending"
        queueProviderTarget<HackerNewsSummary | null | undefined>(
          state.target,
          hackerNews,
          renderer.renderHnSummary,
          hnUrlsToRequest
        )
      }
      if (state.bluesky === "unknown") {
        state.bluesky = "pending"
        queueProviderTarget<BlueskySummary | undefined>(
          state.target,
          bluesky,
          renderer.renderBlueskySummary,
          blueskyUrlsToRequest
        )
      }
    })

    requestQueuedTargets(urlsToRequest, hnUrlsToRequest, blueskyUrlsToRequest)
  }

  function queueTargets(targets: SearchResultTarget[]): void {
    const urlsToRequest: string[] = []
    const hnUrlsToRequest: string[] = []
    const blueskyUrlsToRequest: string[] = []

    targets.forEach((target) => {
      targetStates.set(target.container, {
        target,
        hatena: "pending",
        hackerNews: "pending",
        bluesky: "pending"
      })
      queueProviderTarget<number | null | undefined>(
        target,
        hatena,
        renderer.renderCount,
        urlsToRequest
      )
      queueProviderTarget<HackerNewsSummary | null | undefined>(
        target,
        hackerNews,
        renderer.renderHnSummary,
        hnUrlsToRequest
      )
      queueProviderTarget<BlueskySummary | undefined>(
        target,
        bluesky,
        renderer.renderBlueskySummary,
        blueskyUrlsToRequest
      )
    })

    requestQueuedTargets(urlsToRequest, hnUrlsToRequest, blueskyUrlsToRequest)
  }

  return { queueTargets, retryUnknownTargets }
}

export function createSignalPipeline(deps: SignalPipelineDeps): SignalPipeline {
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
  const signalRequests = createSignalRequestCoordinator(deps, renderer, targetStates)

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

  const queueTargets = (targets: SearchResultTarget[]): void => {
    signalRequests.queueTargets(targets)
  }

  queueTargets.setFilterEnabled = (enabled: boolean): void => {
    const wasEnabled = filterEnabled
    filterEnabled = enabled
    targetStates.forEach(renderer.applyFilter)
    if (enabled && !wasEnabled) {
      signalRequests.retryUnknownTargets()
    }
  }

  return queueTargets
}
