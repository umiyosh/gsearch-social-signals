import type { SearchResultTarget } from "./searchResults"
import type { HatenaBookmarkSummary } from "../shared/hatena"
import type { HackerNewsSummary } from "../shared/hackerNews"
import { DATA_ATTR } from "../shared/url"
import { insertBadge, insertHnBadge, type BadgeHoverHandlers } from "./badges"
import { requestEntryBookmarks, requestHatenaCounts, requestHnSummaries } from "./messaging"
import {
  beginOverlaySession,
  cancelOverlayHide,
  presentOverlay,
  scheduleOverlayHide
} from "./overlay"

const urlTargets = new Map<string, SearchResultTarget[]>()
const cachedCounts = new Map<string, number | null>()
const inflightUrls = new Set<string>()
const hnTargets = new Map<string, SearchResultTarget[]>()
const cachedHnSummaries = new Map<string, HackerNewsSummary | null>()
const hnInflight = new Set<string>()
const entryPreviewCache = new Map<string, HatenaBookmarkSummary[] | null>()
const entryPreviewRequests = new Map<string, Promise<HatenaBookmarkSummary[] | null>>()

const badgeHover: BadgeHoverHandlers = {
  onEnter: (badge, url) => {
    cancelOverlayHide()
    void handleBadgeHover(badge, url)
  },
  onLeave: () => {
    scheduleOverlayHide()
  }
}

async function handleBadgeHover(badge: HTMLAnchorElement, url: string): Promise<void> {
  beginOverlaySession(url, badge)

  if (entryPreviewCache.has(url)) {
    presentOverlay(url, badge, entryPreviewCache.get(url) ?? null)
    return
  }

  let previews: HatenaBookmarkSummary[] | null = null
  try {
    previews = await getEntryPreviews(url)
  } finally {
    entryPreviewCache.set(url, previews ?? null)
  }

  presentOverlay(url, badge, previews)
}

async function getEntryPreviews(url: string): Promise<HatenaBookmarkSummary[] | null> {
  let pending = entryPreviewRequests.get(url)
  if (!pending) {
    pending = requestEntryBookmarks(url)
    entryPreviewRequests.set(url, pending)
  }

  const result = await pending
  entryPreviewRequests.delete(url)
  return result
}

function applyCount(url: string, count: number | null | undefined): void {
  if (typeof count === "number" && count > 0) {
    cachedCounts.set(url, count)
  } else {
    cachedCounts.set(url, count ?? 0)
  }

  const targets = urlTargets.get(url) ?? []
  targets.forEach((target) => {
    if (typeof count === "number" && count > 0) {
      insertBadge(target, count, badgeHover)
    } else {
      target.container.setAttribute(DATA_ATTR, "done")
    }
  })
  urlTargets.delete(url)
}

function applyHnSummary(url: string, summary: HackerNewsSummary | null | undefined): void {
  cachedHnSummaries.set(url, summary ?? null)
  const targets = hnTargets.get(url) ?? []
  if (summary && summary.nbHits > 0) {
    targets.forEach((target) => {
      insertHnBadge(target, summary)
    })
  }
  hnTargets.delete(url)
}

export function queueTargets(targets: SearchResultTarget[]): void {
  const urlsToRequest: string[] = []
  const hnUrlsToRequest: string[] = []

  targets.forEach((target) => {
    const list = urlTargets.get(target.url) ?? []
    list.push(target)
    urlTargets.set(target.url, list)

    const hnList = hnTargets.get(target.url) ?? []
    hnList.push(target)
    hnTargets.set(target.url, hnList)

    const cached = cachedCounts.get(target.url)
    if (cached !== undefined) {
      if (typeof cached === "number" && cached > 0) {
        insertBadge(target, cached, badgeHover)
      } else {
        target.container.setAttribute(DATA_ATTR, "done")
      }
    } else if (!inflightUrls.has(target.url)) {
      inflightUrls.add(target.url)
      urlsToRequest.push(target.url)
    }

    const hnCached = cachedHnSummaries.get(target.url)
    if (hnCached !== undefined) {
      if (hnCached && hnCached.nbHits > 0) {
        insertHnBadge(target, hnCached)
      }
    } else if (!hnInflight.has(target.url)) {
      hnInflight.add(target.url)
      hnUrlsToRequest.push(target.url)
    }
  })

  if (urlsToRequest.length) {
    requestHatenaCounts(urlsToRequest, applyCount, (url) => inflightUrls.delete(url))
  }

  if (hnUrlsToRequest.length) {
    requestHnSummaries(hnUrlsToRequest, applyHnSummary, (url) => hnInflight.delete(url))
  }
}
