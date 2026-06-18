import { beforeEach, describe, expect, it } from "vitest"
import { BADGE_CLASS, HN_BADGE_CLASS, OVERLAY_CLASS, ensureStyles } from "../../src/content/styles"

function relativeLuminance(hex: string): number {
  const channels = hex
    .match(/[0-9a-f]{2}/gi)
    ?.map((channel) => parseInt(channel, 16) / 255)
    .map((value) => (value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4)))

  if (!channels || channels.length !== 3) {
    throw new Error(`invalid hex color: ${hex}`)
  }

  const [red, green, blue] = channels as [number, number, number]
  return red * 0.2126 + green * 0.7152 + blue * 0.0722
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground)
  const backgroundLuminance = relativeLuminance(background)
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  )
}

describe("ensureStyles", () => {
  beforeEach(() => {
    document.head.innerHTML = ""
  })

  it("injects the style element with badge and overlay rules", () => {
    ensureStyles()

    const style = document.getElementById("gsplus-hatebu-style")
    expect(style).not.toBeNull()
    expect(style?.textContent).toContain(`.${BADGE_CLASS}`)
    expect(style?.textContent).toContain(`.${BADGE_CLASS}:focus-visible`)
    expect(style?.textContent).toContain(`.${HN_BADGE_CLASS}:focus-visible`)
    expect(style?.textContent).toContain(`.${OVERLAY_CLASS}`)
    expect(style?.textContent).toContain("@media (prefers-color-scheme: dark)")
    expect(style?.textContent).toContain("@media (forced-colors: active)")
    expect(style?.textContent).toContain("font-size: 0.875rem")
    expect(style?.textContent).toContain("color: LinkText")
  })

  it("uses badge colors with readable contrast in light and dark themes", () => {
    expect(contrastRatio("#0079a8", "#ffffff")).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio("#a34700", "#ffffff")).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio("#4cc9f0", "#202124")).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio("#ffb36b", "#202124")).toBeGreaterThanOrEqual(4.5)
  })

  it("is idempotent", () => {
    ensureStyles()
    ensureStyles()

    expect(document.querySelectorAll("#gsplus-hatebu-style")).toHaveLength(1)
  })
})
