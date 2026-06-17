import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { MAX_SERP_TARGETS_PER_SCAN, discoverSearchResults } from "../../src/content/searchResults"

const serpFixture = readFileSync(
  resolve(process.cwd(), "tests/fixtures/serp/google-serp.html"),
  "utf8"
)

describe("discoverSearchResults", () => {
  it("extracts unique targets from Google SERP markup", () => {
    document.body.innerHTML = serpFixture

    const first = discoverSearchResults(document)
    expect(first.map((target) => target.url)).toEqual([
      "https://example.com/direct?ref=google",
      "https://redirect.example/story?x=1",
      "https://sokoban.example/article",
      "https://fallback.example/path"
    ])
    expect(first.map((target) => target.anchor.id)).toEqual([
      "direct-link",
      "redirect-link",
      "sokoban-link",
      "fallback-link"
    ])
    expect(document.getElementById("direct-result")?.getAttribute("data-gsplus-hatebu")).toBe(
      "pending"
    )
    expect(document.getElementById("google-only-result")?.getAttribute("data-gsplus-hatebu")).toBe(
      null
    )
    expect(
      document.getElementById("already-processed-result")?.getAttribute("data-gsplus-hatebu")
    ).toBe("done")
    expect(document.getElementById("ad-result")?.getAttribute("data-gsplus-hatebu")).toBe(null)
    expect(document.getElementById("ai-overview-result")?.getAttribute("data-gsplus-hatebu")).toBe(
      null
    )
    expect(
      document.getElementById("people-also-ask-result")?.getAttribute("data-gsplus-hatebu")
    ).toBe(null)

    const secondPass = discoverSearchResults(document)
    expect(secondPass).toHaveLength(0)
  })

  it("limits a single SERP scan to the first forty targets", () => {
    document.body.innerHTML = Array.from(
      { length: MAX_SERP_TARGETS_PER_SCAN + 1 },
      (_, index) => `
        <div class="g" id="result-${index}">
          <a href="https://example.com/${index}">Result ${index}</a>
        </div>
      `
    ).join("")

    const targets = discoverSearchResults(document)

    expect(targets).toHaveLength(MAX_SERP_TARGETS_PER_SCAN)
    expect(targets.at(0)?.url).toBe("https://example.com/0")
    expect(targets.at(-1)?.url).toBe(`https://example.com/${MAX_SERP_TARGETS_PER_SCAN - 1}`)
    expect(
      document
        .getElementById(`result-${MAX_SERP_TARGETS_PER_SCAN}`)
        ?.getAttribute("data-gsplus-hatebu")
    ).toBe(null)
  })
})
