import { discoverSearchResults, type SearchResultTarget } from "./searchResults"
import {
  MESSAGE_TYPES,
  type HatenaCountsResponse,
  isHatenaCountsResponse
} from "../shared/messages"
import { DATA_ATTR } from "../shared/url"

const BADGE_CLASS = "gsplus-hatebu-count"
const BADGE_ICON_CLASS = "gsplus-hatebu-count__icon"
const BADGE_TEXT_CLASS = "gsplus-hatebu-count__text"
const STYLE_ELEMENT_ID = "gsplus-hatebu-style"
const HATENA_FAVICON = "https://b.hatena.ne.jp/favicon.ico"

const urlTargets = new Map<string, SearchResultTarget[]>()
const cachedCounts = new Map<string, number | null>()
const inflightUrls = new Set<string>()

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
  `
  document.head.appendChild(style)
}

function insertBadge(target: SearchResultTarget, count: number): void {
  const host =
    target.anchor.closest<HTMLElement>(".b8lM7") ??
    target.anchor.closest<HTMLElement>(".yuRUbf") ??
    target.anchor.parentElement ??
    target.container
  let badge = host.querySelector<HTMLElement>(`.${BADGE_CLASS}`)

  if (!badge) {
    badge = document.createElement("span")
    badge.className = BADGE_CLASS
    host.appendChild(badge)
  }

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
  target.container.setAttribute(DATA_ATTR, "rendered")
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

function requestCounts(urls: string[]): void {
  if (!urls.length) {
    return
  }

  const request = { type: MESSAGE_TYPES.REQUEST, urls }
  chrome.runtime.sendMessage(request, (response: HatenaCountsResponse | undefined) => {
    urls.forEach((url) => inflightUrls.delete(url))

    if (chrome.runtime.lastError) {
      console.error("Failed to retrieve Hatena counts", chrome.runtime.lastError)
      return
    }

    if (!isHatenaCountsResponse(response)) {
      console.warn("Unexpected Hatena response", response)
      return
    }

    ;(Object.entries(response.counts) as Array<[string, number | null]>).forEach(([url, count]) => {
      applyCount(url, count)
    })

    urls
      .filter((url) => !(url in response.counts))
      .forEach((url) => applyCount(url, null))
  })
}

function queueTargets(targets: SearchResultTarget[]): void {
  const urlsToRequest: string[] = []

  targets.forEach((target) => {
    const list = urlTargets.get(target.url) ?? []
    list.push(target)
    urlTargets.set(target.url, list)

    const cached = cachedCounts.get(target.url)
    if (cached !== undefined) {
      if (typeof cached === "number" && cached > 0) {
        insertBadge(target, cached)
      } else {
        target.container.setAttribute(DATA_ATTR, "done")
      }
      return
    }

    if (!inflightUrls.has(target.url)) {
      inflightUrls.add(target.url)
      urlsToRequest.push(target.url)
    }
  })

  if (urlsToRequest.length) {
    requestCounts(urlsToRequest)
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
