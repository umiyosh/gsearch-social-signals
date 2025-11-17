[2m2025-11-17T11:41:42.730621Z[0m [34mDEBUG[0m Skipping ignored file: package-lock.json
>>>> src/shared/hatena.ts
import {
  normalizeRequestUrl,
  normalizeUrl,
  normalizeForComparison,
  stripQueryString
} from "./url"

export type HatenaCountMap = Record<string, number | null>

export interface HatenaBookmarkSummary {
  user: string
  comment: string
  timestamp?: string
  permalink?: string
}

const API_ENDPOINT = "https://bookmark.hatenaapis.com/count/entries"
const MAX_BATCH_SIZE = 50
const ENTRY_ENDPOINT = "https://b.hatena.ne.jp/entry/jsonlite/"

export function chunkArray<T>(values: readonly T[], size: number): T[][] {
  if (size <= 0) {
    throw new Error("chunk size must be positive")
  }

  const chunks: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
  return chunks
}

async function requestChunk(urls: readonly string[]): Promise<HatenaCountMap> {
  if (urls.length === 0) {
    return {}
  }

  const endpoint = new URL(API_ENDPOINT)
  urls.forEach((url) => endpoint.searchParams.append("url", url))

  const response = await fetch(endpoint.toString(), {
    method: "GET",
    cache: "no-cache"
  })

  if (!response.ok) {
    throw new Error(`Hatena API responded with ${response.status}`)
  }

  const payloadText = await response.text()
  let parsed: Record<string, number | string>
  try {
    parsed = JSON.parse(payloadText) as Record<string, number | string>
  } catch (error) {
    console.error("Failed to parse Hatena API response", error)
    throw error
  }

  return Object.fromEntries(
    Object.entries(parsed).map(([key, value]) => [key, typeof value === "number" ? value : Number(value) || 0])
  )
}

export async function fetchHatenaCounts(urls: readonly string[]): Promise<HatenaCountMap> {
  const uniqueUrls = [...new Set(urls)]
  const normalizedRequestMap = new Map<string, string>()
  uniqueUrls.forEach((originalUrl) => {
    normalizedRequestMap.set(originalUrl, normalizeRequestUrl(originalUrl))
  })
  const counts: HatenaCountMap = {}

  const normalizedUrls = uniqueUrls.map((url) => normalizedRequestMap.get(url) ?? url)
  const batches = chunkArray(normalizedUrls, MAX_BATCH_SIZE)
  for (const batch of batches) {
    try {
      const chunkCounts = await requestChunk(batch)
      const normalizedMap = new Map<string, number>()
      Object.entries(chunkCounts).forEach(([key, value]) => {
        normalizedMap.set(normalizeForComparison(key), value ?? 0)
      })

      uniqueUrls.forEach((requestedUrl) => {
        const normalizedRequest = normalizeForComparison(
          normalizedRequestMap.get(requestedUrl) ?? requestedUrl
        )

        const candidates: string[] = [normalizedRequest]
        const flippedProtocol = normalizedRequest.startsWith("https://")
          ? normalizedRequest.replace("https://", "http://")
          : normalizedRequest.replace("http://", "https://")
        candidates.push(flippedProtocol)
        candidates.push(stripQueryString(normalizedRequest))
        candidates.push(stripQueryString(flippedProtocol))

        const matchedCandidate = candidates.find((candidate) =>
          normalizedMap.has(candidate)
        )

        if (matchedCandidate) {
          counts[requestedUrl] = normalizedMap.get(matchedCandidate) ?? 0
        } else {
          counts[requestedUrl] = null
        }
      })
    } catch (error) {
      console.error("Hatena API chunk failed", error)
      batch.forEach((url) => {
        counts[url] = null
      })
    }
  }

  return counts
}

export async function fetchHatenaEntry(url: string): Promise<HatenaBookmarkSummary[]> {
  const normalized = normalizeUrl(url)
  if (!normalized) {
    return []
  }

  const endpoint = new URL(ENTRY_ENDPOINT)
  endpoint.searchParams.set("url", normalized)

  const response = await fetch(endpoint.toString(), {
    method: "GET",
    cache: "no-cache"
  })

  if (!response.ok) {
    throw new Error(`Hatena entry API failed with status ${response.status}`)
  }

  const payload = (await response.json()) as {
    bookmarks?: Array<{
      user?: string
      comment?: string
      timestamp?: string
      permalink?: string
    }>
  }

  const bookmarks = payload.bookmarks ?? []
  return bookmarks
    .filter((bookmark) => typeof bookmark?.comment === "string" && bookmark.comment.trim().length > 0)
    .map((bookmark) => ({
      user: bookmark.user ?? "anonymous",
      comment: bookmark.comment?.trim() ?? "",
      timestamp: bookmark.timestamp,
      permalink: bookmark.permalink
    }))
}

>>>> src/shared/url.ts
export const DATA_ATTR = "data-gsplus-hatebu"

const HTTP_PROTOCOLS = new Set(["http:", "https:"])

export function normalizeUrl(rawUrl: string): string | null {
  try {
    const normalized = new URL(rawUrl)
    if (!HTTP_PROTOCOLS.has(normalized.protocol)) {
      return null
    }
    normalized.hash = ""
    return normalized.toString()
  } catch {
    return null
  }
}

function isGoogleRedirect(url: URL): boolean {
  const host = url.hostname.toLowerCase()
  return host.startsWith("www.google.") && url.pathname === "/url"
}

function isGoogleProperty(url: URL): boolean {
  const host = url.hostname.toLowerCase()
  return host.startsWith("www.google.")
}

export function extractExternalUrlFromHref(href: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(href)
  } catch {
    return normalizeUrl(href)
  }

  if (isGoogleRedirect(parsed)) {
    const actual = parsed.searchParams.get("q") ?? parsed.searchParams.get("url")
    if (!actual) {
      return null
    }
    return normalizeUrl(actual)
  }

  if (isGoogleProperty(parsed)) {
    return null
  }

  return normalizeUrl(parsed.toString())
}

export function buildHatenaEntryUrl(targetUrl: string): string {
  const normalized = normalizeUrl(targetUrl)
  if (!normalized) {
    return "https://b.hatena.ne.jp/"
  }

  const target = new URL(normalized)
  const schemeSegment = target.protocol === "https:" ? "s" : "http"
  const basePath = `${target.hostname}${target.pathname}`
  const search = target.search ?? ""
  return `https://b.hatena.ne.jp/entry/${schemeSegment}/${basePath}${search}`
}

export function normalizeForComparison(url: string): string {
  const normalized = normalizeUrl(url)
  if (!normalized) {
    return url
  }

  const parsed = new URL(normalized)
  const scheme = parsed.protocol === "https:" ? "https://" : "http://"
  const hostname = parsed.hostname.toLowerCase()
  const pathname = parsed.pathname || "/"
  const search = parsed.search ?? ""
  return `${scheme}${hostname}${pathname}${search}`
}

export function stripQueryString(normalizedUrl: string): string {
  const queryIndex = normalizedUrl.indexOf("?")
  if (queryIndex === -1) {
    return normalizedUrl
  }
  return normalizedUrl.slice(0, queryIndex)
}

const TRACKING_QUERY_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "igshid",
  "gclid",
  "ref",
  "fbclid"
])

export function normalizeRequestUrl(url: string): string {
  const normalized = normalizeForComparison(url)
  const queryIndex = normalized.indexOf("?")
  if (queryIndex === -1) {
    return normalized
  }

  const base = normalized.slice(0, queryIndex)
  const params = new URLSearchParams(normalized.slice(queryIndex + 1))
  const filtered = new URLSearchParams()
  params.forEach((value, key) => {
    if (!TRACKING_QUERY_PARAMS.has(key.toLowerCase())) {
      filtered.append(key, value)
    }
  })

  const queryString = filtered.toString()
  return queryString ? `${base}?${queryString}` : base
}

>>>> src/shared/messages.ts
import type { HatenaBookmarkSummary } from "./hatena"

export const MESSAGE_TYPES = {
  COUNT_REQUEST: "GSPLUS_HATEBU_REQUEST_COUNTS",
  COUNT_RESPONSE: "GSPLUS_HATEBU_COUNTS_RESPONSE",
  ENTRY_REQUEST: "GSPLUS_HATEBU_REQUEST_ENTRY",
  ENTRY_RESPONSE: "GSPLUS_HATEBU_ENTRY_RESPONSE"
} as const

export type HatenaCountsRequest = {
  type: typeof MESSAGE_TYPES.COUNT_REQUEST
  urls: string[]
}

export type HatenaCountsResponse = {
  type: typeof MESSAGE_TYPES.COUNT_RESPONSE
  counts: Record<string, number | null>
}

export type HatenaEntryRequest = {
  type: typeof MESSAGE_TYPES.ENTRY_REQUEST
  url: string
}

export type HatenaEntryResponse = {
  type: typeof MESSAGE_TYPES.ENTRY_RESPONSE
  url: string
  bookmarks: HatenaBookmarkSummary[]
}

export type RuntimeMessage =
  | HatenaCountsRequest
  | HatenaCountsResponse
  | HatenaEntryRequest
  | HatenaEntryResponse

export function isHatenaCountsRequest(value: unknown): value is HatenaCountsRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: string }).type === MESSAGE_TYPES.COUNT_REQUEST &&
    Array.isArray((value as { urls?: unknown }).urls)
  )
}

