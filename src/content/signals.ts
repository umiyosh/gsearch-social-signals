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
    apply: (url: string, summary: BlueskySummary | undefined, retryAfterMs?: number) => void,
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
type SignalProvider = "hatena" | "hackerNews" | "bluesky"

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

const UNKNOWN_SIGNAL_RETRY_DELAYS_MS = [2_000, 10_000, 50_000, 60_000] as const

function createUnknownSignalRetryController(
  isFilterEnabled: () => boolean,
  retryUrls: (urls: readonly string[]) => void
) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const attempts = new Map<string, number>()
  const dueAtByUrl = new Map<string, number>()

  function armTimer(): void {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
    if (!isFilterEnabled() || dueAtByUrl.size === 0) {
      return
    }

    const now = Date.now()
    const nextDueAt = Math.min(...dueAtByUrl.values())
    timer = setTimeout(
      () => {
        timer = undefined
        const retryableUrls = [...dueAtByUrl.entries()]
          .filter(([, dueAt]) => dueAt <= Date.now())
          .map(([url]) => url)
        retryableUrls.forEach((url) => dueAtByUrl.delete(url))
        if (isFilterEnabled() && retryableUrls.length > 0) {
          retryUrls(retryableUrls)
        }
        armTimer()
      },
      Math.max(0, nextDueAt - now)
    )
  }

  function schedule(url: string, retryAfterMs?: number): void {
    if (!isFilterEnabled()) {
      return
    }

    let delay = retryAfterMs
    if (delay === undefined) {
      const attempt = attempts.get(url) ?? 0
      if (attempt >= UNKNOWN_SIGNAL_RETRY_DELAYS_MS.length) {
        return
      }
      delay = UNKNOWN_SIGNAL_RETRY_DELAYS_MS[attempt]
      attempts.set(url, attempt + 1)
    }
    dueAtByUrl.set(url, Date.now() + Math.max(0, delay ?? 0))
    armTimer()
  }

  function clear(url: string): void {
    attempts.delete(url)
    dueAtByUrl.delete(url)
    armTimer()
  }

  function reset(): void {
    attempts.clear()
    dueAtByUrl.clear()
    if (timer === undefined) {
      return
    }
    clearTimeout(timer)
    timer = undefined
  }

  return { schedule, clear, reset }
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

