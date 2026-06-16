import type { SearchResultTarget } from "./searchResults"
import type { HackerNewsSummary } from "../shared/hackerNews"
import { DATA_ATTR, buildHatenaEntryUrl } from "../shared/url"
import {
  BADGE_CLASS,
  BADGE_CONTAINER_CLASS,
  BADGE_ICON_CLASS,
  BADGE_TEXT_CLASS,
  HN_BADGE_CLASS,
  HN_BADGE_ICON_CLASS,
  HN_BADGE_TEXT_CLASS
} from "./styles"

const BADGE_BOUND_ATTR = "data-gsplus-badge-bound"
const HATENA_FAVICON = "https://b.hatena.ne.jp/favicon.ico"
const HN_FAVICON = "https://news.ycombinator.com/favicon.ico"

export interface BadgeHoverHandlers {
  onEnter: (badge: HTMLAnchorElement, url: string) => void
  onLeave: () => void
}

function getSignalContainer(target: SearchResultTarget): HTMLElement {
  // Google SERP のタイトル周辺レイアウト (.b8lM7 / .yuRUbf) を優先してバッジを
  // タイトル直前に置く。どちらも無い場合は anchor の親へフォールバックする。
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

export function insertBadge(
  target: SearchResultTarget,
  count: number,
  hover: BadgeHoverHandlers
): void {
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
  attachBadgeEvents(badge, target.url, hover)
  target.container.setAttribute(DATA_ATTR, "rendered")
}

export function insertHnBadge(target: SearchResultTarget, summary: HackerNewsSummary): void {
  const container = getSignalContainer(target)
  let badge = container.querySelector<HTMLAnchorElement>(`.${HN_BADGE_CLASS}`)
  if (!badge) {
    badge = document.createElement("a")
    badge.className = HN_BADGE_CLASS
    badge.target = "_blank"
    badge.rel = "noopener noreferrer"
    container.appendChild(badge)
  }

  badge.href = summary.topStoryUrl ?? buildHnSearchUrl(target.url)
  badge.title = `${summary.nbHits} posts / top ${summary.maxPoints ?? 0} pts / ${
    summary.maxComments ?? 0
  } comments`

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

  text.textContent = `HN ${summary.maxPoints ?? 0} pts`
}

function attachBadgeEvents(badge: HTMLAnchorElement, url: string, hover: BadgeHoverHandlers): void {
  if (badge.getAttribute(BADGE_BOUND_ATTR) === "true") {
    return
  }

  const enter = () => {
    hover.onEnter(badge, url)
  }
  const leave = () => {
    hover.onLeave()
  }

  badge.addEventListener("mouseenter", enter)
  badge.addEventListener("focus", enter)
  badge.addEventListener("mouseleave", leave)
  badge.addEventListener("blur", leave)

  badge.setAttribute(BADGE_BOUND_ATTR, "true")
}

function buildHnSearchUrl(url: string): string {
  const encoded = encodeURIComponent(url)
  return `https://hn.algolia.com/?query=${encoded}&type=story&sort=byPopularity`
}
