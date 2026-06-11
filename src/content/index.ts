import { discoverSearchResults, type SearchResultTarget } from "./searchResults"
import { requestEntryBookmarks, requestHatenaCounts, requestHnSummaries } from "./messaging"
import { DATA_ATTR, buildHatenaEntryUrl } from "../shared/url"
import type { HatenaBookmarkSummary } from "../shared/hatena"
import type { HackerNewsSummary } from "../shared/hackerNews"

const BADGE_CONTAINER_CLASS = "gsplus-signal-container"
const BADGE_CLASS = "gsplus-hatebu-count"
const BADGE_ICON_CLASS = "gsplus-hatebu-count__icon"
const BADGE_TEXT_CLASS = "gsplus-hatebu-count__text"
const BADGE_BOUND_ATTR = "data-gsplus-badge-bound"
const HN_BADGE_CLASS = "gsplus-hn-count"
const HN_BADGE_ICON_CLASS = "gsplus-hn-count__icon"
const HN_BADGE_TEXT_CLASS = "gsplus-hn-count__text"
const STYLE_ELEMENT_ID = "gsplus-hatebu-style"
const HATENA_FAVICON = "https://b.hatena.ne.jp/favicon.ico"
const HN_FAVICON = "https://news.ycombinator.com/favicon.ico"
const OVERLAY_CLASS = "gsplus-hatebu-overlay"
const OVERLAY_BODY_CLASS = "gsplus-hatebu-overlay__body"
const OVERLAY_USER_CLASS = "gsplus-hatebu-overlay__user"
const OVERLAY_COMMENT_CLASS = "gsplus-hatebu-overlay__comment"
const OVERLAY_EMPTY_CLASS = "gsplus-hatebu-overlay__empty"
const OVERLAY_ID = "gsplus-hatebu-overlay"

const urlTargets = new Map<string, SearchResultTarget[]>()
const cachedCounts = new Map<string, number | null>()
const inflightUrls = new Set<string>()
const hnTargets = new Map<string, SearchResultTarget[]>()
const cachedHnSummaries = new Map<string, HackerNewsSummary | null>()
const hnInflight = new Set<string>()
const entryPreviewCache = new Map<string, HatenaBookmarkSummary[] | null>()
const entryPreviewRequests = new Map<string, Promise<HatenaBookmarkSummary[] | null>>()
let overlayActiveUrl: string | null = null
let overlayHover = false
let overlayHideTimeout: number | null = null

function ensureStyles(): void {
  if (document.getElementById(STYLE_ELEMENT_ID)) {
    return
  }

  const style = document.createElement("style")
  style.id = STYLE_ELEMENT_ID
  style.textContent = `
    .${BADGE_CLASS} {
      font-size: 0.85rem;
      color: #00a4de;
      margin-left: 0.5rem;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      text-decoration: none;
    }

    .${BADGE_ICON_CLASS} {
      width: 14px;
      height: 14px;
      border-radius: 2px;
      display: inline-block;
    }

    .${BADGE_TEXT_CLASS} {
      line-height: 1;
    }

    .${HN_BADGE_CLASS} {
      font-size: 0.82rem;
      color: #ff6600;
      margin-left: 0.35rem;
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      text-decoration: none;
    }

    .${HN_BADGE_ICON_CLASS} {
      width: 12px;
      height: 12px;
    }

    .${HN_BADGE_TEXT_CLASS} {
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .${BADGE_CONTAINER_CLASS} {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      margin-bottom: 0.2rem;
      direction: ltr;
    }
    .${OVERLAY_CLASS} {
      position: absolute;
      z-index: 2147483647;
      background: #fff;
      color: #202124;
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
      padding: 0.75rem;
      max-width: 320px;
      width: max-content;
      min-width: 220px;
      font-size: 0.8rem;
      line-height: 1.4;
      display: none;
    }

    .${OVERLAY_BODY_CLASS} {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      max-height: 320px;
      overflow-y: auto;
    }

    .${OVERLAY_CLASS} ul {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .${OVERLAY_CLASS} li {
      border-top: 1px solid #e0e0e0;
      padding-top: 0.5rem;
    }

    .${OVERLAY_CLASS} li:first-child {
      border-top: none;
      padding-top: 0;
    }

    .${OVERLAY_USER_CLASS} {
      font-weight: 600;
      color: #1a73e8;
    }

    .${OVERLAY_COMMENT_CLASS} {
      margin-top: 0.15rem;
      color: #202124;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .${OVERLAY_EMPTY_CLASS} {
      color: #5f6368;
      font-style: italic;
    }
  `
  document.head.appendChild(style)
}