export function isHatenaCountsResponse(value: unknown): value is HatenaCountsResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: string }).type === MESSAGE_TYPES.COUNT_RESPONSE &&
    typeof (value as { counts?: unknown }).counts === "object" &&
    (value as { counts?: unknown }).counts !== null
  )
}

export function isHatenaEntryRequest(value: unknown): value is HatenaEntryRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: string }).type === MESSAGE_TYPES.ENTRY_REQUEST &&
    typeof (value as { url?: unknown }).url === "string"
  )
}

export function isHatenaEntryResponse(value: unknown): value is HatenaEntryResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: string }).type === MESSAGE_TYPES.ENTRY_RESPONSE &&
    typeof (value as { url?: unknown }).url === "string" &&
    Array.isArray((value as { bookmarks?: unknown }).bookmarks)
  )
}

>>>> src/content/searchResults.ts
import { DATA_ATTR, extractExternalUrlFromHref } from "../shared/url"

export interface SearchResultTarget {
  container: HTMLElement
  anchor: HTMLAnchorElement
  url: string
}

const RESULT_CONTAINER_SELECTOR = [
  "div.g",
  "div.MjjYud",
  "div[data-sokoban-grid]",
  "div[jscontroller=\"SC7lYd\"]",
  "div[jscontroller=\"TFQHme\"]"
].join(", ")

function findPrimaryAnchor(container: HTMLElement): { anchor: HTMLAnchorElement; url: string } | null {
  const anchors = container.querySelectorAll<HTMLAnchorElement>("a[href]")
  for (const anchor of anchors) {
    const resolvedUrl = extractExternalUrlFromHref(anchor.href)
    if (resolvedUrl) {
      return { anchor, url: resolvedUrl }
    }
  }
  return null
}

export function discoverSearchResults(root: ParentNode): SearchResultTarget[] {
  const containers = root.querySelectorAll<HTMLElement>(RESULT_CONTAINER_SELECTOR)
  const targets: SearchResultTarget[] = []

  containers.forEach((container) => {
    if (container.getAttribute(DATA_ATTR)) {
      return
    }

    const candidate = findPrimaryAnchor(container)
    if (!candidate) {
      return
    }

    container.setAttribute(DATA_ATTR, "pending")
    targets.push({ container, anchor: candidate.anchor, url: candidate.url })
  })

  return targets
}

