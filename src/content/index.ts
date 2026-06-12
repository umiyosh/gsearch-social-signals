import { discoverSearchResults } from "./searchResults"
import { ensureStyles } from "./styles"
import { insertBadge, insertHnBadge } from "./badges"
import { requestEntryBookmarks, requestHatenaCounts, requestHnSummaries } from "./messaging"
import {
  beginOverlaySession,
  cancelOverlayHide,
  presentOverlay,
  scheduleOverlayHide
} from "./overlay"
import { createSignalPipeline } from "./signals"

const queueTargets = createSignalPipeline({
  requestHatenaCounts,
  requestHnSummaries,
  requestEntryBookmarks,
  insertBadge,
  insertHnBadge,
  beginOverlaySession,
  presentOverlay,
  scheduleOverlayHide,
  cancelOverlayHide
})

function scan(root: ParentNode = document): void {
  const targets = discoverSearchResults(root)
  if (targets.length) {
    queueTargets(targets)
  }
}

function boot(): void {
  ensureStyles()
  scan(document)

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement || node instanceof DocumentFragment) {
          scan(node)
        }
      })
    }
  })

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true })
  }
}

void boot()
