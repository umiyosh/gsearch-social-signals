import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { discoverSearchResults } from "../../src/content/searchResults"

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

    const secondPass = discoverSearchResults(document)
    expect(secondPass).toHaveLength(0)
  })
})