>>>> src/content/index.ts
import { discoverSearchResults, type SearchResultTarget } from "./searchResults"
import {
  MESSAGE_TYPES,
  type HatenaCountsResponse,
  type HatenaEntryResponse,
  isHatenaCountsResponse,
  isHatenaEntryResponse
} from "../shared/messages"
import { DATA_ATTR, buildHatenaEntryUrl } from "../shared/url"
import type { HatenaBookmarkSummary } from "../shared/hatena"

const BADGE_CLASS = "gsplus-hatebu-count"
const BADGE_ICON_CLASS = "gsplus-hatebu-count__icon"
const BADGE_TEXT_CLASS = "gsplus-hatebu-count__text"
const BADGE_BOUND_ATTR = "data-gsplus-badge-bound"
const STYLE_ELEMENT_ID = "gsplus-hatebu-style"
const HATENA_FAVICON = "https://b.hatena.ne.jp/favicon.ico"
const OVERLAY_CLASS = "gsplus-hatebu-overlay"
const OVERLAY_BODY_CLASS = "gsplus-hatebu-overlay__body"
const OVERLAY_USER_CLASS = "gsplus-hatebu-overlay__user"
const OVERLAY_COMMENT_CLASS = "gsplus-hatebu-overlay__comment"
const OVERLAY_EMPTY_CLASS = "gsplus-hatebu-overlay__empty"
const OVERLAY_ID = "gsplus-hatebu-overlay"

const urlTargets = new Map<string, SearchResultTarget[]>()
const cachedCounts = new Map<string, number | null>()
const inflightUrls = new Set<string>()
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

function insertBadge(target: SearchResultTarget, count: number): void {
  const host =
    target.anchor.closest<HTMLElement>(".b8lM7") ??
    target.anchor.closest<HTMLElement>(".yuRUbf") ??
    target.anchor.parentElement ??
    target.container
  let badge = host.querySelector<HTMLAnchorElement>(`.${BADGE_CLASS}`)

  if (!badge) {
    badge = document.createElement("a")
    badge.className = BADGE_CLASS
    badge.target = "_blank"
    badge.rel = "noopener noreferrer"
    host.appendChild(badge)
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

function requestEntryBookmarks(url: string): Promise<HatenaBookmarkSummary[] | null> {
  if (!chrome.runtime?.id) {
    return Promise.resolve(null)
  }

  return new Promise((resolve) => {
    const request = { type: MESSAGE_TYPES.ENTRY_REQUEST, url }
    chrome.runtime.sendMessage(request, (response: HatenaEntryResponse | undefined) => {
      if (chrome.runtime.lastError) {
        console.error("Failed to load Hatena entry", chrome.runtime.lastError)
        resolve(null)
        return
      }

      if (!isHatenaEntryResponse(response)) {
        console.warn("Unexpected entry response", response)
        resolve(null)
        return
      }

      resolve(response.bookmarks ?? [])
    })
  })
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

  if (!chrome.runtime?.id) {
    console.warn("Hatena counts skipped: runtime unavailable")
    urls.forEach((url) => {
      inflightUrls.delete(url)
      applyCount(url, null)
    })
    return
  }

  const request = { type: MESSAGE_TYPES.COUNT_REQUEST, urls }
  try {
    chrome.runtime.sendMessage(request, (response: HatenaCountsResponse | undefined) => {
      urls.forEach((url) => inflightUrls.delete(url))

      if (chrome.runtime.lastError) {
        console.error("Failed to retrieve Hatena counts", chrome.runtime.lastError)
        urls.forEach((url) => applyCount(url, null))
        return
      }

      if (!isHatenaCountsResponse(response)) {
        console.warn("Unexpected Hatena response", response)
        urls.forEach((url) => applyCount(url, null))
        return
      }

      ;(Object.entries(response.counts) as Array<[string, number | null]>).forEach(([url, count]) => {
        applyCount(url, count)
      })

      urls
        .filter((url) => !(url in response.counts))
        .forEach((url) => applyCount(url, null))
    })
  } catch (error) {
    urls.forEach((url) => inflightUrls.delete(url))
    console.error("Unhandled error while requesting Hatena counts", error)
    urls.forEach((url) => applyCount(url, null))
  }
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

>>>> src/background/index.ts
import { fetchHatenaCounts, fetchHatenaEntry } from "../shared/hatena"
import {
  MESSAGE_TYPES,
  isHatenaCountsRequest,
  isHatenaEntryRequest,
  type HatenaCountsResponse,
  type HatenaEntryResponse
} from "../shared/messages"

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (isHatenaCountsRequest(message)) {
    ;(async () => {
      const counts = await fetchHatenaCounts(message.urls)
      const response: HatenaCountsResponse = {
        type: MESSAGE_TYPES.COUNT_RESPONSE,
        counts
      }
      sendResponse(response)
    })().catch((error: unknown) => {
      console.error("Failed to fetch Hatena counts", error)
      const empty: HatenaCountsResponse = {
        type: MESSAGE_TYPES.COUNT_RESPONSE,
        counts: Object.fromEntries(message.urls.map((url: string) => [url, null]))
      }
      sendResponse(empty)
    })

    return true
  }

  if (isHatenaEntryRequest(message)) {
    ;(async () => {
      const bookmarks = await fetchHatenaEntry(message.url)
      const response: HatenaEntryResponse = {
        type: MESSAGE_TYPES.ENTRY_RESPONSE,
        url: message.url,
        bookmarks
      }
      sendResponse(response)
    })().catch((error: unknown) => {
      console.error("Failed to fetch Hatena entry details", error)
      const response: HatenaEntryResponse = {
        type: MESSAGE_TYPES.ENTRY_RESPONSE,
        url: message.url,
        bookmarks: []
      }
      sendResponse(response)
    })

    return true
  }

  return false
})

export {}

>>>> vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"]
    }
  }
});

>>>> yek.md
[2m2025-11-17T11:41:42.730621Z[0m [34mDEBUG[0m Skipping ignored file: package-lock.json

>>>> tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["chrome", "node"],
    "allowJs": false,
    "strict": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "outDir": "dist-types"
  },
  "include": ["src", "tests", "tsup.config.ts", "vitest.config.ts"],
  "exclude": ["dist", "node_modules"]
}

>>>> tsup.config.ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    background: "src/background/index.ts",
    content: "src/content/index.ts"
  },
  format: ["esm"],
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  minify: false,
  target: "chrome110",
  outDir: "dist",
  skipNodeModulesBundle: true,
  dts: false
});

