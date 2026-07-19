import { loadSettings, saveSettings } from "../shared/settings"

const FILTER_INPUT_ID = "hide-results-without-signals"
const STATUS_ID = "save-status"

type StatusState = "pending" | "success" | "error"

function getMessage(key: string): string {
  return chrome.i18n.getMessage(key)
}

function localizeOptionsPage(): void {
  document.documentElement.lang = chrome.i18n.getUILanguage()
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((element) => {
    const key = element.dataset.i18n
    if (!key) {
      return
    }

    const message = getMessage(key)
    if (message) {
      element.textContent = message
    }
  })
}

function setStatus(status: HTMLElement, messageKey: string, state: StatusState): void {
  status.textContent = getMessage(messageKey)
  status.dataset.state = state
}

export async function initializeOptionsPage(): Promise<void> {
  localizeOptionsPage()
  const input = document.getElementById(FILTER_INPUT_ID)
  const status = document.getElementById(STATUS_ID)
  if (!(input instanceof HTMLInputElement) || !(status instanceof HTMLElement)) {
    return
  }

  const settings = await loadSettings()
  input.checked = settings.hideResultsWithoutSocialSignals
  input.disabled = false
  let savedValue = input.checked

  input.addEventListener("change", () => {
    const nextValue = input.checked
    input.disabled = true
    setStatus(status, "optionsSaving", "pending")
    void saveSettings({ hideResultsWithoutSocialSignals: nextValue })
      .then(() => {
        savedValue = nextValue
        setStatus(status, "optionsSaved", "success")
      })
      .catch(() => {
        input.checked = savedValue
        setStatus(status, "optionsSaveError", "error")
      })
      .finally(() => {
        input.disabled = false
      })
  })
}

void initializeOptionsPage()
