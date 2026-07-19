import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

interface ExtensionManifest {
  content_scripts?: Array<{ matches?: string[] }>
  web_accessible_resources?: Array<{ matches?: string[] }>
}

function readManifest(): ExtensionManifest {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), "public/manifest.json"), "utf8")
  ) as ExtensionManifest
}

describe("extension manifest", () => {
  it("loads the content script and badge icons on DuckDuckGo", () => {
    const manifest = readManifest()

    expect(manifest.content_scripts?.[0]?.matches).toContain("https://duckduckgo.com/*")
    expect(manifest.web_accessible_resources?.[0]?.matches).toContain("https://duckduckgo.com/*")
  })
})
