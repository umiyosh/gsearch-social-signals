import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { MAX_SERP_TARGETS_PER_SCAN, discoverSearchResults } from "../../src/content/searchResults"

function readSerpFixture(name: string): string {
  return readFileSync(resolve(process.cwd(), "tests/fixtures/serp", name), "utf8")
}

describe("discoverSearchResults", () => {
  it("extracts supported Google SERP result container layouts", () => {
    document.body.innerHTML = readSerpFixture("google-serp.html")

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
  })

  it("excludes Google internal links, ads, AI Overview, People also ask, and processed results", () => {
    document.body.innerHTML = readSerpFixture("google-serp.html")

    const first = discoverSearchResults(document)
    expect(first.map((target) => target.url)).not.toContain("https://processed.example/ignored")
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
  })

  it("does not rediscover already processed results on the next pass", () => {
    document.body.innerHTML = readSerpFixture("google-serp.html")

    discoverSearchResults(document)

    const secondPass = discoverSearchResults(document)
    expect(secondPass).toHaveLength(0)
  })

  it("extracts the root node itself when it is a result container", () => {
    const container = document.createElement("div")
    container.className = "g"
    container.innerHTML = '<a href="https://root.example/article">Root result</a>'

    const targets = discoverSearchResults(container)

    expect(targets.map((target) => target.url)).toEqual(["https://root.example/article"])
  })

  it("unwraps Google redirect URLs to their external target URL", () => {
    document.body.innerHTML = `
      <div class="MjjYud">
        <a href="https://www.google.com/url?url=https%3A%2F%2Fredirect.example%2Farticle%3Fid%3D1&amp;sa=U">
          Redirected result
        </a>
      </div>
    `

    const targets = discoverSearchResults(document)

    expect(targets).toHaveLength(1)
    expect(targets[0]?.url).toBe("https://redirect.example/article?id=1")
  })

  it.each([
    {
      fixture: "google-serp-ja.html",
      urls: ["https://ja.example.com/article", "https://ja-redirect.example/post?page=1"]
    },
    {
      fixture: "google-serp-en.html",
      urls: ["https://en.example.com/guide", "https://news.example.com/story"]
    },
    {
      fixture: "google-serp-ads.html",
      urls: ["https://organic.example.com/article"]
    },
    {
      fixture: "google-serp-ai-overview.html",
      urls: ["https://organic-ai.example.com/article"]
    },
    {
      fixture: "google-serp-universal.html",
      urls: [
        "https://video.example.com/watch",
        "https://publisher.example.com/news/story",
        "https://universal.example.com/article"
      ]
    }
  ])("extracts expected targets from $fixture", ({ fixture, urls }) => {
    document.body.innerHTML = readSerpFixture(fixture)

    const targets = discoverSearchResults(document)

    expect(targets.map((target) => target.url)).toEqual(urls)
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
