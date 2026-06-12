import type { HatenaBookmarkSummary } from "../shared/hatena"
import {
  OVERLAY_BODY_CLASS,
  OVERLAY_CLASS,
  OVERLAY_COMMENT_CLASS,
  OVERLAY_EMPTY_CLASS,
  OVERLAY_USER_CLASS
} from "./styles"

const OVERLAY_ID = "gsplus-hatebu-overlay"
const HIDE_DELAY_MS = 150

let activeUrl: string | null = null
let overlayHover = false
let hideTimeout: number | null = null

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
  activeUrl = null
}

export function scheduleOverlayHide(): void {
  cancelOverlayHide()
  hideTimeout = window.setTimeout(() => {
    if (!overlayHover) {
      hideOverlayImmediately()
    }
  }, HIDE_DELAY_MS)
}

export function cancelOverlayHide(): void {
  if (hideTimeout !== null) {
    window.clearTimeout(hideTimeout)
    hideTimeout = null
  }
}

// hover 中の URL を覚えておき、応答が遅れて届いたときに別 URL の
// overlay を上書きしないようにする。
export function beginOverlaySession(url: string, badge: HTMLElement): void {
  activeUrl = url
  const overlay = ensureOverlay()
  const body = overlay.querySelector(`.${OVERLAY_BODY_CLASS}`)
  if (body) {
    body.textContent = "読み込み中..."
  }
  positionOverlay(badge, overlay)
  overlay.style.display = "block"
}

export function presentOverlay(
  url: string,
  badge: HTMLElement,
  bookmarks: HatenaBookmarkSummary[] | null
): void {
  if (activeUrl !== url) {
    return
  }

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
