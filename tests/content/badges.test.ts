import { beforeEach, describe, expect, it, vi } from "vitest"
import { insertBadge, insertHnBadge, type BadgeHoverHandlers } from "../../src/content/badges"
import type { SearchResultTarget } from "../../src/content/searchResults"

function buildTarget(url: string, hostClass?: string): SearchResultTarget {
  const container = document.createElement("div")
  const wrap = document.createElement("div")
  if (hostClass) {
    wrap.className = hostClass
  }
  const anchor = document.createElement("a")
  anchor.href = url
  wrap.appendChild(anchor)
  container.appendChild(wrap)
  document.body.appendChild(container)
  return { container, anchor, url }
}

function noopHover(): BadgeHoverHandlers {
  return { onEnter: vi.fn(), onLeave: vi.fn() }
}

beforeEach(() => {
  document.body.innerHTML = ""
})

describe("insertBadge", () => {
  it("renders a hatena badge with entry link, icon, and user count", () => {
    const target = buildTarget("https://example.com/article")

    insertBadge(target, 12, noopHover())

    const badge = target.container.querySelector<HTMLAnchorElement>(".gsplus-hatebu-count")
    expect(badge?.href).toBe("https://b.hatena.ne.jp/entry/s/example.com/article")
    expect(badge?.querySelector("img")?.alt).toBe("Hatena")
    expect(badge?.textContent).toContain("12 users")
    expect(target.container.getAttribute("data-gsplus-hatebu")).toBe("rendered")
  })

  it("places the badge container before the anchor inside the host", () => {
    const target = buildTarget("https://example.com/a", "yuRUbf")

    insertBadge(target, 1, noopHover())

    const host = target.anchor.parentElement
    expect(host?.firstElementChild?.className).toBe("gsplus-signal-container")
  })

  it("updates the count without duplicating the badge on re-insert", () => {
    const target = buildTarget("https://example.com/b")

    insertBadge(target, 1, noopHover())
    insertBadge(target, 7, noopHover())

    const badges = target.container.querySelectorAll(".gsplus-hatebu-count")
    expect(badges).toHaveLength(1)
    expect(badges[0]?.textContent).toContain("7 users")
  })

  it("binds hover handlers once even across re-inserts", () => {
    const target = buildTarget("https://example.com/c")
    const hover = noopHover()

    insertBadge(target, 1, hover)
    insertBadge(target, 2, hover)

    const badge = target.container.querySelector<HTMLAnchorElement>(".gsplus-hatebu-count")
    badge?.dispatchEvent(new MouseEvent("mouseenter"))
    badge?.dispatchEvent(new MouseEvent("mouseleave"))

    expect(hover.onEnter).toHaveBeenCalledTimes(1)
    expect(hover.onEnter).toHaveBeenCalledWith(badge, "https://example.com/c")
    expect(hover.onLeave).toHaveBeenCalledTimes(1)
  })
})

describe("insertHnBadge", () => {
  it("renders an HN badge linking to the Algolia search", () => {
    const target = buildTarget("https://example.com/hn")

    insertHnBadge(target, { nbHits: 3 })

    const badge = target.container.querySelector<HTMLAnchorElement>(".gsplus-hn-count")
    expect(badge?.href).toContain("https://hn.algolia.com/?query=")
    expect(badge?.href).toContain(encodeURIComponent("https://example.com/hn"))
    expect(badge?.textContent).toContain("HN 3 posts")
  })

  it("shares the signal container with the hatena badge", () => {
    const target = buildTarget("https://example.com/both")

    insertBadge(target, 2, noopHover())
    insertHnBadge(target, { nbHits: 1 })

    const containers = target.container.querySelectorAll(".gsplus-signal-container")
    expect(containers).toHaveLength(1)
    expect(containers[0]?.querySelector(".gsplus-hatebu-count")).not.toBeNull()
    expect(containers[0]?.querySelector(".gsplus-hn-count")).not.toBeNull()
  })
})