>>>> package.json
{
  "name": "gsplus-hatebu",
  "version": "0.1.0",
  "description": "Chrome extension that surfaces Hatena Bookmark counts on Google search results.",
  "private": true,
  "type": "module",
  "scripts": {
    "clean": "rimraf dist",
    "build:ts": "tsup --config tsup.config.ts",
    "copy:public": "cpx \"public/**/*\" dist",
    "build": "npm-run-all clean build:ts copy:public",
    "dev": "npm-run-all --parallel dev:ts dev:assets",
    "dev:ts": "tsup --watch --config tsup.config.ts",
    "dev:assets": "cpx \"public/**/*\" dist -w",
    "lint": "eslint --ext .ts src tests",
    "format": "prettier --check \"**/*.{ts,tsx,json,md}\"",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "prepare": "npm run build"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.269",
    "@types/node": "^20.11.27",
    "@typescript-eslint/eslint-plugin": "^6.20.0",
    "@typescript-eslint/parser": "^6.20.0",
    "cpx2": "^4.0.1",
    "eslint": "^8.56.0",
    "eslint-config-prettier": "^9.1.0",
    "jsdom": "^27.2.0",
    "npm-run-all": "^4.1.5",
    "prettier": "^3.2.5",
    "rimraf": "^5.0.5",
    "tslib": "^2.6.2",
    "tsup": "^8.0.1",
    "typescript": "^5.3.3",
    "vitest": "^1.3.1"
  }
}

>>>> public/manifest.json
{
  "manifest_version": 3,
  "name": "GSPlus Hatebu Counts",
  "version": "0.1.0",
  "description": "Displays Hatena Bookmark counts next to Google Search results.",
  "permissions": [],
  "host_permissions": [
    "https://bookmark.hatenaapis.com/*",
    "https://b.hatena.ne.jp/*"
  ],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": [
        "https://www.google.com/search*",
        "https://www.google.co.jp/search*",
        "https://www.google.co.uk/search*",
        "https://www.google.co.in/search*",
        "https://www.google.ca/search*",
        "https://www.google.com.au/search*",
        "https://www.google.com.hk/search*",
        "https://www.google.com.sg/search*",
        "https://www.google.com.tw/search*"
      ],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_title": "GSPlus Hatebu"
  }
}

>>>> README.md
# GSPlus Hatebu Extension

Google検索結果に各リンクのはてなブックマーク件数（`X users`）を表示するChrome拡張です。Manifest V3 + TypeScriptで構築し、Hatena公開APIからカウントをバッチ取得してDOMへ柔らかく描画します。

## プロジェクト構成
- `src/background/`: サービスワーカー。content scriptからのURLリストを受け取り、Hatena APIをコールしてレスポンスを返します。
- `src/content/`: Google検索DOMを解析し、URL抽出・キャッシュ管理・UI挿入を担うコンテンツスクリプト。
- `src/shared/`: メッセージ型・URL正規化・Hatenaクライアントなど共通ユーティリティ。
- `public/manifest.json`: Manifest V3定義（権限、content scriptのマッチ条件など）。
- `tests/`: Vitest + jsdomでのユニットテスト。

## 必要要件
- Node.js 20.x 以上
- npm 10.x 以上
- Google Chrome (Manifest V3 対応版)

## セットアップ
```bash
npm install          # 依存解決
# または
make install
```

## 開発フロー
- `npm run dev` / `make dev` : tsupウォッチ＋publicコピーで `dist/` を更新。Chromeに読み込んだままホットリロード互換の開発が可能。
- `npm run lint` / `make lint` : ESLint + Prettier互換ルールで静的解析。
- `npm run test` / `make test` : Vitestによる単体テストを実行。
- `npm run typecheck` / `make typecheck` : TypeScriptのstrictチェック。

## ビルド手順
```bash
npm run build   # もしくは make build
```
`dist/` に `background.js` と `content.js` が生成され、public配下の資産もコピーされます。配布用の内容確認には `make package` を実行すると簡易メッセージが表示されます。

### 対応ドメイン
デフォルトでは以下のGoogleドメインで検索ページが対象になります: `google.com`, `google.co.jp`, `google.co.uk`, `google.co.in`, `google.ca`, `google.com.au`, `google.com.hk`, `google.com.sg`, `google.com.tw`。他地域に対応したい場合は `public/manifest.json` の `content_scripts[0].matches` に該当する `https://www.google.<tld>/search*` パターンを追加してください。

## Chromeへのインストール手順
1. 上記ビルドを完了させ、`dist/` ディレクトリがあることを確認します。
2. Chromeで `chrome://extensions/` を開き、右上の「デベロッパーモード」を有効化。
3. 「パッケージ化されていない拡張機能を読み込む」をクリックし、プロジェクトの `dist/` を選択。
4. Googleで検索結果を開くと、各結果のリンク横に `★ 123 users` のようなバッジが表示されます（0件の結果は非表示）。

## テストと品質ゲート
```bash
npm run lint && npm run test && npm run typecheck
```
Pull Request前に上記を必ず通し、可能ならChrome上で `chrome://extensions/` から再読み込み→Google検索ページでの手動確認を行ってください。

>>>> docs/spec.md
# Design Doc: Google検索結果にはてなブックマーク件数を表示するChrome拡張

## 1. 概要

本ドキュメントは、「Google検索結果ページに、各結果URLのはてなブックマーク件数（`X users`）を表示する」Chrome拡張の設計書である。
この設計書は **Coding Agent に対する実装指示書** を目的としており、技術スタック・アーキテクチャ・責務分割・注意点を中心に記述する。擬似コードや詳細実装（具体的なコード）は扱わない。

---

## 2. ゴールと非ゴール

