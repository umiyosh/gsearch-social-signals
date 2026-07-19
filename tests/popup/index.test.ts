import { afterEach, describe, expect, it, vi } from "vitest"

import englishCatalog from "../../public/_locales/en/messages.json"

const loadSettings = vi.fn()
const saveSettings = vi.fn()

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

describe("popup", () => {
  it("loads and updates the social signal filter", async () => {
    document.body.innerHTML = `
      <span data-i18n="optionsFilterTitle"></span>
      <input id="hide-results-without-signals" type="checkbox" />
      <p id="save-status"></p>
    `
    vi.stubGlobal("chrome", {
      i18n: {
        getMessage: vi.fn(
          (key: string) =>
            (englishCatalog as Record<string, { message: string }>)[key]?.message ?? ""
        ),
        getUILanguage: vi.fn(() => "en-US")
      }
    })
    loadSettings.mockResolvedValue({ hideResultsWithoutSocialSignals: true })
    saveSettings.mockResolvedValue(undefined)

    await import("../../src/popup/index")
    const input = document.getElementById("hide-results-without-signals") as HTMLInputElement
    const status = document.getElementById("save-status") as HTMLElement
    await vi.waitFor(() => expect(input.checked).toBe(true))

    input.checked = false
    input.dispatchEvent(new Event("change"))

    await vi.waitFor(() => {
      expect(saveSettings).toHaveBeenCalledWith({ hideResultsWithoutSocialSignals: false })
      expect(status.textContent).toBe("Saved")
      expect(status.dataset.state).toBe("success")
    })
  })
})
