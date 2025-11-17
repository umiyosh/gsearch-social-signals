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
