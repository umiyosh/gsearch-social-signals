import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  beginOverlaySession,
  cancelOverlayHide,
  presentOverlay,
  scheduleOverlayHide
} from "../../src/content/overlay"

function getOverlay(): HTMLElement | null {
  return document.getElementById("gsplus-hatebu-overlay")
}

function buildBadge(): HTMLElement {
  const badge = document.createElement("a")
  document.body.appendChild(badge)
  return badge
}

beforeEach(() => {
  vi.useFakeTimers()
  document.body.textContent = ""
})

afterEach(() => {
  // overlayHover 等のモジュール状態を初期化された側に倒してから次のテストへ。
  getOverlay()?.dispatchEvent(new MouseEvent("mouseleave"))
  vi.runAllTimers()
  vi.useRealTimers()
})

describe("beginOverlaySession", () => {
  it("shows the overlay in a loading state", () => {
    beginOverlaySession("https://a", buildBadge())

    const overlay = getOverlay()
    expect(overlay?.style.display).toBe("block")
    expect(overlay?.getAttribute("role")).toBe("tooltip")
    expect(overlay?.getAttribute("aria-hidden")).toBe("false")
    expect(overlay?.querySelector(".gsplus-hatebu-overlay__body")?.getAttribute("aria-live")).toBe(
      "polite"
    )
    expect(overlay?.textContent).toBe("読み込み中...")
  })
})

describe("presentOverlay", () => {
  it("renders user comments for the active url", () => {
    const badge = buildBadge()
    beginOverlaySession("https://a", badge)

    presentOverlay("https://a", badge, [
      { user: "alice", comment: "great" },
      { user: "bob", comment: "useful" }
    ])

    const overlay = getOverlay()
    expect(overlay?.querySelectorAll("li")).toHaveLength(2)
    expect(overlay?.textContent).toContain("alice")
    expect(overlay?.textContent).toContain("useful")
  })

  it("renders the empty state and the failure state", () => {
    const badge = buildBadge()

    beginOverlaySession("https://a", badge)
    presentOverlay("https://a", badge, [])
    expect(getOverlay()?.textContent).toBe("はてなブックマークにコメントはまだありません")

    beginOverlaySession("https://a", badge)
    presentOverlay("https://a", badge, null)
    expect(getOverlay()?.textContent).toBe("はてなブックマークの取得に失敗しました")
  })

  it("ignores responses for urls that are no longer active", () => {
    const badge = buildBadge()
    beginOverlaySession("https://current", badge)

    presentOverlay("https://stale", badge, [{ user: "alice", comment: "late" }])

    expect(getOverlay()?.textContent).toBe("読み込み中...")
  })
})

describe("hide scheduling", () => {
  it("hides the overlay after the hide delay", () => {
    beginOverlaySession("https://a", buildBadge())

    scheduleOverlayHide()
    vi.advanceTimersByTime(150)

    expect(getOverlay()?.style.display).toBe("none")
    expect(getOverlay()?.getAttribute("aria-hidden")).toBe("true")
  })

  it("keeps the overlay visible when the hide is cancelled", () => {
    beginOverlaySession("https://a", buildBadge())

    scheduleOverlayHide()
    cancelOverlayHide()
    vi.advanceTimersByTime(300)

    expect(getOverlay()?.style.display).toBe("block")
  })

  it("keeps the overlay open while hovered, then hides on leave", () => {
    beginOverlaySession("https://a", buildBadge())
    const overlay = getOverlay()

    overlay?.dispatchEvent(new MouseEvent("mouseenter"))
    scheduleOverlayHide()
    vi.advanceTimersByTime(300)
    expect(overlay?.style.display).toBe("block")

    overlay?.dispatchEvent(new MouseEvent("mouseleave"))
    vi.advanceTimersByTime(150)
    expect(overlay?.style.display).toBe("none")
  })

  it("hides immediately when the window scrolls without hover", () => {
    beginOverlaySession("https://a", buildBadge())

    window.dispatchEvent(new Event("scroll"))

    expect(getOverlay()?.style.display).toBe("none")
  })
})