### 2.1 ゴール

* GoogleのWeb検索結果ページ上で、各検索結果に対応するURLの「はてなブックマーク件数」を表示する。
* 件数は「`X users`」形式のテキスト（必要ならリンク）として表示する。
* 0件のURLについては、UI上に何も追加しない（＝0は非表示）。
* Hatena Bookmarkの**公開APIのみ**を使用し、認証（OAuth等）は不要とする。
* Manifest V3 + TypeScript + Node.js + npm を前提とした、再利用性の高い構成とする。

### 2.2 非ゴール

* Google以外の検索エンジン（Bing, DuckDuckGo など）への対応。
* はてなブックマークのホットエントリ情報、コメント数、コメント本文等の表示。
* はてなブックマークへの新規投稿や編集など、ユーザーアクション機能。
* 派手なカスタムUI（ポップアップ、詳細オーバーレイ、グラフ表示など）。
* Manifest V2 対応。

---

## 3. ユースケース

* ユーザーが Chrome で Google 検索を行う。
* 検索結果一覧が表示されると同時に、各結果のタイトル付近に「`123 users`」のようにブックマーク件数が表示される。
* ユーザーは、この件数をもとに SEO スパムっぽい結果をフィルタし、ブックマークされている（≒ある程度信頼できる）ページを優先的に閲覧する。

---

## 4. 要求仕様

### 4.1 機能要件

1. **対象ページ**

   * URL が `https://www.google.*/*`（`.co.jp`など含む）で、検索クエリを含む検索結果ページに対して拡張機能を有効化する。
2. **検索結果の検出**

   * 検索結果ページ内から「外部サイトへの結果リンク」を列挙する。
   * 内部リンク（Google自身のURL、広告枠など）は極力除外する。
3. **ブックマーク件数の取得**

   * 列挙したURLに対して、はてなブックマークの件数を一括で取得する。
   * Hatena Bookmarkの公開API（`bookmark.hatenaapis.com`）のカウントAPIを使用する。
4. **UI表示**

   * 各検索結果のタイトル等の近くに `X users` というテキストを表示する。
   * 件数が0の場合は、UI表示を行わない。
   * UIは最小限の装飾（小さめの灰色テキスト、適度なマージン）に留める。
5. **動的変化への追従（オプション）**

   * Googleの「もっと見る」「継続スクロール」による追加結果表示にも対応できるよう、MutationObserver による監視を設計上考慮する（必須ではないが、拡張性として設計に入れておく）。

### 4.2 非機能要件

* **パフォーマンス**

  * 検索結果1ページあたりのAPI呼び出しは最小限にする（複数URL用APIを活用）。
  * ページ描画の体感速度に大きな影響を与えないこと。
* **安定性**

  * Hatena APIエラー時は静かに失敗し、検索結果表示自体に影響を与えないこと。
* **可読性・保守性**

  * TypeScript で型安全に実装する。
  * Google側DOM構造に依存する処理は、変更に対応しやすいよう一箇所に集約する。
* **セキュリティ**

  * Manifest V3 のポリシーに従い、最小限の権限のみ要求する。
  * コンテンツスクリプトからのクロスオリジン通信は行わず、バックグラウンドサービスワーカー側で行う。

---

## 5. 技術スタック・前提

* **ブラウザ**: Google Chrome (Manifest V3 対応バージョン)
* **拡張仕様**: Manifest V3
* **言語**: TypeScript
* **ビルド環境**: Node.js + npm + bundler（webpack / Vite / Rollup等。どれを選ぶかは実装フェーズで決定可）
* **型定義**: Chrome拡張API用型（`@types/chrome` など）

---

## 6. 高レベルアーキテクチャ

### 6.1 コンポーネント構成

1. **Manifest**

   * 権限・コンテンツスクリプト・バックグラウンドサービスワーカーを定義。
2. **Background Service Worker**

   * 役割: Hatena APIへの通信と、Content Script とのメッセージ仲介。
3. **Content Script (Google Search 用)**

   * 役割: Google検索結果ページのDOMからURLを抽出し、Backgroundに問い合わせ、結果をUIとして描画する。
4. **共通モジュール（任意）**

   * メッセージ型定義、URL正規化、Hatena APIクエリの構築ロジック等を共通化。

### 6.2 データフロー (概要)

1. Content Script がページロード後に起動。
2. Content Script が検索結果DOMを解析し、URLリストを作成。
3. Content Script が Background に「URLリスト → カウント取得」のメッセージを送信。
4. Background が Hatena API に対してバッチリクエストを送信。
5. Background がレスポンス（URL→件数マップ）を受け取り、Content Script に返信。
6. Content Script が各検索結果要素に対して `X users` の表示を挿入する。

---

## 7. Manifest 設計（抽象）

Coding Agent は以下のようなポイントを満たすように `manifest.json` を設計・定義すること。

* `manifest_version: 3`
* 必須フィールド: `name`, `version`, `description`
* **背景スクリプト**

  * `"background": { "service_worker": "<ビルド済みbackgroundスクリプト>", "type": "module" }`
* **コンテンツスクリプト**

  * 検索結果ページにマッチする `matches` 配列（例: `https://www.google.*/*`）
  * 検索クエリを含むURLに限定するための `include_globs` or `exclude_matches` 等。
  * `run_at` は `document_end` または `document_idle`
* **権限**

  * `"host_permissions"` に Hatena APIドメイン（例: `https://bookmark.hatenaapis.com/*`）を追加。
  * `"permissions"` は最小限（基本的に不要。必要であれば `scripting` 程度）。
* **アイコン、options_page 等**

  * 必須ではないが、必要に応じて設計。

---

## 8. Background Service Worker 設計

### 8.1 責務

* Content Script からの「件数取得リクエスト」を受け付ける。
* Hatena API のカウントエンドポイントを呼び出し、結果をマージする。
* 結果を Content Script に返信する。
* クロスオリジン通信を一元管理する。

### 8.2 メッセージインタフェース

