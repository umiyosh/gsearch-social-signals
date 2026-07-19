import { afterEach, describe, expect, it, vi } from "vitest"

const loadSettings = vi.fn()
const saveSettings = vi.fn()

vi.mock("../../src/shared/settings", () => ({
  loadSettings,
  saveSettings
}))

afterEach(() => {
  document.body.textContent = ""
  vi.resetModules()
  vi.clearAllMocks()
})

describe("options page", () => {
  it("loads, toggles, and persists the social signal filter", async () => {
    document.body.innerHTML = `
      <input id="hide-results-without-signals" type="checkbox" />
      <p id="save-status"></p>
    `
    loadSettings.mockResolvedValue({ hideResultsWithoutSocialSignals: true })
    saveSettings.mockResolvedValue(undefined)

    await import("../../src/options/index")
    const input = document.getElementById("hide-results-without-signals") as HTMLInputElement
    const status = document.getElementById("save-status") as HTMLElement
    await vi.waitFor(() => expect(input.checked).toBe(true))

    input.checked = false
    input.dispatchEvent(new Event("change"))

    await vi.waitFor(() => {
      expect(saveSettings).toHaveBeenCalledWith({ hideResultsWithoutSocialSignals: false })
      expect(status.textContent).toBe("Saved")
      expect(input.disabled).toBe(false)
    })
  })

  it("shows a save failure and re-enables the checkbox", async () => {
    document.body.innerHTML = `
      <input id="hide-results-without-signals" type="checkbox" />
      <p id="save-status"></p>
    `
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
      expect(input.disabled).toBe(false)
      expect(input.checked).toBe(false)
    })
  })
})
