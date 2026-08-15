import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

interface ExtensionManifest {
  name?: string
  default_locale?: string
  action?: { default_popup?: string }
  host_permissions?: string[]
  content_scripts?: Array<{ matches?: string[] }>
  web_accessible_resources?: Array<{ matches?: string[]; resources?: string[] }>
}

type MessageCatalog = Record<string, { message: string }>

function readManifest(): ExtensionManifest {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), "public/manifest.json"), "utf8")
  ) as ExtensionManifest
}

function readMessageCatalog(locale: "en" | "ja"): MessageCatalog {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), `public/_locales/${locale}/messages.json`), "utf8")
  ) as MessageCatalog
}

describe("extension manifest", () => {
  it("opens the bundled settings popup from the toolbar action", () => {
    const manifest = readManifest()

    expect(manifest.action?.default_popup).toBe("popup.html")
  })

  it("loads the content script and badge icons on DuckDuckGo", () => {
    const manifest = readManifest()

    expect(manifest.content_scripts?.[0]?.matches).toContain("https://duckduckgo.com/*")
    expect(manifest.web_accessible_resources?.[0]?.matches).toContain("https://duckduckgo.com/*")
  })

  it("uses a descriptive Japanese store name without changing the English brand", () => {
    const manifest = readManifest()
    const japaneseCatalog = readMessageCatalog("ja")
    const englishCatalog = readMessageCatalog("en")

    expect(manifest.name).toBe("__MSG_appName__")
    expect(manifest.default_locale).toBe("en")
    expect(japaneseCatalog.appName?.message).toBe(
      "はてなブックマーク・HN・Blueskyを検索結果に表示 - GSearch"
    )
    expect(Array.from(japaneseCatalog.appName?.message ?? "").length).toBeLessThanOrEqual(75)
    expect(englishCatalog.appName?.message).toBe("GSearch With Social Signals")
    expect(japaneseCatalog.appDescription?.message).toBe(
      "GoogleとDuckDuckGoの検索結果にはてなブックマーク数とHacker Newsポイントを表示します。"
    )
    expect(japaneseCatalog.actionDefaultTitle?.message).toBe("GSearch With Social Signals")
    expect(japaneseCatalog.optionsPageTitle?.message).toBe("GSearch With Social Signals の設定")
    expect(japaneseCatalog.optionsSubtitle?.message).toBe(
      "Google検索結果にソーシャルシグナルを表示"
    )
  })

  it("grants only the working Bluesky AppView host without exposing a Bluesky logo asset", () => {
    const manifest = readManifest()

    expect(manifest.host_permissions).toContain("https://api.bsky.app/*")
    expect(manifest.host_permissions).not.toContain("https://public.api.bsky.app/*")
    expect(manifest.web_accessible_resources?.[0]?.resources).not.toContain(
      "icons/bluesky-signal.svg"
    )
  })
})