Coding Agent は、Background と Content Script 間でやり取りするメッセージ型を定義すること。
最低限必要な構造:

* リクエストメッセージ例:

  * `type`（文字列。例えば `"GET_HATENA_COUNTS"`）
  * `urls`: string[] （コンテンツスクリプトで抽出したURLリスト）
* レスポンスメッセージ例:

  * `type`（例: `"GET_HATENA_COUNTS_RESULT"`)
  * `counts`: `{ [url: string]: number | null }`（null はエラー時・取得不可時）

### 8.3 Hatena API呼び出し方針

#### エンドポイント

* 単一URL版: `GET https://bookmark.hatenaapis.com/count/entry?url=<encodedURL>`
* 複数URL版: `GET https://bookmark.hatenaapis.com/count/entries?url=<url1>&url=<url2>&...`

#### 呼び出し戦略

* 原則として **複数URL版** を利用し、API呼び出し回数を削減する。
* URL数が多すぎる場合は、一定件数（例: 50件）ごとに分割して複数回呼び出す戦略をとる。
* APIが返すレスポンス形式を確認した上で、`url → count` のマップを生成する。
* `fetch` を用いてリクエストを送信し、`res.ok` を確認後にレスポンスをパースする。

#### エラーハンドリング

* ネットワークエラー、ステータスコード異常、パースエラー等の場合:

  * 対象URLの count を `null` として扱う。
  * コンテンツスクリプトにエラー情報を返すかどうかは任意だが、少なくともUI表示を控える設計とする。
* Background 内ではエラー内容を console にログ出力しておく（開発時デバッグ用途）。

### 8.4 非同期メッセージ処理の注意点

* `chrome.runtime.onMessage.addListener` 内で非同期処理 (`fetch` 等) を行うため、リスナー関数は `true` を返し、`sendResponse` を非同期に呼び出すパターンにすること。
* Service Worker のライフサイクルに注意し、メッセージ応答完了前にWorkerが終了しないようにする（`sendResponse`まで確実に実行）。

---

## 9. Content Script 設計

### 9.1 責務

* Google検索結果ページ上のDOMから、各検索結果の**外部リンクURL**と**対応するDOM要素**を抽出する。
* 抽出したURL一覧をBackgroundに送信し、結果を受け取る。
* 受け取った件数を元に、適切な位置に `X users` のUIを挿入する。
* 動的に追加された検索結果（可能であれば）にも対応する。

### 9.2 DOM抽出戦略

GoogleのDOM構造は変わりやすいため、以下の点に注意して実装する:

* 検索結果のコンテナは概ね `div#search` 配下に存在する。
* 一般的なオーガニック検索結果は:

  * タイトル部分に `h3` があり、その内側または近傍に `<a href="...">` のリンクがある。
* セレクタの設計方針:

  * コンテナ (`#search`) を起点に `a[href]` をパターンマッチする。
  * `href` が `http://` または `https://` で始まり、Google 自身のドメイン以外のものだけを対象とする。
  * 広告枠やその他UI要素と混ざらないよう、クラス名や属性（例: `data-ved`）を利用してより絞り込む戦略も検討する。
* 抽出結果:

  * URL文字列
  * URLを表示している`<a>`要素（または、その親の結果ブロック要素）への参照

Coding Agent は、DOM抽出ロジックを **一つの関数／モジュールに隔離** し、Google側の構造変更時にその部分だけ差し替えれば済むような設計にすること。

### 9.3 UI挿入戦略

* 各結果ごとに、既存DOMに `X users` を追加する。
* 挿入位置の候補:

  * タイトルリンク (`<a>`) の直後
  * タイトルを囲むコンテナの末尾
  * スニペット（説明文）やURL表示の近く
* UI要素:

  * HTMLタグ: `<span>` もしくは `<a>`（クリックでHatenaエントリページに飛ばす場合）
  * クラス名: 例として `hatebu-count` 等の固有クラス名を付与する。
* スタイル:

  * フォントサイズは周辺文字よりやや小さめ（例: 90%）
  * マージン左側に少し余白を入れる（例: 4〜8px）
  * 色は薄めのグレー（例: `#777`）
* 0件の扱い:

  * Countが `0` または `null` の場合、UI挿入は行わない。
* 既に挿入済みかどうかの判定:

  * 同じ結果に二重挿入しないため、結果要素に `data-hatebu-count-injected="true"` のような属性を付けてフラグ管理する。

### 9.4 メッセージ送受信

* DOM抽出後、URL一覧をBackgroundに送信する。
* Backgroundから戻った `url → count` マップを利用して、対応するDOM要素へUI挿入する。
* URL文字列の扱いに注意:

  * Googleが結果リンクにリダイレクトURL（問合せパラメータ付きのGoogle内部URL）を使っている場合、実際のターゲットURLを抽出・正規化することが望ましい。
  * 可能なら `href` をそのまま使うのではなく、`a.href`が返す絶対URLを使い、余計なトラッキングパラメータは除去する設計も検討する（必須ではないが、ハッシュキーの安定性向上に寄与）。

### 9.5 動的な結果追加（オプション）

* Infinite Scroll やページ内再検索への対応として、MutationObserver を `#search` もしくはその親要素に設定する。
* ノード追加イベントで、新規に現れた結果要素に対してのみ抽出・問い合わせ・UI挿入を行う。
* 既に処理した要素に対しては、`data-hatebu-count-injected` 等でスキップする。

---

## 10. Hatena API との連携仕様

Coding Agent は、実際のAPI仕様を最新ドキュメントで確認したうえで、以下の方針に従って連携を実装すること。

* **エンドポイント**

  * 単一: `/count/entry?url=...`
  * 複数: `/count/entries?url=...&url=...`
* **HTTPメソッド**

  * GET
* **プロトコル**

  * HTTPS を使用
* **パラメータ**

  * URLは必ず `encodeURIComponent` 相当でエンコードする。
* **レスポンス**

  * 形式は公式ドキュメントに従う。
  * 受け取ったデータを `url → count` 形式のマップに変換すること。