function queueUnknownProviderTargets<T>(options: {
  targetStates: Iterable<TargetSignalState>
  provider: SignalProvider
  state: ProviderPipelineState<T>
  render: (target: SearchResultTarget, value: T | undefined) => void
  urlsToRequest: string[]
  allowedUrls?: ReadonlySet<string> | undefined
}): void {
  const { targetStates, provider, state, render, urlsToRequest, allowedUrls } = options
  for (const targetState of targetStates) {
    if (
      !targetState.target.container.isConnected ||
      targetState[provider] !== "unknown" ||
      (allowedUrls !== undefined && !allowedUrls.has(targetState.target.url))
    ) {
      continue
    }
    targetState[provider] = "pending"
    queueProviderTarget(targetState.target, state, render, urlsToRequest)
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

function createProviderResultApplier<T>(
  state: ProviderPipelineState<T>,
  render: (target: SearchResultTarget, value: T) => void,
  unknownRetry: ReturnType<typeof createUnknownSignalRetryController>
): (url: string, value: T, retryAfterMs?: number) => void {
  return (url, value, retryAfterMs) => {
    applyProviderResult(url, value, state, render)
    if (value === undefined) {
      unknownRetry.schedule(url, retryAfterMs)
    } else {
      unknownRetry.clear(url)
    }
  }
}

function createSignalRenderer(
  deps: SignalPipelineDeps,
  badgeHover: Parameters<SignalPipelineDeps["insertBadge"]>[2],
  targetStates: Map<HTMLElement, TargetSignalState>,
  isFilterEnabled: () => boolean
) {
  function applyFilter(state: TargetSignalState): void {
    const signals = [state.hatena, state.hackerNews, state.bluesky]
    const shouldHide =
      isFilterEnabled() && !signals.includes("pending") && !signals.includes("positive")
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

function createSignalResultAppliers(
  renderer: ReturnType<typeof createSignalRenderer>,
  hatena: ProviderPipelineState<number | null | undefined>,
  hackerNews: ProviderPipelineState<HackerNewsSummary | null | undefined>,
  bluesky: ProviderPipelineState<BlueskySummary | undefined>,
  unknownRetries: Record<SignalProvider, ReturnType<typeof createUnknownSignalRetryController>>
) {
  return {
    applyCount: createProviderResultApplier(hatena, renderer.renderCount, unknownRetries.hatena),
    applyHnSummary: createProviderResultApplier(
      hackerNews,
      renderer.renderHnSummary,
      unknownRetries.hackerNews
    ),
    applyBlueskySummary: createProviderResultApplier(
      bluesky,
      renderer.renderBlueskySummary,
      unknownRetries.bluesky
    )
  }
}

function createSignalRequestDispatcher(
  deps: SignalPipelineDeps,
  states: {
    hatena: ProviderPipelineState<number | null | undefined>
    hackerNews: ProviderPipelineState<HackerNewsSummary | null | undefined>
    bluesky: ProviderPipelineState<BlueskySummary | undefined>
  },
  appliers: ReturnType<typeof createSignalResultAppliers>
) {
  function settleProvider<T>(url: string, provider: ProviderPipelineState<T>): void {
    provider.inflight.delete(url)
  }

  return (hatenaUrls: string[], hnUrls: string[], blueskyUrls: string[]): void => {
    if (hatenaUrls.length) {
      deps.requestHatenaCounts(hatenaUrls, appliers.applyCount, (url) =>
        settleProvider(url, states.hatena)
      )
    }
    if (hnUrls.length) {
      deps.requestHnSummaries(hnUrls, appliers.applyHnSummary, (url) =>
        settleProvider(url, states.hackerNews)
      )
    }
    if (blueskyUrls.length) {
      deps.requestBlueskySummaries(blueskyUrls, appliers.applyBlueskySummary, (url) =>
        settleProvider(url, states.bluesky)
      )
    }
  }
}

function createSignalRequestCoordinator(
  deps: SignalPipelineDeps,
  renderer: ReturnType<typeof createSignalRenderer>,
  targetStates: Map<HTMLElement, TargetSignalState>,
  isFilterEnabled: () => boolean
) {
  const hatena = createProviderPipelineState<number | null | undefined>()
  const hackerNews = createProviderPipelineState<HackerNewsSummary | null | undefined>()
  const bluesky = createProviderPipelineState<BlueskySummary | undefined>()

  const unknownRetries = {
    hatena: createUnknownSignalRetryController(isFilterEnabled, (urls) =>
      retryUnknownTargets("hatena", urls)
    ),
    hackerNews: createUnknownSignalRetryController(isFilterEnabled, (urls) =>
      retryUnknownTargets("hackerNews", urls)
    ),
    bluesky: createUnknownSignalRetryController(isFilterEnabled, (urls) =>
      retryUnknownTargets("bluesky", urls)
    )
  }

  const appliers = createSignalResultAppliers(renderer, hatena, hackerNews, bluesky, unknownRetries)
  const requestQueuedTargets = createSignalRequestDispatcher(
    deps,
    { hatena, hackerNews, bluesky },
    appliers
  )

  function retryUnknownTargets(onlyProvider?: SignalProvider, onlyUrls?: readonly string[]): void {
    const urlsToRequest: string[] = []
    const hnUrlsToRequest: string[] = []
    const blueskyUrlsToRequest: string[] = []
    const allowedUrls = onlyUrls === undefined ? undefined : new Set(onlyUrls)

    if (onlyProvider === undefined || onlyProvider === "hatena") {
      queueUnknownProviderTargets<number | null | undefined>({
        targetStates: targetStates.values(),
        provider: "hatena",
        state: hatena,
        render: renderer.renderCount,
        urlsToRequest,
        allowedUrls
      })
    }
    if (onlyProvider === undefined || onlyProvider === "hackerNews") {
      queueUnknownProviderTargets<HackerNewsSummary | null | undefined>({
        targetStates: targetStates.values(),
        provider: "hackerNews",
        state: hackerNews,
        render: renderer.renderHnSummary,
        urlsToRequest: hnUrlsToRequest,
        allowedUrls
      })
    }
    if (onlyProvider === undefined || onlyProvider === "bluesky") {
      queueUnknownProviderTargets<BlueskySummary | undefined>({
        targetStates: targetStates.values(),
        provider: "bluesky",
        state: bluesky,
        render: renderer.renderBlueskySummary,
        urlsToRequest: blueskyUrlsToRequest,
        allowedUrls
      })
    }

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

  return {
    queueTargets,
    retryUnknownTargets: (resetBackoff = false): void => {
      if (resetBackoff) {
        Object.values(unknownRetries).forEach((retry) => retry.reset())
      }
      retryUnknownTargets()
    }
  }
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
  const signalRequests = createSignalRequestCoordinator(
    deps,
    renderer,
    targetStates,
    () => filterEnabled
  )

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
      signalRequests.retryUnknownTargets(true)
    }
  }

  return queueTargets
}
