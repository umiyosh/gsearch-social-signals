import { afterEach, describe, expect, it, vi } from "vitest"
import {
  DEFAULT_SETTINGS,
  FILTER_SETTING_KEY,
  loadSettings,
  saveSettings,
  watchSettings
} from "../../src/shared/settings"

type ChangeListener = Parameters<typeof chrome.storage.onChanged.addListener>[0]

function stubChrome(
  options: {
    stored?: unknown
    lastError?: { message: string }
    onChanged?: (listener: ChangeListener) => void
  } = {}
) {
  const set = vi.fn((_: unknown, callback?: () => void) => callback?.())
  vi.stubGlobal("chrome", {
    runtime: { lastError: options.lastError },
    storage: {
      sync: {
        get: vi.fn((_: unknown, callback: (items: Record<string, unknown>) => void) => {
          callback({ [FILTER_SETTING_KEY]: options.stored })
        }),
        set
      },
      onChanged: {
        addListener: vi.fn((listener: ChangeListener) => options.onChanged?.(listener)),
        removeListener: vi.fn()
      }
    }
  })
  return { set }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("extension settings", () => {
  it("loads the persisted filter setting and defaults to off", async () => {
    stubChrome({ stored: true })
    await expect(loadSettings()).resolves.toEqual({ hideResultsWithoutSocialSignals: true })

    stubChrome({ stored: undefined })
    await expect(loadSettings()).resolves.toEqual(DEFAULT_SETTINGS)
  })

  it("falls back to defaults when storage is unavailable or fails", async () => {
    vi.stubGlobal("chrome", { runtime: {} })
    await expect(loadSettings()).resolves.toEqual(DEFAULT_SETTINGS)

    stubChrome({ stored: true, lastError: { message: "unavailable" } })
    await expect(loadSettings()).resolves.toEqual(DEFAULT_SETTINGS)
  })

  it("persists only the boolean filter setting", async () => {
    const { set } = stubChrome()

    await saveSettings({ hideResultsWithoutSocialSignals: true })

    expect(set).toHaveBeenCalledWith({ [FILTER_SETTING_KEY]: true }, expect.any(Function))
  })

  it("notifies listeners only for sync storage changes to the filter setting", () => {
    let listener: ChangeListener | undefined
    stubChrome({ onChanged: (registered) => (listener = registered) })
    const onSettings = vi.fn()

    const unwatch = watchSettings(onSettings)
    listener?.({ [FILTER_SETTING_KEY]: { oldValue: false, newValue: true } }, "sync")
    listener?.({ unrelated: { oldValue: false, newValue: true } }, "sync")
    listener?.({ [FILTER_SETTING_KEY]: { oldValue: true, newValue: false } }, "local")

    expect(onSettings).toHaveBeenCalledOnce()
    expect(onSettings).toHaveBeenCalledWith({ hideResultsWithoutSocialSignals: true })
    unwatch()
  })
})