function getSignalContainer(target: SearchResultTarget): HTMLElement {
  const host =
    target.anchor.closest<HTMLElement>(".b8lM7") ??
    target.anchor.closest<HTMLElement>(".yuRUbf") ??
    target.anchor.parentElement ??
    target.container
  let container = host.querySelector<HTMLElement>(`.${BADGE_CONTAINER_CLASS}`)
  if (!container) {
    container = document.createElement("span")
    container.className = BADGE_CONTAINER_CLASS
    if (target.anchor.parentElement === host) {
      host.insertBefore(container, target.anchor)
    } else {
      host.insertAdjacentElement("afterbegin", container)
    }
  }
  return container
}

function insertBadge(target: SearchResultTarget, count: number): void {
  const container = getSignalContainer(target)
  let badge = container.querySelector<HTMLAnchorElement>(`.${BADGE_CLASS}`)

  if (!badge) {
    badge = document.createElement("a")
    badge.className = BADGE_CLASS
    badge.target = "_blank"
    badge.rel = "noopener noreferrer"
    container.appendChild(badge)
  }

  badge.href = buildHatenaEntryUrl(target.url)

  let icon = badge.querySelector<HTMLImageElement>(`.${BADGE_ICON_CLASS}`)
  if (!icon) {
    icon = document.createElement("img")
    icon.className = BADGE_ICON_CLASS
    icon.src = HATENA_FAVICON
    icon.alt = "Hatena"
    icon.width = 14
    icon.height = 14
    icon.decoding = "async"
    icon.loading = "lazy"
    badge.appendChild(icon)
  }

  let text = badge.querySelector<HTMLElement>(`.${BADGE_TEXT_CLASS}`)
  if (!text) {
    text = document.createElement("span")
    text.className = BADGE_TEXT_CLASS
    badge.appendChild(text)
  }

  text.textContent = `${count} users`
  attachBadgeEvents(badge, target.url)
  target.container.setAttribute(DATA_ATTR, "rendered")
}

function insertHnBadge(target: SearchResultTarget, summary: HackerNewsSummary): void {
  const container = getSignalContainer(target)
  let badge = container.querySelector<HTMLAnchorElement>(`.${HN_BADGE_CLASS}`)
  if (!badge) {
    badge = document.createElement("a")
    badge.className = HN_BADGE_CLASS
    badge.target = "_blank"
    badge.rel = "noopener noreferrer"
    container.appendChild(badge)
  }

  badge.href = buildHnSearchUrl(target.url)

  let icon = badge.querySelector<HTMLImageElement>(`.${HN_BADGE_ICON_CLASS}`)
  if (!icon) {
    icon = document.createElement("img")
    icon.className = HN_BADGE_ICON_CLASS
    icon.src = HN_FAVICON
    icon.alt = "Hacker News"
    icon.width = 12
    icon.height = 12
    icon.decoding = "async"
    icon.loading = "lazy"
    badge.prepend(icon)
  }

  let text = badge.querySelector<HTMLElement>(`.${HN_BADGE_TEXT_CLASS}`)
  if (!text) {
    text = document.createElement("span")
    text.className = HN_BADGE_TEXT_CLASS
    badge.appendChild(text)
  }

  text.textContent = `HN ${summary.nbHits} posts`
}

function attachBadgeEvents(badge: HTMLAnchorElement, url: string): void {
  if (badge.getAttribute(BADGE_BOUND_ATTR) === "true") {
    return
  }

  const enter = () => {
    cancelOverlayHide()
    void handleBadgeHover(badge, url)
  }
  const leave = () => {
    scheduleOverlayHide()
  }

  badge.addEventListener("mouseenter", enter)
  badge.addEventListener("focus", enter)
  badge.addEventListener("mouseleave", leave)
  badge.addEventListener("blur", leave)

  badge.setAttribute(BADGE_BOUND_ATTR, "true")
}

