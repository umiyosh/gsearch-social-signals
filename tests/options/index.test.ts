import { afterEach, describe, expect, it, vi } from "vitest"

import englishCatalog from "../../public/_locales/en/messages.json"
import japaneseCatalog from "../../public/_locales/ja/messages.json"

const loadSettings = vi.fn()
const saveSettings = vi.fn()

type MessageCatalog = Record<string, { message: string }>

vi.mock("../../src/shared/settings", () => ({
  loadSettings,
  saveSettings
}))

afterEach(() => {
  document.body.textContent = ""
  document.documentElement.lang = "en"
  vi.resetModules()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

function renderOptionsPage(language = "en-US", catalog: MessageCatalog = englishCatalog): void {
  document.head.innerHTML = '<title data-i18n="optionsPageTitle"></title>'
  document.body.innerHTML = `
    <p data-i18n="optionsSubtitle"></p>
    <h2 data-i18n="optionsSectionTitle"></h2>
    <strong data-i18n="optionsFilterTitle"></strong>
    <small data-i18n="optionsFilterDescription"></small>
    <input id="hide-results-without-signals" type="checkbox" />
    <p id="save-status"></p>
  `
  vi.stubGlobal("chrome", {
    i18n: {
      getMessage: vi.fn((key: string) => catalog[key]?.message ?? ""),
      getUILanguage: vi.fn(() => language)
    }
  })
}

describe("options page", () => {
  it("localizes the options page for Japanese Chrome UI", async () => {
    renderOptionsPage("ja", japaneseCatalog)
    loadSettings.mockResolvedValue({ hideResultsWithoutSocialSignals: false })

    await import("../../src/options/index")

    await vi.waitFor(() => {
      expect(document.documentElement.lang).toBe("ja")
      expect(document.title).toBe("GSearch With Social Signals の設定")
      expect(document.querySelector("[data-i18n='optionsSubtitle']")?.textContent).toBe(
        "Google検索結果にソーシャルシグナルを表示"
      )
      expect(document.querySelector("[data-i18n='optionsFilterTitle']")?.textContent).toBe(
        "シグナルのある結果だけ表示"
      )
    })
  })

  it("loads, toggles, and persists the social signal filter", async () => {
    renderOptionsPage()
    loadSettings.mockResolvedValue({ hideResultsWithoutSocialSignals: true })
    saveSettings.mockResolvedValue(undefined)

    await import("../../src/options/index")
    const input = document.getElementById("hide-results-without-signals") as HTMLInputElement
    const status = document.getElementById("save-status") as HTMLElement
    await vi.waitFor(() => expect(input.checked).toBe(true))
    expect(document.documentElement.lang).toBe("en-US")
    expect(document.title).toBe("GSearch With Social Signals settings")
    expect(document.querySelector("[data-i18n='optionsSubtitle']")?.textContent).toBe(
      "Social signals on Google Search results"
    )

    input.checked = false
    input.dispatchEvent(new Event("change"))

    await vi.waitFor(() => {
      expect(saveSettings).toHaveBeenCalledWith({ hideResultsWithoutSocialSignals: false })
      expect(status.textContent).toBe("Saved")
      expect(status.dataset.state).toBe("success")
      expect(input.disabled).toBe(false)
    })
  })

  it("shows a save failure and re-enables the checkbox", async () => {
    renderOptionsPage()
    loadSettings.mockResolvedValue({ hideResultsWithoutSocialSignals: false })
    saveSettings.mockRejectedValue(new Error("failed"))

    await import("../../src/options/index")
    const input = document.getElementById("hide-results-without-signals") as HTMLInputElement
    const status = document.getElementById("save-status") as HTMLElement
    await vi.waitFor(() => expect(input.disabled).toBe(false))

    input.checked = true
    input.dispatchEvent(new Event("change"))

    await vi.waitFor(() => {
      expect(status.textContent).toBe("Could not save the setting")
      expect(status.dataset.state).toBe("error")
      expect(input.disabled).toBe(false)
      expect(input.checked).toBe(false)
    })
  })
})