* **制限事項**

  * 一度に送信できるURL件数やURL長に上限がある場合を想定し、大きい場合は複数回に分割する。
  * APIの利用規約・レート制限を尊重する。

---

## 11. セキュリティ・権限

* 必要最低限の `host_permissions` のみを宣言する（Hatena APIドメインへのアクセス）。
* コンテンツスクリプトからは外部ドメインへ直接通信せず、必ず Background を通す。
* ユーザーの個人情報や機密情報を収集しない。
* ログ出力は開発時のみ詳細設定し、本番ビルドでは必要最低限に抑える。

---

## 12. i18n とアクセシビリティ

* 表示テキストは `X users` の形で英語固定でもよいが、必要に応じてロケールごとに変更しやすい構造にしておく（i18n対応は必須ではない）。
* スクリーンリーダー対応として、`aria-label` を付与することも検討可（例: 「Hatena Bookmark: X users」）。
* UI要素は検索結果本文と視認性のバランスを保つよう、過度に目立たせない。

---

## 13. テスト戦略

Coding Agent は以下の観点で動作確認を行うこと。

1. **基本シナリオ**

   * 通常のGoogle検索（PC版）でページを開き、各検索結果に `X users` が表示されること。
   * ブックマーク数が多いURLで、実際のHatenaページと件数が整合していること。
2. **0件のシナリオ**

   * ブックマーク数0のURLがUI表示されないことを確認。
3. **エラーシナリオ**

   * ネットワークを切る、API URLをわざと間違えるなどして、UIが壊れずに検索結果だけは正常に見えること。
4. **DOM変更耐性**

   * 異なるGoogleレイアウト（日本語・英語、ライトテーマ／ダークテーマ）で動作確認し、セレクタが安定しているか検証する。
5. **パフォーマンス**

   * 大量の検索結果（継続スクロールで増やした場合）でもブラウザが重くならないこと。

---

## 14. 将来拡張・オプション

* **オプションページの追加**

  * 「表示をON/OFFする」「0件も表示する」「クリックでHatenaエントリページに飛ぶかどうか」などの設定を持たせる拡張。
* **UIの高度化**

  * 件数に応じた色分け（ある閾値以上は強調する等）。
* **他サイト対応**

  * 同じ仕組みで、はてなブックマーク件数をGitHub等他サイトにも表示する。

---

以上がCoding Agent向けのDesign Docである。
実装フェーズでは、本ドキュメントに基づき以下を行うこと:

* Manifest V3の定義
* Background Service Workerの実装（Hatena API クライアント + メッセージハンドラ）
* Content Scriptの実装（DOM抽出 + UI挿入 + メッセージ送受信）
* TypeScript/ビルド環境の構築
* 上記テスト戦略に沿った動作確認・調整


# 参考文章
※このリストは「今回のDesign Docと実装で実際に参照する可能性が高いもの」に絞っています。

---

## Chrome拡張（Manifest V3 / ネットワーク / メッセージング）

1. **Extensions / Manifest V3 - Chrome for Developers**
   [https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)

