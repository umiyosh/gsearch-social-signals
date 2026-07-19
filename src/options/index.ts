import { loadSettings, saveSettings } from "../shared/settings"

const FILTER_INPUT_ID = "hide-results-without-signals"
const STATUS_ID = "save-status"

export async function initializeOptionsPage(): Promise<void> {
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
    status.textContent = "Saving…"
    void saveSettings({ hideResultsWithoutSocialSignals: nextValue })
      .then(() => {
        savedValue = nextValue
        status.textContent = "Saved"
      })
      .catch(() => {
        input.checked = savedValue
        status.textContent = "Could not save the setting"
      })
      .finally(() => {
        input.disabled = false
      })
  })
}

void initializeOptionsPage()
