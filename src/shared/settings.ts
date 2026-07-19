export const FILTER_SETTING_KEY = "hideResultsWithoutSocialSignals"

export interface ExtensionSettings {
  hideResultsWithoutSocialSignals: boolean
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  hideResultsWithoutSocialSignals: false
}

function storageAvailable(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.storage?.sync)
}

export function loadSettings(): Promise<ExtensionSettings> {
  if (!storageAvailable()) {
    return Promise.resolve(DEFAULT_SETTINGS)
  }

  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (items) => {
      if (chrome.runtime.lastError) {
        resolve(DEFAULT_SETTINGS)
        return
      }

      resolve({
        hideResultsWithoutSocialSignals: items[FILTER_SETTING_KEY] === true
      })
    })
  })
}

export function saveSettings(settings: ExtensionSettings): Promise<void> {
  if (!storageAvailable()) {
    return Promise.reject(new Error("Extension storage is unavailable"))
  }

  return new Promise((resolve, reject) => {
    chrome.storage.sync.set(
      { [FILTER_SETTING_KEY]: settings.hideResultsWithoutSocialSignals },
      () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
          return
        }
        resolve()
      }
    )
  })
}

export function watchSettings(listener: (settings: ExtensionSettings) => void): () => void {
  if (typeof chrome === "undefined" || !chrome.storage?.onChanged) {
    return () => undefined
  }

  const handleChange: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (
    changes,
    areaName
  ) => {
    if (areaName !== "sync" || !(FILTER_SETTING_KEY in changes)) {
      return
    }

    listener({
      hideResultsWithoutSocialSignals: changes[FILTER_SETTING_KEY]?.newValue === true
    })
  }

  chrome.storage.onChanged.addListener(handleChange)
  return () => chrome.storage.onChanged.removeListener(handleChange)
}