2. **Migrate to Manifest V3 - Chrome for Developers**
   [https://developer.chrome.com/docs/extensions/develop/migrate](https://developer.chrome.com/docs/extensions/develop/migrate)

3. **Cross-origin network requests - Chrome for Developers**
   [https://developer.chrome.com/docs/extensions/develop/concepts/network-requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)

4. **Changes to Cross-Origin Requests in Chrome Extension Content Scripts**
   [https://www.chromium.org/Home/chromium-security/extension-content-script-fetches/](https://www.chromium.org/Home/chromium-security/extension-content-script-fetches/)

5. **Chrome Extensions For Beginners（Manifest V3 / Service workers / Content scripts / Message passing 概要）**
   [https://jl978.medium.com/chrome-extensions-for-beginners-46019a826cd6](https://jl978.medium.com/chrome-extensions-for-beginners-46019a826cd6)

6. **Chrome拡張機能 manifest.json Ver.3の書き方（Qiita）**
   [https://qiita.com/shiro1212/items/12f0a767494a7b2ab0b3](https://qiita.com/shiro1212/items/12f0a767494a7b2ab0b3)

7. **自分の作ったChrome拡張をManifest Version 3に対応させる（Zenn）**
   [https://zenn.dev/satoshie/articles/aa62f01faddd84](https://zenn.dev/satoshie/articles/aa62f01faddd84)

8. **大遅刻 Manifest V3 移行メモ（Manifest V3移行チェックリスト紹介付き）**
   [https://takusan.negitoro.dev/posts/chrome_extension_migrate_manifest_v3/](https://takusan.negitoro.dev/posts/chrome_extension_migrate_manifest_v3/)

9. **Chrome 拡張機能の content_scripts で CORS を回避する方法（Zenn）**
   [https://zenn.dev/noraworld/articles/chrome-extensions-cors](https://zenn.dev/noraworld/articles/chrome-extensions-cors)

10. **Stack Overflow: How to make a cross-origin request in a content script (currently blocked by CORS)**
    [https://stackoverflow.com/questions/55214828/how-to-make-a-cross-origin-request-in-a-content-script-currently-blocked-by-cor](https://stackoverflow.com/questions/55214828/how-to-make-a-cross-origin-request-in-a-content-script-currently-blocked-by-cor)

---

## はてなブックマーク API 関連

11. **はてなブックマーク件数取得API - Hatena Developer Center**
    [https://developer.hatena.ne.jp/ja/documents/bookmark/apis/getcount/](https://developer.hatena.ne.jp/ja/documents/bookmark/apis/getcount/)

12. **ブックマーク API | Hatena Developer Center（REST API 全般・旧エンドポイント廃止案内）**
    [https://developer.hatena.ne.jp/ja/documents/bookmark/apis/rest/bookmark/](https://developer.hatena.ne.jp/ja/documents/bookmark/apis/rest/bookmark/)

13. **特定のサイトに対する合計ブックマーク数を取得する API を実験的に公開します（はてなブックマーク開発ブログ）**
    [https://bookmark.hatenastaff.com/entry/2018/06/14/181615](https://bookmark.hatenastaff.com/entry/2018/06/14/181615)

14. **ページ毎のはてなブックマーク数を週次で取得する（Google Apps Scriptから件数取得APIを叩く例）**
    [https://www.meganii.com/blog/2020/07/20/getting-the-number-of-hatena-bookmarks-per-page-with-google-apps-script-weekly/](https://www.meganii.com/blog/2020/07/20/getting-the-number-of-hatena-bookmarks-per-page-with-google-apps-script-weekly/)

15. **【はてなブックマーク】特定ページの登録数を取得する API の使い方（Techblog Tips）**
    [https://www.folklore.place/tips/hatena-bookmark/api/count](https://www.folklore.place/tips/hatena-bookmark/api/count)

16. **Hugoで作成したブログの各記事内にブクマ件数を表示する（Lamnda + S3 で件数取得）**
    [https://michimani.net/post/development-show-hatebu-count-in-hugo-posts/](https://michimani.net/post/development-show-hatebu-count-in-hugo-posts/)

---

## 旧はてなブックマークChrome拡張・関連OSS

17. **はてなブックマーク Google Chrome 拡張（公式GitHubリポジトリ）**
    [https://github.com/hatena/hatena-bookmark-googlechrome-extension](https://github.com/hatena/hatena-bookmark-googlechrome-extension)

18. **Hatena Co., Ltd. GitHub（hatena-bookmark-googlechrome-extension含む）**
    [https://github.com/hatena](https://github.com/hatena)

19. **hatebu-mydata-parser（旧はてブ拡張 search.data のパーサライブラリ）**
    [https://github.com/azu/hatebu-mydata-parser](https://github.com/azu/hatebu-mydata-parser)

20. **はてなブックマーク Google Chrome 拡張のベータテストを開始します（はてなブックマーク開発ブログ）**
    [https://bookmark.hatenastaff.com/entry/2009/12/09/000000](https://bookmark.hatenastaff.com/entry/2009/12/09/000000)

21. **はてな、はてなブックマークGoogle Chrome拡張を正式リリース（プレスリリース）**
    [https://hatena.co.jp/press/release/entry/2010/01/26/093821](https://hatena.co.jp/press/release/entry/2010/01/26/093821)

22. **はてなブックマークChrome拡張の表示を修正するGreasemonkey（Google検索結果レイアウト調整例）**
    [https://gist.github.com/yonchu/2688337](https://gist.github.com/yonchu/2688337)

---



>>>> tests/shared/hatena.test.ts
import { describe, expect, it } from "vitest"
import { chunkArray } from "../../src/shared/hatena"

describe("chunkArray", () => {
  it("splits arrays into even chunks", () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it("throws on invalid size", () => {
    expect(() => chunkArray([1], 0)).toThrowError()
  })
})

>>>> tests/shared/url.test.ts
import { describe, expect, it } from "vitest"
import {
  buildHatenaEntryUrl,
  extractExternalUrlFromHref,
  normalizeForComparison,
  normalizeUrl
} from "../../src/shared/url"

describe("normalizeUrl", () => {
  it("strips hash fragments and enforces protocol", () => {
    expect(normalizeUrl("https://example.com/path#section")).toBe("https://example.com/path")
    expect(normalizeUrl("mailto:test@example.com")).toBeNull()
  })
})

describe("extractExternalUrlFromHref", () => {
  it("returns direct https links", () => {
    expect(extractExternalUrlFromHref("https://example.com/foo")).toBe("https://example.com/foo")
  })

  it("unwraps Google redirect links", () => {
    const target = encodeURIComponent("https://example.org/article")
    const href = `https://www.google.com/url?q=${target}&sa=U`
    expect(extractExternalUrlFromHref(href)).toBe("https://example.org/article")
  })

  it("ignores Google internal links", () => {
    expect(extractExternalUrlFromHref("https://www.google.com/search?q=test")).toBeNull()
  })
})

describe("buildHatenaEntryUrl", () => {
  it("creates https entry paths with s segment", () => {
    expect(buildHatenaEntryUrl("https://developers.line.biz/ja/"))
      .toBe("https://b.hatena.ne.jp/entry/s/developers.line.biz/ja/")
  })

  it("creates http entry paths with http segment", () => {
    expect(buildHatenaEntryUrl("http://example.com/path?q=1"))
      .toBe("https://b.hatena.ne.jp/entry/http/example.com/path?q=1")
  })
})

describe("normalizeForComparison", () => {
  it("normalizes protocol, host casing, and trailing slash", () => {
    expect(normalizeForComparison("https://Example.com")).toBe("https://example.com/")
    expect(normalizeForComparison("https://example.com/index?q=1"))
      .toBe("https://example.com/index?q=1")
  })
})

>>>> tests/content/searchResults.test.ts
import { describe, expect, it } from "vitest"
import { discoverSearchResults } from "../../src/content/searchResults"

describe("discoverSearchResults", () => {
  it("extracts unique targets from Google SERP markup", () => {
    document.body.innerHTML = `
      <div class="g">
        <div>
          <a href="https://example.com/article"><h3>Example</h3></a>
        </div>
      </div>
      <div class="g">
        <div>
          <a href="https://www.google.com/url?q=https%3A%2F%2Fanother.example">Another</a>
        </div>
      </div>
    `

    const first = discoverSearchResults(document)
    expect(first).toHaveLength(2)
    expect(first[0]?.url).toBe("https://example.com/article")
    expect(first[1]?.url).toBe("https://another.example/")

    const secondPass = discoverSearchResults(document)
    expect(secondPass).toHaveLength(0)
  })
})

>>>> Makefile
.PHONY: install build dev lint test typecheck clean package

install:
	npm install

build:
	npm run build

package: build
	@echo "Extension bundle available under dist/"

clean:
	npm run clean || true

lint:
	npm run lint

test:
	npm run test

typecheck:
	npm run typecheck

dev:
	npm run dev