async function handleBadgeHover(badge: HTMLAnchorElement, url: string): Promise<void> {
  overlayActiveUrl = url
  showOverlayLoading(badge)

  if (entryPreviewCache.has(url)) {
    const cached = entryPreviewCache.get(url)
    showOverlayWithComments(badge, cached ?? null)
    return
  }

  let previews: HatenaBookmarkSummary[] | null = null
  try {
    previews = await getEntryPreviews(url)
  } finally {
    entryPreviewCache.set(url, previews ?? null)
  }

  if (overlayActiveUrl !== url) {
    return
  }

  showOverlayWithComments(badge, previews)
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

function ensureOverlay(): HTMLDivElement {
  let overlay = document.getElementById(OVERLAY_ID) as HTMLDivElement | null
  if (!overlay) {
    overlay = document.createElement("div")
    overlay.id = OVERLAY_ID
    overlay.className = OVERLAY_CLASS
    const body = document.createElement("div")
    body.className = OVERLAY_BODY_CLASS
    overlay.appendChild(body)
    document.body.appendChild(overlay)

    window.addEventListener(
      "scroll",
      () => {
        if (overlayHover) {
          return
        }
        hideOverlayImmediately()
      },
      true
    )
    window.addEventListener("blur", hideOverlayImmediately)
    overlay.addEventListener("mouseenter", () => {
      overlayHover = true
      cancelOverlayHide()
    })
    overlay.addEventListener("mouseleave", () => {
      overlayHover = false
      scheduleOverlayHide()
    })
  }
  return overlay
}

function hideOverlayImmediately(): void {
  const overlay = document.getElementById(OVERLAY_ID)
  if (overlay) {
    overlay.style.display = "none"
  }
  overlayActiveUrl = null
}

function scheduleOverlayHide(): void {
  cancelOverlayHide()
  overlayHideTimeout = window.setTimeout(() => {
    if (!overlayHover) {
      hideOverlayImmediately()
    }
  }, 150)
}

function cancelOverlayHide(): void {
  if (overlayHideTimeout !== null) {
    window.clearTimeout(overlayHideTimeout)
    overlayHideTimeout = null
  }
}

function showOverlayLoading(badge: HTMLElement): void {
  const overlay = ensureOverlay()
  const body = overlay.querySelector(`.${OVERLAY_BODY_CLASS}`)
  if (body) {
    body.textContent = "読み込み中..."
  }
  positionOverlay(badge, overlay)
  overlay.style.display = "block"
}

function showOverlayWithComments(
  badge: HTMLElement,
  bookmarks: HatenaBookmarkSummary[] | null
): void {
  const overlay = ensureOverlay()
  const body = overlay.querySelector(`.${OVERLAY_BODY_CLASS}`)
  if (!body) {
    return
  }

  body.textContent = ""

  if (bookmarks === null) {
    const error = document.createElement("p")
    error.className = OVERLAY_EMPTY_CLASS
    error.textContent = "はてなブックマークの取得に失敗しました"
    body.appendChild(error)
  } else if (bookmarks.length === 0) {
    const empty = document.createElement("p")
    empty.className = OVERLAY_EMPTY_CLASS
    empty.textContent = "はてなブックマークにコメントはまだありません"
    body.appendChild(empty)
  } else {
    const list = document.createElement("ul")
    bookmarks.forEach((bookmark) => {
      const item = document.createElement("li")
      const user = document.createElement("span")
      user.className = OVERLAY_USER_CLASS
      user.textContent = bookmark.user
      const comment = document.createElement("span")
      comment.className = OVERLAY_COMMENT_CLASS
      comment.textContent = bookmark.comment
      item.appendChild(user)
      item.appendChild(comment)
      list.appendChild(item)
    })
    body.appendChild(list)
  }

  positionOverlay(badge, overlay)
  overlay.style.display = "block"
}

function positionOverlay(reference: HTMLElement, overlay: HTMLElement): void {
  const rect = reference.getBoundingClientRect()
  const top = window.scrollY + rect.bottom + 8
  const left = window.scrollX + rect.left
  overlay.style.top = `${top}px`
  overlay.style.left = `${left}px`
}

function buildHnSearchUrl(url: string): string {
  const encoded = encodeURIComponent(url)
  return `https://hn.algolia.com/?query=${encoded}&type=story&sort=byPopularity`
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
      insertBadge(target, count)
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

function queueTargets(targets: SearchResultTarget[]): void {
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
        insertBadge(target, cached)
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

function scan(root: ParentNode = document): void {
  const targets = discoverSearchResults(root)
  if (targets.length) {
    queueTargets(targets)
  }
}

function boot(): void {
  ensureStyles()
  scan(document)

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement || node instanceof DocumentFragment) {
          scan(node)
        }
      })
    }
  })

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true })
  }
}

void boot()
